/**
 * Micronutrient presentation. Reference daily values are a display aid, not a
 * prescription — and a nutrient we don't have data for is shown as unknown,
 * never as zero.
 */
import type { Micronutrients, NutrientKey } from '@/types/domain'

export interface NutrientMeta {
  key: NutrientKey
  label: string
  unit: string
  /** Reference daily value for an adult, where a common one exists. */
  reference: number | null
  group: 'mineral' | 'vitamin' | 'other'
}

export const NUTRIENTS: NutrientMeta[] = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', reference: 2300, group: 'mineral' },
  { key: 'potassium_mg', label: 'Potassium', unit: 'mg', reference: 3500, group: 'mineral' },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg', reference: 1000, group: 'mineral' },
  { key: 'iron_mg', label: 'Iron', unit: 'mg', reference: 14, group: 'mineral' },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg', reference: 375, group: 'mineral' },
  { key: 'zinc_mg', label: 'Zinc', unit: 'mg', reference: 10, group: 'mineral' },
  { key: 'vitamin_a_mcg', label: 'Vitamin A', unit: 'µg', reference: 800, group: 'vitamin' },
  { key: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', reference: 80, group: 'vitamin' },
  { key: 'vitamin_d_mcg', label: 'Vitamin D', unit: 'µg', reference: 5, group: 'vitamin' },
  { key: 'vitamin_e_mg', label: 'Vitamin E', unit: 'mg', reference: 12, group: 'vitamin' },
  { key: 'vitamin_k_mcg', label: 'Vitamin K', unit: 'µg', reference: 75, group: 'vitamin' },
  { key: 'vitamin_b6_mg', label: 'Vitamin B6', unit: 'mg', reference: 1.4, group: 'vitamin' },
  { key: 'vitamin_b12_mcg', label: 'Vitamin B12', unit: 'µg', reference: 2.5, group: 'vitamin' },
  { key: 'folate_mcg', label: 'Folate', unit: 'µg', reference: 200, group: 'vitamin' },
  { key: 'sugar_g', label: 'Sugars', unit: 'g', reference: null, group: 'other' },
  { key: 'saturated_fat_g', label: 'Saturated fat', unit: 'g', reference: 20, group: 'other' },
  { key: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg', reference: 300, group: 'other' },
]

export const NUTRIENT_BY_KEY: Record<string, NutrientMeta> = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, n]),
)

export interface PresentNutrient extends NutrientMeta {
  amount: number
  /** Null when no reference value exists to compare against. */
  percentOfReference: number | null
}

/** Only nutrients actually present in the data — absence stays absence. */
export function presentNutrients(micros: Micronutrients): PresentNutrient[] {
  return NUTRIENTS.flatMap((meta) => {
    const amount = micros[meta.key]
    if (amount === undefined || amount === null) return []
    return [{
      ...meta,
      amount,
      percentOfReference: meta.reference ? Math.round((amount / meta.reference) * 100) : null,
    }]
  })
}

export function missingNutrientCount(micros: Micronutrients): number {
  return NUTRIENTS.filter((n) => micros[n.key] === undefined).length
}
