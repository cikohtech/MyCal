/**
 * Pure nutrition mathematics. No I/O, no framework. Everything the app
 * claims about a user's body or their day is computed here and nowhere else,
 * so it can be tested directly.
 */
import type {
  ActivityLevel, DailyTotals, FoodEntry, Goal, IsoDate, Micronutrients,
  NutritionSnapshot, NutrientKey, SexForBmr,
} from '@/types/domain'

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
}

export const ACTIVITY_LABELS: Record<ActivityLevel, { title: string; detail: string }> = {
  sedentary: { title: 'Mostly sitting', detail: 'Desk work, little deliberate exercise' },
  light: { title: 'Lightly active', detail: 'Light exercise 1–3 days a week' },
  moderate: { title: 'Moderately active', detail: 'Moderate exercise 3–5 days a week' },
  very: { title: 'Very active', detail: 'Hard exercise 6–7 days a week' },
  extra: { title: 'Extremely active', detail: 'Physical job or twice-daily training' },
}

export const GOAL_LABELS: Record<Goal, { title: string; detail: string }> = {
  lose: { title: 'Lose weight', detail: '500 kcal below your estimated burn' },
  maintain: { title: 'Stay where I am', detail: 'Matched to your estimated burn' },
  gain: { title: 'Gain weight', detail: '250 kcal above your estimated burn' },
}

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const
/** Coarse planning heuristic only. Real weight change is not linear. */
export const KCAL_PER_KG_BODY_MASS = 7700

export function round(value: number, places = 0): number {
  const f = 10 ** places
  return Math.round(value * f) / f
}

/** BMI is a screening number, not a verdict. */
export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  if (m <= 0) return 0
  return round(weightKg / (m * m), 1)
}

export const BMI_BANDS = [
  { max: 18.5, label: 'Below the typical range' },
  { max: 25, label: 'In the typical range' },
  { max: 30, label: 'Above the typical range' },
  { max: Infinity, label: 'Well above the typical range' },
]

export function bmiBand(bmi: number): string {
  return BMI_BANDS.find((b) => bmi < b.max)!.label
}

/**
 * Mifflin–St Jeor. Returns null when no sex-specific constant applies —
 * the caller must then ask for a user-chosen target rather than guessing.
 */
export function calcBmr(
  sex: SexForBmr, weightKg: number, heightCm: number, age: number,
): number | null {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return round(base + 5)
  if (sex === 'female') return round(base - 161)
  return null
}

export function calcTdee(bmrKcal: number, activity: ActivityLevel): number {
  return round(bmrKcal * ACTIVITY_MULTIPLIERS[activity])
}

export function calcCalorieTarget(tdeeKcal: number, goal: Goal): number {
  if (goal === 'lose') return Math.max(1200, round(tdeeKcal - 500))
  if (goal === 'gain') return round(tdeeKcal + 250)
  return round(tdeeKcal)
}

export interface MacroTargets {
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number
}

/**
 * Protein 1.6 g/kg, fat 25% of calories, carbohydrate takes the remainder.
 * Fibre follows the common 14 g per 1000 kcal reference.
 */
export function calcMacroTargets(calorieTarget: number, weightKg: number): MacroTargets {
  const protein_g = round(1.6 * weightKg)
  const fat_g = round((calorieTarget * 0.25) / KCAL_PER_G.fat)
  const remaining = calorieTarget - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat
  const carbs_g = Math.max(0, round(remaining / KCAL_PER_G.carbs))
  const fibre_g = round((calorieTarget / 1000) * 14)
  return { protein_g, carbs_g, fat_g, fibre_g }
}

export interface TargetInputs {
  age: number
  sex_for_bmr: SexForBmr
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
  goal: Goal
  /** Required when sex_for_bmr is 'unspecified'. */
  custom_calorie_target?: number | null
}

export interface TargetResult {
  bmi: number
  bmr_kcal: number | null
  tdee_kcal: number | null
  calorie_target_kcal: number
  macros: MacroTargets
  /** True when the calorie target came from the user rather than the equation. */
  needs_custom_target: boolean
}

export function buildTarget(input: TargetInputs): TargetResult {
  const bmi = calcBmi(input.weight_kg, input.height_cm)
  const bmr = calcBmr(input.sex_for_bmr, input.weight_kg, input.height_cm, input.age)

  if (bmr === null) {
    const custom = input.custom_calorie_target ?? 0
    return {
      bmi,
      bmr_kcal: null,
      tdee_kcal: null,
      calorie_target_kcal: custom,
      macros: calcMacroTargets(custom, input.weight_kg),
      needs_custom_target: true,
    }
  }

  const tdee = calcTdee(bmr, input.activity_level)
  const calorieTarget = input.custom_calorie_target ?? calcCalorieTarget(tdee, input.goal)
  return {
    bmi,
    bmr_kcal: bmr,
    tdee_kcal: tdee,
    calorie_target_kcal: calorieTarget,
    macros: calcMacroTargets(calorieTarget, input.weight_kg),
    needs_custom_target: false,
  }
}

/* ---------------------------- nutrient arithmetic ---------------------------- */

export const EMPTY_SNAPSHOT: NutritionSnapshot = {
  calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: null, micronutrients: {},
}

/**
 * Adds two snapshots. Absent micronutrients stay absent; a value present on
 * only one side survives as that value rather than being halved or zeroed.
 */
export function addSnapshots(a: NutritionSnapshot, b: NutritionSnapshot): NutritionSnapshot {
  const micronutrients: Micronutrients = { ...a.micronutrients }
  for (const [key, value] of Object.entries(b.micronutrients) as [NutrientKey, number][]) {
    if (value === undefined || value === null) continue
    micronutrients[key] = (micronutrients[key] ?? 0) + value
  }
  const fibre =
    a.fibre_g === null && b.fibre_g === null ? null : (a.fibre_g ?? 0) + (b.fibre_g ?? 0)

  return {
    calories_kcal: a.calories_kcal + b.calories_kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fibre_g: fibre,
    micronutrients,
  }
}

/** Scales a snapshot — used to go from a per-100 g reference to a real portion. */
export function scaleSnapshot(s: NutritionSnapshot, factor: number): NutritionSnapshot {
  const micronutrients: Micronutrients = {}
  for (const [key, value] of Object.entries(s.micronutrients) as [NutrientKey, number][]) {
    if (value === undefined || value === null) continue
    micronutrients[key] = round(value * factor, 3)
  }
  return {
    calories_kcal: round(s.calories_kcal * factor, 1),
    protein_g: round(s.protein_g * factor, 1),
    carbs_g: round(s.carbs_g * factor, 1),
    fat_g: round(s.fat_g * factor, 1),
    fibre_g: s.fibre_g === null ? null : round(s.fibre_g * factor, 1),
    micronutrients,
  }
}

/** An entry's true contribution is itself plus every part the user attached. */
export function entryTotal(entry: FoodEntry): NutritionSnapshot {
  return (entry.parts ?? []).reduce(
    (acc, part) => addSnapshots(acc, part.nutrition_snapshot),
    entry.nutrition_snapshot,
  )
}

export function sumDay(entries: FoodEntry[], consumedOn: IsoDate): DailyTotals {
  const total = entries.reduce<NutritionSnapshot>(
    (acc, e) => addSnapshots(acc, entryTotal(e)),
    EMPTY_SNAPSHOT,
  )
  const micronutrients: Micronutrients = {}
  for (const [key, value] of Object.entries(total.micronutrients) as [NutrientKey, number][]) {
    micronutrients[key] = round(value, 2)
  }
  return {
    consumed_on: consumedOn,
    calories_kcal: round(total.calories_kcal),
    protein_g: round(total.protein_g, 1),
    carbs_g: round(total.carbs_g, 1),
    fat_g: round(total.fat_g, 1),
    fibre_g: total.fibre_g === null ? null : round(total.fibre_g, 1),
    micronutrients,
    entry_count: entries.length,
  }
}

/** Energy implied by the macros, used to sanity-check a hand-edited entry. */
export function caloriesFromMacros(protein: number, carbs: number, fat: number): number {
  return round(
    protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat,
  )
}

/* ------------------------------- weight trend ------------------------------- */

export interface TrendPoint { recorded_on: IsoDate; weight_kg: number }

export interface WeightTrend {
  /** Null when there are too few observations to say anything honest. */
  slope_kg_per_week: number | null
  smoothed: TrendPoint[]
  latest_kg: number | null
  change_kg: number | null
  span_days: number
}

const MIN_TREND_POINTS = 4

/**
 * Least-squares slope over raw measurements, plus a centred rolling mean for
 * display — centred rather than trailing so the line sits through the points
 * it describes instead of lagging above them. Returns nulls rather than a
 * confident-looking line when the data cannot support one.
 */
export function calcWeightTrend(entries: TrendPoint[], window = 5): WeightTrend {
  const sorted = [...entries].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
  const latest = sorted.at(-1)?.weight_kg ?? null

  const half = Math.floor(window / 2)
  const smoothed = sorted.map((point, i) => {
    const slice = sorted.slice(Math.max(0, i - half), i + half + 1)
    const mean = slice.reduce((s, p) => s + p.weight_kg, 0) / slice.length
    return { recorded_on: point.recorded_on, weight_kg: round(mean, 2) }
  })

  if (sorted.length < MIN_TREND_POINTS) {
    return { slope_kg_per_week: null, smoothed, latest_kg: latest, change_kg: null, span_days: 0 }
  }

  const t0 = Date.parse(sorted[0].recorded_on)
  const xs = sorted.map((p) => (Date.parse(p.recorded_on) - t0) / 86_400_000)
  const ys = sorted.map((p) => p.weight_kg)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const spanDays = xs[n - 1]
  if (den === 0 || spanDays < 7) {
    return { slope_kg_per_week: null, smoothed, latest_kg: latest, change_kg: null, span_days: spanDays }
  }

  return {
    slope_kg_per_week: round((num / den) * 7, 2),
    smoothed,
    latest_kg: latest,
    change_kg: round(ys[n - 1] - ys[0], 2),
    span_days: spanDays,
  }
}

/**
 * Rough planning delta from energy balance. Explicitly an estimate: water,
 * adherence, activity and metabolic variation all move real weight around.
 */
export function projectWeightChangeKg(
  averageIntakeKcal: number, tdeeKcal: number, days: number,
): number {
  return round(((averageIntakeKcal - tdeeKcal) * days) / KCAL_PER_KG_BODY_MASS, 2)
}

/* ------------------------------ unit conversion ------------------------------ */

export const kgToLb = (kg: number) => round(kg * 2.2046226218, 1)
export const lbToKg = (lb: number) => round(lb / 2.2046226218, 2)
export const cmToIn = (cm: number) => round(cm / 2.54, 1)
export const inToCm = (inches: number) => round(inches * 2.54, 1)

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalIn = cm / 2.54
  const feet = Math.floor(totalIn / 12)
  return { feet, inches: round(totalIn - feet * 12) }
}
