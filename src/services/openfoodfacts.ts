/**
 * Open Food Facts product lookup. Used directly by the on-device store; the
 * Supabase deployment routes the same lookup through an edge function so the
 * result can be cached and rate limited server-side.
 */
import type { BarcodeDraft, FoodReference, Micronutrients } from '@/types/domain'
import { uuid } from '@/lib/id'

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = [
  'code', 'product_name', 'brands', 'quantity', 'serving_size',
  'serving_quantity', 'nutriments', 'image_front_small_url',
].join(',')

type Nutriments = Record<string, number | string | undefined>

function num(nutriments: Nutriments, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const value = nutriments[k]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

/** Maps the provider's fields into our schema. Anything absent stays absent. */
export function mapNutriments(nutriments: Nutriments) {
  const micronutrients: Micronutrients = {}
  const put = (key: keyof Micronutrients, value: number | undefined, scale = 1) => {
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
    calories_kcal: Math.round(kcal ?? 0),
    protein_g: num(nutriments, 'proteins_100g') ?? 0,
    carbs_g: num(nutriments, 'carbohydrates_100g') ?? 0,
    fat_g: num(nutriments, 'fat_100g') ?? 0,
    fibre_g: num(nutriments, 'fiber_100g') ?? null,
    micronutrients,
    hasEnergy: kcal !== undefined,
  }
}

export async function lookupOpenFoodFacts(
  barcode: string, fetchImpl: typeof fetch = fetch,
): Promise<BarcodeDraft> {
  const code = barcode.replace(/\D/g, '')
  if (code.length < 8) {
    return { status: 'not_found', barcode, reference: null, message: 'That code is too short to be a product barcode.' }
  }

  let payload: { status?: number; product?: Record<string, unknown> }
  try {
    const response = await fetchImpl(`${ENDPOINT}/${code}?fields=${FIELDS}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyCal/0.1 (nutrition PWA)' },
    })
    if (response.status === 404) {
      return { status: 'not_found', barcode: code, reference: null, message: 'No product matches this barcode.' }
    }
    if (!response.ok) throw new Error(`Provider responded ${response.status}`)
    payload = await response.json()
  } catch {
    return {
      status: 'not_found', barcode: code, reference: null,
      message: 'Could not reach the product database. Check your connection, or enter the label by hand.',
    }
  }

  const product = payload.product as Record<string, unknown> | undefined
  if (!product || payload.status === 0) {
    return { status: 'not_found', barcode: code, reference: null, message: 'No product matches this barcode.' }
  }

  const mapped = mapNutriments((product.nutriments ?? {}) as Nutriments)
  if (!mapped.hasEnergy) {
    return {
      status: 'not_found', barcode: code, reference: null,
      message: 'This product is in the database but has no nutrition panel recorded. Enter the label by hand.',
    }
  }

  const name = (product.product_name as string) || 'Unnamed product'
  const servingQuantity = Number(product.serving_quantity)

  const reference: FoodReference = {
    id: uuid(),
    source: 'openfoodfacts',
    external_id: code,
    name,
    brand: ((product.brands as string) || '').split(',')[0]?.trim() || null,
    barcode: code,
    serving_description: (product.serving_size as string) || null,
    serving_grams: Number.isFinite(servingQuantity) && servingQuantity > 0 ? servingQuantity : null,
    nutrients_per_100g: {
      calories_kcal: mapped.calories_kcal,
      protein_g: mapped.protein_g,
      carbs_g: mapped.carbs_g,
      fat_g: mapped.fat_g,
      fibre_g: mapped.fibre_g,
      micronutrients: mapped.micronutrients,
    },
    retrieved_at: new Date().toISOString(),
  }

  return { status: 'found', barcode: code, reference, message: null }
}
