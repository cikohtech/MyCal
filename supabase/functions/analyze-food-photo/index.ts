/// <reference lib="deno.ns" />

/**
 * analyze-food-photo — the only path between a user's private meal photo and
 * an AI provider.
 *
 * It verifies the caller, verifies they own the image, reads the bytes itself
 * (so no third party ever receives a URL into our storage), asks the configured
 * AI provider for a structured estimate, records the analysis, and returns a draft. It never
 * writes a food entry: only the person reviewing the draft can do that.
 */
import { resolveVisionClient } from '../_shared/ai.ts'
import { authenticate, corsHeaders, json, logFailure, withinRateLimit } from '../_shared/http.ts'
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from './prompt.ts'

const BUCKET = 'food-images'
const SIGNED_URL_TTL_SECONDS = 120
// A full plate broken into components measured 13-36s against gpt-5.5, so the
// ceiling is set well above that: it is there to end a hung call, not a slow one.
const ANALYSIS_TIMEOUT_MS = 90_000
const RATE_LIMIT = { calls: 12, windowMs: 60_000 }

interface RequestBody {
  food_image_id?: string
  idempotency_key?: string
}

interface ModelNutrition {
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number | null
  micronutrients: Record<string, number>
}

interface ModelResult {
  notes: string | null
  failure_code: string | null
  foods: {
    name: string
    quantity: number
    quantity_unit: string
    confidence: number
    nutrition: ModelNutrition
    ingredients: {
      name: string
      quantity: number | null
      quantity_unit: string | null
      nutrition: ModelNutrition
    }[]
  }[]
}

function failed(code: string, status = 200) {
  return json(
    { status: 'failed', analysis_id: null, model: null, notes: null, foods: [], failure_code: code },
    status,
  )
}

let counter = 0
const tempId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`

/** Drops anything the model may have hallucinated outside a plausible range. */
function sanitizeNutrition(input: ModelNutrition): ModelNutrition {
  const clamp = (value: unknown, max: number): number => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? Math.min(number, max) : 0
  }
  const micronutrients: Record<string, number> = {}
  for (const [key, value] of Object.entries(input?.micronutrients ?? {})) {
    // A null is the model saying "unknown"; only a real reading gets recorded.
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (Number.isFinite(number) && number >= 0) micronutrients[key] = number
  }
  return {
    calories_kcal: clamp(input?.calories_kcal, 5000),
    protein_g: clamp(input?.protein_g, 500),
    carbs_g: clamp(input?.carbs_g, 1000),
    fat_g: clamp(input?.fat_g, 500),
    fibre_g:
      input?.fibre_g === null || input?.fibre_g === undefined
        ? null
        : clamp(input.fibre_g, 200),
    micronutrients,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return failed('bad_request', 405)

  const caller = await authenticate(request)
  if (!caller) return json({ error: 'Not signed in.' }, 401)

  if (!withinRateLimit(caller.userId, RATE_LIMIT.calls, RATE_LIMIT.windowMs)) {
    return failed('rate_limited')
  }

  // Whichever provider key is in the function's secrets decides this.
  const ai = resolveVisionClient()
  if (!ai) return failed('no_analysis_service')

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return failed('bad_request', 400)
  }
  if (!body.food_image_id) return failed('bad_request', 400)

  // Reading as the caller means RLS decides ownership, not our own comparison.
  const { data: image, error: imageError } = await caller.asUser
    .from('food_images')
    .select('id, user_id, storage_path, mime_type, status')
    .eq('id', body.food_image_id)
    .maybeSingle()

  if (imageError || !image) return json({ error: 'That photo does not exist.' }, 404)
  if (image.status === 'deleted') return failed('unclear_image')

  // A repeated request for the same key returns the original analysis rather
  // than paying for a second one.
  if (body.idempotency_key) {
    const { data: previous } = await caller.asUser
      .from('ai_analyses')
      .select('id, status, model, result, failure_code')
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()
    if (previous?.result) {
      return json({ ...previous.result, analysis_id: previous.id })
    }
  }

  const { data: analysis } = await caller.asService
    .from('ai_analyses')
    .insert({
      user_id: caller.userId,
      food_image_id: image.id,
      status: 'processing',
      model: ai.model,
      idempotency_key: body.idempotency_key ?? null,
    })
    .select('id')
    .single()

  const analysisId = analysis?.id ?? null

  const finish = async (payload: Record<string, unknown>, status: string, code: string | null) => {
    if (analysisId) {
      await caller.asService
        .from('ai_analyses')
        .update({ status, result: payload, failure_code: code })
        .eq('id', analysisId)
    }
    return json({ ...payload, analysis_id: analysisId })
  }

  try {
    // Short-lived, service-side only: the bytes are fetched here and the URL
    // is never handed to the provider.
    const { data: signed, error: signError } = await caller.asService.storage
      .from(BUCKET)
      .createSignedUrl(image.storage_path, SIGNED_URL_TTL_SECONDS)
    if (signError || !signed?.signedUrl) throw new Error('could not read the stored image')

    const imageResponse = await fetch(signed.signedUrl)
    if (!imageResponse.ok) throw new Error('could not download the stored image')
    const bytes = new Uint8Array(await imageResponse.arrayBuffer())

    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    const base64 = btoa(binary)

    const response = await ai.analyze({
      system: SYSTEM_PROMPT,
      prompt: 'Estimate what is on this plate.',
      imageBase64: base64,
      mimeType: image.mime_type ?? 'image/jpeg',
      schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'food_photo_estimate',
      maxOutputTokens: 16000,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    })

    if (response.refused) {
      return await finish(
        { status: 'failed', model: ai.model, notes: null, foods: [], failure_code: 'no_food_detected' },
        'failed', 'no_food_detected',
      )
    }

    if (!response.text) throw new Error('empty model response')
    const parsed = JSON.parse(response.text) as ModelResult

    if (parsed.failure_code || !parsed.foods?.length) {
      const code = parsed.failure_code ?? 'no_food_detected'
      return await finish(
        { status: 'failed', model: ai.model, notes: parsed.notes ?? null, foods: [], failure_code: code },
        'failed', code,
      )
    }

    const foods = parsed.foods.map((food) => ({
      temp_id: tempId('food'),
      name: String(food.name ?? '').slice(0, 160),
      quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1,
      quantity_unit: String(food.quantity_unit ?? 'serving').slice(0, 24),
      confidence: Math.min(1, Math.max(0, Number(food.confidence) || 0)),
      matched_reference_id: null,
      // Nothing here was read off a label or matched to a database, so it is
      // labelled as an estimate all the way to the review screen.
      provenance: 'estimate' as const,
      nutrition: sanitizeNutrition(food.nutrition),
      ingredients: (food.ingredients ?? []).map((part) => ({
        temp_id: tempId('part'),
        kind: 'ingredient' as const,
        name: String(part.name ?? '').slice(0, 160),
        quantity: part.quantity === null ? null : Number(part.quantity) || null,
        quantity_unit: part.quantity_unit ? String(part.quantity_unit).slice(0, 24) : null,
        nutrition: sanitizeNutrition(part.nutrition),
      })),
    }))

    const lowConfidence = foods.some((food) => food.confidence < 0.55)

    return await finish(
      {
        status: lowConfidence ? 'needs_review' : 'ready',
        model: ai.model,
        notes: parsed.notes ?? null,
        foods,
        failure_code: null,
      },
      'ready', null,
    )
  } catch (error) {
    logFailure('analyze-food-photo', error)
    const timedOut = error instanceof Error && /timeout|abort/i.test(error.message)
    const code = timedOut ? 'timeout' : 'service_unavailable'
    return await finish(
      { status: 'failed', model: ai.model, notes: null, foods: [], failure_code: code },
      'failed', code,
    )
  }
})
