/**
 * Domain types. Canonical units everywhere: kg, cm, kcal, grams, ISO dates.
 * Conversion happens only at presentation boundaries.
 */

export type Uuid = string
/** ISO calendar date, `YYYY-MM-DD`, in the user's own timezone. */
export type IsoDate = string

export type SexForBmr = 'male' | 'female' | 'unspecified'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra'
export type Goal = 'lose' | 'maintain' | 'gain'
export type UnitPreference = 'metric' | 'imperial'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unassigned'
export type EntrySource = 'photo_ai' | 'barcode' | 'manual'
export type PartKind = 'ingredient' | 'extra'

export interface Profile {
  user_id: Uuid
  display_name: string | null
  age: number
  sex_for_bmr: SexForBmr
  height_cm: number
  activity_level: ActivityLevel
  goal: Goal
  timezone: string
  unit_preference: UnitPreference
  /** Set only when sex_for_bmr is 'unspecified' and the user supplies their own target. */
  custom_calorie_target: number | null
  created_at?: string
  updated_at?: string
}

export interface NutritionTarget {
  id: Uuid
  user_id: Uuid
  effective_on: IsoDate
  /** Snapshot of the inputs that produced this target. */
  input_age: number
  input_sex_for_bmr: SexForBmr
  input_height_cm: number
  input_weight_kg: number
  input_activity_level: ActivityLevel
  input_goal: Goal
  bmi: number
  bmr_kcal: number
  tdee_kcal: number
  calorie_target_kcal: number
  protein_target_g: number
  carbs_target_g: number
  fat_target_g: number
  fibre_target_g: number
  created_at?: string
}

export interface WeightEntry {
  id: Uuid
  user_id: Uuid
  recorded_on: IsoDate
  weight_kg: number
  note: string | null
  created_at?: string
}

export type FoodImageStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted'

export interface FoodImage {
  id: Uuid
  user_id: Uuid
  storage_path: string
  mime_type: string
  size_bytes: number
  status: FoodImageStatus
  created_at?: string
}

export type AnalysisStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'cancelled'

export interface AiAnalysis {
  id: Uuid
  user_id: Uuid
  food_image_id: Uuid | null
  status: AnalysisStatus
  model: string | null
  model_version: string | null
  result: AnalysisDraft | null
  failure_code: string | null
  created_at?: string
}

/**
 * Micronutrients are sparse on purpose. A key that is absent means
 * "not available" — it never means zero.
 */
export type NutrientKey =
  | 'sodium_mg' | 'potassium_mg' | 'calcium_mg' | 'iron_mg' | 'magnesium_mg' | 'zinc_mg'
  | 'vitamin_a_mcg' | 'vitamin_c_mg' | 'vitamin_d_mcg' | 'vitamin_e_mg' | 'vitamin_k_mcg'
  | 'vitamin_b6_mg' | 'vitamin_b12_mcg' | 'folate_mcg'
  | 'sugar_g' | 'saturated_fat_g' | 'cholesterol_mg'

export type Micronutrients = Partial<Record<NutrientKey, number>>

/** Nutrition for the amount actually consumed — not per 100 g. */
export interface NutritionSnapshot {
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number | null
  micronutrients: Micronutrients
}

export interface FoodEntry {
  id: Uuid
  user_id: Uuid
  consumed_on: IsoDate
  meal_type: MealType
  source: EntrySource
  display_name: string
  quantity: number
  quantity_unit: string
  nutrition_snapshot: NutritionSnapshot
  food_reference_id: Uuid | null
  ai_analysis_id: Uuid | null
  food_image_id: Uuid | null
  /** True once the user has changed a value the source proposed. */
  user_corrected: boolean
  confidence: number | null
  note: string | null
  created_at?: string
  updated_at?: string
  parts?: FoodEntryPart[]
}

export interface FoodEntryPart {
  id: Uuid
  food_entry_id: Uuid
  kind: PartKind
  name: string
  quantity: number | null
  quantity_unit: string | null
  nutrition_snapshot: NutritionSnapshot
  created_at?: string
}

export interface FoodReference {
  id: Uuid
  source: 'openfoodfacts' | 'curated' | 'user'
  external_id: string | null
  name: string
  brand: string | null
  barcode: string | null
  serving_description: string | null
  serving_grams: number | null
  /** Nutrition per 100 g (or per 100 ml for liquids). */
  nutrients_per_100g: NutritionSnapshot
  retrieved_at: string | null
}

/* ---- Edge-function DTOs. Deliberately distinct from persisted entries. ---- */

export interface DraftFood {
  /** Client-side id for list keys; never persisted. */
  temp_id: string
  name: string
  quantity: number
  quantity_unit: string
  confidence: number | null
  matched_reference_id: Uuid | null
  /** 'reference' means a nutrition database supplied it; 'estimate' means the model guessed. */
  provenance: 'reference' | 'estimate' | 'label'
  nutrition: NutritionSnapshot
  ingredients: DraftPart[]
}

export interface DraftPart {
  temp_id: string
  kind: PartKind
  name: string
  quantity: number | null
  quantity_unit: string | null
  nutrition: NutritionSnapshot
}

export interface AnalysisDraft {
  status: 'ready' | 'needs_review' | 'failed'
  analysis_id: Uuid | null
  model: string | null
  notes: string | null
  foods: DraftFood[]
  /** Set when the model could not do its job; the UI turns this into a recovery path. */
  failure_code: string | null
}

export interface BarcodeDraft {
  status: 'found' | 'not_found'
  barcode: string
  reference: FoodReference | null
  message: string | null
}

/* ---- Aggregates ---- */

export interface DailyTotals {
  consumed_on: IsoDate
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number | null
  micronutrients: Micronutrients
  entry_count: number
}

export interface MealGroup {
  meal_type: MealType
  entries: FoodEntry[]
  calories_kcal: number
}
