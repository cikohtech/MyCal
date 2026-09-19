/// <reference lib="deno.ns" />

/**
 * lookup-barcode — cache first, provider second.
 *
 * Checks our own food_references table before calling Open Food Facts, caches
 * what comes back with its retrieval time, and returns an editable draft. A
 * lookup is never an intake entry; only the user's explicit save creates one.
 */
import {
  authenticate, corsHeaders, enforceRateLimit, envInt, json, logFailure, type RateRule,
} from '../_shared/http.ts'

const PROVIDER = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = [
  'code', 'product_name', 'brands', 'quantity', 'serving_size',
  'serving_quantity', 'nutriments',
].join(',')
// Cheaper than the model, but it still leaves our User-Agent on somebody
// else's free API, so the same two-sided limit applies.
const RATE_RULES: RateRule[] = [
  { scope: 'user', limit: envInt('BARCODE_USER_PER_MINUTE', 30), windowSeconds: 60 },
  { scope: 'user', limit: envInt('BARCODE_USER_PER_HOUR', 300), windowSeconds: 3600 },
  { scope: 'ip', limit: envInt('BARCODE_IP_PER_MINUTE', 60), windowSeconds: 60 },
  { scope: 'ip', limit: envInt('BARCODE_IP_PER_HOUR', 600), windowSeconds: 3600 },
]
const PROVIDER_TIMEOUT_MS = 8000
// Packaging and panels change; anything older than this is re-fetched.
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type Nutriments = Record<string, number | string | undefined>

function num(nutriments: Nutriments, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = nutriments[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function mapNutriments(nutriments: Nutriments) {
  const micronutrients: Record<string, number> = {}
  const put = (key: string, value: number | undefined, scale = 1) => {
    if (value !== undefined) micronutrients[key] = value * scale
  }

  put('sodium_mg', num(nutriments, 'sodium_100g'), 1000)
  put('potassium_mg', num(nutriments, 'potassium_100g'), 1000)
  put('calcium_mg', num(nutriments, 'calcium_100g'), 1000)
  put('iron_mg', num(nutriments, 'iron_100g'), 1000)
  put('magnesium_mg', num(nutriments, 'magnesium_100g'), 1000)
  put('zinc_mg', num(nutriments, 'zinc_100g'), 1000)
  put('vitamin_a_mcg', num(nutriments, 'vitamin-a_100g'), 1_000_000)
  put('vitamin_c_mg', num(nutriments, 'vitamin-c_100g'), 1000)
  put('vitamin_d_mcg', num(nutriments, 'vitamin-d_100g'), 1_000_000)
  put('vitamin_e_mg', num(nutriments, 'vitamin-e_100g'), 1000)
  put('vitamin_k_mcg', num(nutriments, 'vitamin-k_100g'), 1_000_000)
  put('vitamin_b6_mg', num(nutriments, 'vitamin-b6_100g'), 1000)
  put('vitamin_b12_mcg', num(nutriments, 'vitamin-b12_100g'), 1_000_000)
  put('folate_mcg', num(nutriments, 'folates_100g', 'vitamin-b9_100g'), 1_000_000)
  put('sugar_g', num(nutriments, 'sugars_100g'))
  put('saturated_fat_g', num(nutriments, 'saturated-fat_100g'))
  put('cholesterol_mg', num(nutriments, 'cholesterol_100g'), 1000)

  const kcal = num(nutriments, 'energy-kcal_100g')
    ?? (num(nutriments, 'energy_100g') !== undefined
      ? num(nutriments, 'energy_100g')! / 4.184
      : undefined)

  return {
    hasEnergy: kcal !== undefined,
    nutrients: {
      calories_kcal: Math.round(kcal ?? 0),
      protein_g: num(nutriments, 'proteins_100g') ?? 0,
      carbs_g: num(nutriments, 'carbohydrates_100g') ?? 0,
      fat_g: num(nutriments, 'fat_100g') ?? 0,
      fibre_g: num(nutriments, 'fiber_100g') ?? null,
      micronutrients,
    },
  }
}

/** EAN/UPC check digit — rejects a mistyped code before it reaches a provider. */
function isPlausibleBarcode(code: string): boolean {
  if (![8, 12, 13, 14].includes(code.length)) return false
  const values = code.split('').map(Number)
  const check = values.pop()!
  const sum = values.reverse()
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

const notFound = (barcode: string, message: string) =>
  json({ status: 'not_found', barcode, reference: null, message })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const caller = await authenticate(request)
  if (!caller) return json({ error: 'Not signed in.' }, 401)

  const quota = await enforceRateLimit(caller, request, 'barcode', RATE_RULES)
  if (!quota.ok) {
    return notFound('', `Too many lookups in a row. Try again in ${quota.retryAfterSeconds}s, or enter the label by hand.`)
  }

  let barcode: string
  try {
    const body = await request.json()
    barcode = String(body?.barcode ?? '').replace(/\D/g, '')
  } catch {
    return json({ error: 'Send a barcode.' }, 400)
  }

  if (!isPlausibleBarcode(barcode)) {
    return notFound(barcode, 'That is not a valid UPC or EAN number. Check the digits under the bars.')
  }

  const { data: cached } = await caller.asUser
    .from('food_references')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle()

  if (cached && Date.now() - Date.parse(cached.retrieved_at) < CACHE_MAX_AGE_MS) {
    return json({ status: 'found', barcode, reference: cached, message: null })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
    const response = await fetch(`${PROVIDER}/${barcode}?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MyCal/0.1 (nutrition PWA)' },
    })
    clearTimeout(timer)

    if (response.status === 404) {
      // A stale cached row still beats nothing when the product has since been
      // removed upstream.
      if (cached) return json({ status: 'found', barcode, reference: cached, message: null })
      return notFound(barcode, 'No product matches this barcode.')
    }
    if (!response.ok) throw new Error(`provider responded ${response.status}`)

    const payload = await response.json()
    const product = payload?.product
    if (!product || payload?.status === 0) {
      if (cached) return json({ status: 'found', barcode, reference: cached, message: null })
      return notFound(barcode, 'No product matches this barcode.')
    }

    const mapped = mapNutriments((product.nutriments ?? {}) as Nutriments)
    if (!mapped.hasEnergy) {
      return notFound(
        barcode,
        'This product is in the database but has no nutrition panel recorded. Enter the label by hand.',
      )
    }

    const servingQuantity = Number(product.serving_quantity)
    const record = {
      source: 'openfoodfacts',
      external_id: barcode,
      name: String(product.product_name || 'Unnamed product').slice(0, 200),
      brand: String(product.brands ?? '').split(',')[0]?.trim() || null,
      barcode,
      serving_description: product.serving_size ? String(product.serving_size).slice(0, 80) : null,
      serving_grams: Number.isFinite(servingQuantity) && servingQuantity > 0 ? servingQuantity : null,
      nutrients_per_100g: mapped.nutrients,
      retrieved_at: new Date().toISOString(),
    }

    // Writing to the shared cache is a privileged operation, so it happens
    // under the service role after the caller was verified.
    const { data: saved, error } = await caller.asService
      .from('food_references')
      .upsert(record, { onConflict: 'barcode' })
      .select()
      .single()

    if (error) throw error
    return json({ status: 'found', barcode, reference: saved, message: null })
  } catch (error) {
    logFailure('lookup-barcode', error)
    if (cached) return json({ status: 'found', barcode, reference: cached, message: null })
    return notFound(
      barcode,
      'Could not reach the product database. Check your connection, or enter the label by hand.',
    )
  }
})
