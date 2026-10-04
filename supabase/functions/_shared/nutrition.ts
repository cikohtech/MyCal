/**
 * The nutrition block every estimate shares — photo or voice — and the clamp
 * that stands between what a model wrote and what reaches the review screen.
 */

export interface ModelNutrition {
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number | null
  micronutrients: Record<string, number>
}

/** Drops anything the model may have hallucinated outside a plausible range. */
export function sanitizeNutrition(input: ModelNutrition): ModelNutrition {
  const clamp = (value: unknown, max: number): number => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? Math.min(number, max) : 0
  }
  const micronutrients: Record<string, number> = {}
  for (const [key, value] of Object.entries(input?.micronutrients ?? {}) as [string, unknown][]) {
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

/**
 * The part of a whole that its listed parts do not already account for.
 *
 * Asked for a dish and its components, a model naturally reports the dish's
 * total and then the components again — and since the app adds a food's own
 * numbers to its parts', that counts the plate twice. So the model is asked
 * for the total, and the food's own share is worked out here: what is left
 * once the parts are taken away, never below zero.
 */
export function remainderAfterParts(total: ModelNutrition, parts: ModelNutrition[]): ModelNutrition {
  if (!parts.length) return total
  const sum = (pick: (n: ModelNutrition) => number) => parts.reduce((acc, part) => acc + pick(part), 0)
  const less = (value: number, taken: number) => Math.max(0, Math.round((value - taken) * 10) / 10)

  const partsFibre = parts.some((part) => part.fibre_g !== null)
    ? sum((part) => part.fibre_g ?? 0)
    : 0
  const micronutrients: Record<string, number> = {}
  for (const [key, value] of Object.entries(total.micronutrients)) {
    micronutrients[key] = less(value, sum((part) => part.micronutrients[key] ?? 0))
  }

  return {
    calories_kcal: less(total.calories_kcal, sum((part) => part.calories_kcal)),
    protein_g: less(total.protein_g, sum((part) => part.protein_g)),
    carbs_g: less(total.carbs_g, sum((part) => part.carbs_g)),
    fat_g: less(total.fat_g, sum((part) => part.fat_g)),
    fibre_g: total.fibre_g === null ? null : less(total.fibre_g, partsFibre),
    micronutrients,
  }
}

export const NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    calories_kcal: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
    fibre_g: { type: ['number', 'null'] },
    micronutrients: {
      type: 'object',
      description: 'Only nutrients you have grounds for. Omit the rest.',
      properties: {
        sodium_mg: { type: 'number' },
        potassium_mg: { type: 'number' },
        calcium_mg: { type: 'number' },
        iron_mg: { type: 'number' },
        magnesium_mg: { type: 'number' },
        zinc_mg: { type: 'number' },
        vitamin_a_mcg: { type: 'number' },
        vitamin_c_mg: { type: 'number' },
        vitamin_d_mcg: { type: 'number' },
        vitamin_e_mg: { type: 'number' },
        vitamin_k_mcg: { type: 'number' },
        vitamin_b6_mg: { type: 'number' },
        vitamin_b12_mcg: { type: 'number' },
        folate_mcg: { type: 'number' },
        sugar_g: { type: 'number' },
        saturated_fat_g: { type: 'number' },
        cholesterol_mg: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  required: ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'micronutrients'],
  additionalProperties: false,
} as const
