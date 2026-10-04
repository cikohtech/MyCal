/// <reference lib="deno.ns" />

/**
 * analyze-food-voice — what a person said they ate, turned into a draft.
 *
 * It takes a recording, or the same kind of description typed. A recording is
 * transcribed in memory and never stored: the bytes go from this request to
 * the transcription model and nowhere else, and only the words are kept. The
 * words are read by the configured AI provider into the same draft shape a
 * photo produces, recorded, and returned. Like the photo function, it never
 * writes a food entry — only the person reviewing the draft can do that.
 */
import { resolveTranscriber, resolveVisionClient } from '../_shared/ai.ts'
import {
  authenticate, corsHeaders, enforceRateLimit, envInt, json, logFailure, type Caller, type RateRule,
} from '../_shared/http.ts'
import { type ModelNutrition, remainderAfterParts, sanitizeNutrition } from '../_shared/nutrition.ts'
import {
  buildUserPrompt, OUTPUT_SCHEMA, SYSTEM_PROMPT, TRANSCRIPTION_PROMPT, withoutPromptEcho,
} from './prompt.ts'
import { MAX_TEXT_CHARS, readRequest } from './request.ts'

// Transcribing three minutes of speech takes seconds; reading a long, rambling
// description into a dozen foods is the slow half. Together they stay inside
// the platform's 150-second request ceiling.
const TRANSCRIBE_TIMEOUT_MS = 45_000
const READ_TIMEOUT_MS = 80_000

/**
 * The same shape as the photo limits, counted separately: a person who logs
 * by voice talks about every meal, and should not find their photos gone.
 */
const RATE_RULES: RateRule[] = [
  { scope: 'user', limit: envInt('VOICE_USER_PER_MINUTE', 6), windowSeconds: 60 },
  { scope: 'user', limit: envInt('VOICE_USER_PER_HOUR', 40), windowSeconds: 3600 },
  { scope: 'user', limit: envInt('VOICE_USER_PER_DAY', 120), windowSeconds: 86_400 },
  { scope: 'ip', limit: envInt('VOICE_IP_PER_MINUTE', 12), windowSeconds: 60 },
  { scope: 'ip', limit: envInt('VOICE_IP_PER_HOUR', 80), windowSeconds: 3600 },
  { scope: 'ip', limit: envInt('VOICE_IP_PER_DAY', 300), windowSeconds: 86_400 },
]

const MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

interface ModelResult {
  notes: string | null
  failure_code: string | null
  day: string | null
  foods: {
    name: string
    said: string | null
    meal: string | null
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

function failed(code: string, status = 200, extra: Record<string, unknown> = {}) {
  return json(
    {
      status: 'failed', analysis_id: null, model: null, notes: null, foods: [],
      failure_code: code, transcript: null, day: 'today', ...extra,
    },
    status,
  )
}

/** "Sunday 4 October 2026 at 13:05" as the person's own clock reads it. */
function localTimeIn(timezone: string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timezone ?? 'UTC' }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date())
  }
}

/** One voice log from the caller's plan — the photo function's claim, for talking. */
async function claimVoiceLog(caller: Caller): Promise<{ allowed: boolean; claimed: boolean }> {
  try {
    const { data, error } = await caller.asService
      .rpc('claim_voice_log', { p_user_id: caller.userId })
    if (error) throw new Error(error.message)
    const verdict = Array.isArray(data) ? data[0] : data
    if (!verdict) return { allowed: true, claimed: false }
    return { allowed: Boolean(verdict.allowed), claimed: Boolean(verdict.allowed) }
  } catch (error) {
    // Unreachable plan table: let it through, as photos do. The rate limits
    // still bound the cost, and paying customers keep the feature.
    logFailure('analyze-food-voice/plan', error)
    return { allowed: true, claimed: false }
  }
}

/** Never throws — it runs from inside the error handler. */
async function refundVoiceLog(caller: Caller): Promise<void> {
  try {
    const { error } = await caller.asService
      .rpc('refund_voice_log', { p_user_id: caller.userId })
    if (error) throw new Error(error.message)
  } catch (error) {
    logFailure('analyze-food-voice/refund', error)
  }
}

let counter = 0
const tempId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`

function totalCalories(food: { nutrition: ModelNutrition; ingredients: { nutrition: ModelNutrition }[] }) {
  return food.ingredients.reduce((sum, part) => sum + part.nutrition.calories_kcal, food.nutrition.calories_kcal)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return failed('bad_request', 405)

  const caller = await authenticate(request)
  if (!caller) return json({ error: 'Not signed in.' }, 401)

  const parsedRequest = await readRequest(request)
  if ('error' in parsedRequest) return failed(parsedRequest.error, parsedRequest.status ?? 200)
  const { input, idempotencyKey, timezone, units } = parsedRequest
  // A transcript sent back for a retry was still spoken, and reads that way.
  const spoken = input.kind === 'voice' || input.transcribed

  // Same contract as photos: a key already answered is handed back for free,
  // ahead of the quota, so a reload never costs a second reading.
  if (idempotencyKey) {
    const { data: previous } = await caller.asUser
      .from('ai_analyses')
      .select('id, result')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (previous?.result) {
      return json({ ...previous.result, analysis_id: previous.id })
    }
  }

  const quota = await enforceRateLimit(caller, request, 'voice', RATE_RULES)
  if (!quota.ok) {
    return failed('rate_limited', 200, {
      retry_after_seconds: quota.retryAfterSeconds,
      limited_scope: quota.scope,
    })
  }

  const reader = resolveVisionClient()
  if (!reader) return failed('no_analysis_service')
  const transcriber = input.kind === 'voice' ? resolveTranscriber() : null
  if (input.kind === 'voice' && !transcriber) return failed('no_transcription_service')

  // Last of the checks, so nothing turned away above spends a free log.
  const plan = await claimVoiceLog(caller)
  if (!plan.allowed) return failed('free_limit_reached')

  const { data: analysis } = await caller.asService
    .from('ai_analyses')
    .insert({
      user_id: caller.userId,
      food_image_id: null,
      input_kind: spoken ? 'voice' : 'text',
      status: 'processing',
      model: reader.model,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  const analysisId = analysis?.id ?? null
  let transcript: string | null = input.kind === 'text' ? input.text : null
  let transcriptionModel: string | null = null

  const finish = async (payload: Record<string, unknown>, status: string, code: string | null) => {
    if (status === 'failed' && plan.claimed) await refundVoiceLog(caller)
    // The transcript travels with every answer, failures included: it is
    // what lets the person see what was heard, and lets a retry skip the
    // transcription it already paid for.
    const result = {
      model: reader.model,
      transcription_model: transcriptionModel,
      input_kind: spoken ? 'voice' : 'text',
      transcript,
      day: 'today',
      ...payload,
    }
    if (analysisId) {
      await caller.asService
        .from('ai_analyses')
        .update({ status, result, failure_code: code })
        .eq('id', analysisId)
    }
    return json({ ...result, analysis_id: analysisId })
  }

  const failure = (code: string, notes: string | null = null) =>
    finish({ status: 'failed', notes, foods: [], failure_code: code }, 'failed', code)

  try {
    if (input.kind === 'voice') {
      const heard = await transcriber!.transcribe({
        audio: input.audio,
        mimeType: input.mimeType,
        filename: `voice.${input.extension}`,
        prompt: TRANSCRIPTION_PROMPT,
        timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      })
      transcriptionModel = heard.model
      transcript = withoutPromptEcho(heard.text).slice(0, MAX_TEXT_CHARS) || null
      if (!transcript) return await failure('no_speech')
    }

    const response = await reader.analyze({
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(transcript!, {
        localTime: localTimeIn(timezone),
        timezone,
        units,
        typed: !spoken,
      }),
      schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'food_voice_estimate',
      maxOutputTokens: 16000,
      timeoutMs: READ_TIMEOUT_MS,
    })

    if (response.refused) return await failure('no_food_mentioned')
    if (!response.text) throw new Error('empty model response')
    const parsed = JSON.parse(response.text) as ModelResult
    const notes = typeof parsed.notes === 'string' && parsed.notes.trim()
      ? parsed.notes.trim().slice(0, 600)
      : null

    const foods = (parsed.foods ?? [])
      .map((food) => {
        const ingredients = (food.ingredients ?? [])
          .filter((part) => String(part.name ?? '').trim())
          .map((part) => ({
            temp_id: tempId('part'),
            kind: 'ingredient' as const,
            name: String(part.name).trim().slice(0, 160),
            quantity: part.quantity === null ? null : Number(part.quantity) || null,
            quantity_unit: part.quantity_unit ? String(part.quantity_unit).slice(0, 24) : null,
            nutrition: sanitizeNutrition(part.nutrition),
          }))
        return {
          temp_id: tempId('food'),
          name: String(food.name ?? '').trim().slice(0, 160),
          quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1,
          quantity_unit: String(food.quantity_unit ?? 'serving').trim().slice(0, 24) || 'serving',
          confidence: Math.min(1, Math.max(0, Number(food.confidence) || 0)),
          matched_reference_id: null,
          // Heard, not measured: an estimate all the way to the review screen.
          provenance: 'estimate' as const,
          meal: MEALS.has(String(food.meal)) ? String(food.meal) : null,
          said: typeof food.said === 'string' && food.said.trim() ? food.said.trim().slice(0, 160) : null,
          // The model reports the whole dish; the food keeps only what its
          // listed parts do not, so the review adds up to the dish once.
          nutrition: remainderAfterParts(
            sanitizeNutrition(food.nutrition), ingredients.map((part) => part.nutrition),
          ),
          ingredients,
        }
      })
      // A nameless entry cannot be reviewed, and one worth nothing at all is
      // water that slipped past the prompt — the save would refuse it anyway.
      .filter((food) => food.name && totalCalories(food) > 0)

    if (parsed.failure_code || !foods.length) {
      const code = parsed.failure_code === 'unclear_speech' ? 'unclear_speech' : 'no_food_mentioned'
      return await failure(code, notes)
    }

    const lowConfidence = foods.some((food) => food.confidence < 0.55)

    return await finish(
      {
        status: lowConfidence ? 'needs_review' : 'ready',
        notes,
        foods,
        failure_code: null,
        day: parsed.day === 'yesterday' ? 'yesterday' : 'today',
      },
      'ready', null,
    )
  } catch (error) {
    logFailure('analyze-food-voice', error)
    const message = error instanceof Error ? error.message : ''
    const status = (error as { status?: number })?.status
    // The provider could not decode the recording — a codec it does not take,
    // or a file cut short. Saying so beats a generic "try again later".
    const code = /timeout|abort/i.test(message)
      ? 'timeout'
      : status === 400 && /audio|file|format|decode/i.test(message)
        ? 'unsupported_audio'
        : 'service_unavailable'
    return await failure(code)
  }
})
