/**
 * The things that quietly go missing from a logged meal. Cooking oil, the
 * sauce, the drink alongside it. Each is a one-tap addition with a sensible
 * default amount the user can change.
 */
import type { NutritionSnapshot } from '@/types/domain'

export interface ExtraPreset {
  id: string
  name: string
  /** Default amount and what it is measured in. */
  quantity: number
  unit: string
  nutrition: NutritionSnapshot
  group: 'cooking' | 'condiment' | 'drink' | 'side'
}

const snap = (
  calories: number, protein: number, carbs: number, fat: number,
  extra: Partial<NutritionSnapshot> = {},
): NutritionSnapshot => ({
  calories_kcal: calories, protein_g: protein, carbs_g: carbs, fat_g: fat,
  fibre_g: null, micronutrients: {}, ...extra,
})

export const EXTRA_PRESETS: ExtraPreset[] = [
  { id: 'olive-oil', name: 'Olive oil', quantity: 1, unit: 'tbsp', group: 'cooking',
    nutrition: snap(119, 0, 0, 13.5, { micronutrients: { saturated_fat_g: 1.9 } }) },
  { id: 'butter', name: 'Butter', quantity: 1, unit: 'tbsp', group: 'cooking',
    nutrition: snap(102, 0.1, 0, 11.5, { micronutrients: { saturated_fat_g: 7.3 } }) },
  { id: 'ghee', name: 'Ghee', quantity: 1, unit: 'tbsp', group: 'cooking',
    nutrition: snap(123, 0, 0, 14, { micronutrients: { saturated_fat_g: 8.7 } }) },
  { id: 'sunflower-oil', name: 'Cooking oil', quantity: 1, unit: 'tbsp', group: 'cooking',
    nutrition: snap(124, 0, 0, 14) },
  { id: 'mayo', name: 'Mayonnaise', quantity: 1, unit: 'tbsp', group: 'condiment',
    nutrition: snap(94, 0.1, 0.1, 10.3) },
  { id: 'ketchup', name: 'Ketchup', quantity: 1, unit: 'tbsp', group: 'condiment',
    nutrition: snap(19, 0.2, 4.7, 0, { micronutrients: { sugar_g: 3.7, sodium_mg: 154 } }) },
  { id: 'soy-sauce', name: 'Soy sauce', quantity: 1, unit: 'tbsp', group: 'condiment',
    nutrition: snap(9, 1.3, 0.8, 0, { micronutrients: { sodium_mg: 879 } }) },
  { id: 'salad-dressing', name: 'Salad dressing', quantity: 2, unit: 'tbsp', group: 'condiment',
    nutrition: snap(145, 0.2, 2.4, 15) },
  { id: 'sugar', name: 'Sugar', quantity: 1, unit: 'tsp', group: 'condiment',
    nutrition: snap(16, 0, 4.2, 0, { micronutrients: { sugar_g: 4.2 } }) },
  { id: 'honey', name: 'Honey', quantity: 1, unit: 'tbsp', group: 'condiment',
    nutrition: snap(64, 0.1, 17.3, 0, { micronutrients: { sugar_g: 17.2 } }) },
  { id: 'milk-coffee', name: 'Milk in coffee', quantity: 50, unit: 'ml', group: 'drink',
    nutrition: snap(32, 1.7, 2.4, 1.8, { micronutrients: { calcium_mg: 62 } }) },
  { id: 'soft-drink', name: 'Soft drink', quantity: 330, unit: 'ml', group: 'drink',
    nutrition: snap(139, 0, 35, 0, { micronutrients: { sugar_g: 35 } }) },
  { id: 'orange-juice', name: 'Orange juice', quantity: 250, unit: 'ml', group: 'drink',
    nutrition: snap(112, 1.7, 25.8, 0.5, { fibre_g: 0.5, micronutrients: { sugar_g: 20.8, vitamin_c_mg: 124 } }) },
  { id: 'beer', name: 'Beer', quantity: 330, unit: 'ml', group: 'drink',
    nutrition: snap(142, 1.6, 12.6, 0) },
  { id: 'wine', name: 'Wine', quantity: 175, unit: 'ml', group: 'drink',
    nutrition: snap(147, 0.1, 4.6, 0) },
  { id: 'bread', name: 'Bread', quantity: 1, unit: 'slice', group: 'side',
    nutrition: snap(79, 2.7, 14.7, 1, { fibre_g: 0.8 }) },
  { id: 'rice', name: 'Cooked rice', quantity: 150, unit: 'g', group: 'side',
    nutrition: snap(195, 4.1, 42.2, 0.5, { fibre_g: 0.6 }) },
  { id: 'cheese', name: 'Cheese', quantity: 30, unit: 'g', group: 'side',
    nutrition: snap(120, 7.1, 0.4, 9.9, { micronutrients: { calcium_mg: 213, saturated_fat_g: 6.3 } }) },
]

export const EXTRA_GROUP_LABELS: Record<ExtraPreset['group'], string> = {
  cooking: 'Cooked with',
  condiment: 'On the side',
  drink: 'To drink',
  side: 'With it',
}
