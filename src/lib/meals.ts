import type { MealType } from '@/types/domain'

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'unassigned']

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
  unassigned: 'Not in a meal',
}

export const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'var(--color-meal-breakfast)',
  lunch: 'var(--color-meal-lunch)',
  dinner: 'var(--color-meal-dinner)',
  snack: 'var(--color-meal-snack)',
  unassigned: 'var(--color-meal-unassigned)',
}

/** The meal a person is most likely to be logging at this hour. */
export function suggestMeal(date: Date = new Date()): MealType {
  const hour = date.getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 18) return 'snack'
  if (hour < 22) return 'dinner'
  return 'snack'
}
