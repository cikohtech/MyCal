import type {
  AnalysisDraft, DraftFood, DraftPart, FoodEntry, FoodReference, MealType,
  NutritionSnapshot,
} from '@/types/domain'
import type { NewEntry } from '@/services/db'
import { addSnapshots, scaleSnapshot } from '@/lib/calc'
import { tempId } from '@/lib/id'

export const BLANK_NUTRITION: NutritionSnapshot = {
  calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: null, micronutrients: {},
}

/** A draft food is worth what it plus everything attached to it adds up to. */
export function draftTotal(food: DraftFood): NutritionSnapshot {
  return food.ingredients.reduce(
    (acc, part) => addSnapshots(acc, part.nutrition), food.nutrition,
  )
}

export function draftsTotal(foods: DraftFood[]): NutritionSnapshot {
  return foods.reduce(
    (acc, food) => addSnapshots(acc, draftTotal(food)), BLANK_NUTRITION,
  )
}

export function blankFood(name = ''): DraftFood {
  return {
    temp_id: tempId('food'),
    name,
    quantity: 1,
    quantity_unit: 'serving',
    confidence: null,
    matched_reference_id: null,
    provenance: 'estimate',
    nutrition: { ...BLANK_NUTRITION },
    ingredients: [],
  }
}

/** A scanned product becomes a draft measured in grams of the actual package. */
export function foodFromReference(reference: FoodReference): DraftFood {
  const grams = reference.serving_grams ?? 100
  return {
    temp_id: tempId('food'),
    name: [reference.brand, reference.name].filter(Boolean).join(' · '),
    quantity: grams,
    quantity_unit: 'g',
    confidence: null,
    matched_reference_id: reference.id,
    provenance: 'label',
    nutrition: scaleSnapshot(reference.nutrients_per_100g, grams / 100),
    ingredients: [],
  }
}

/** Nothing is persisted until this runs, and it runs only on an explicit save. */
export function toNewEntry(
  food: DraftFood,
  meal: MealType,
  consumedOn: string,
  source: FoodEntry['source'],
  links: { analysisId?: string | null; imageId?: string | null } = {},
  userCorrected = false,
): NewEntry {
  return {
    consumed_on: consumedOn,
    meal_type: meal,
    source,
    display_name: food.name.trim() || 'Unnamed food',
    quantity: food.quantity,
    quantity_unit: food.quantity_unit,
    nutrition_snapshot: food.nutrition,
    food_reference_id: food.matched_reference_id,
    ai_analysis_id: links.analysisId ?? null,
    food_image_id: links.imageId ?? null,
    user_corrected: userCorrected,
    confidence: food.confidence,
    note: null,
    parts: food.ingredients.map((part) => ({
      kind: part.kind,
      name: part.name,
      quantity: part.quantity,
      quantity_unit: part.quantity_unit,
      nutrition_snapshot: part.nutrition,
    })),
  }
}

export function entryToDraft(entry: FoodEntry): DraftFood {
  return {
    temp_id: entry.id,
    name: entry.display_name,
    quantity: entry.quantity,
    quantity_unit: entry.quantity_unit,
    confidence: entry.confidence,
    matched_reference_id: entry.food_reference_id,
    provenance: entry.source === 'barcode' ? 'label' : entry.source === 'photo_ai' ? 'estimate' : 'reference',
    nutrition: entry.nutrition_snapshot,
    ingredients: (entry.parts ?? []).map<DraftPart>((part) => ({
      temp_id: part.id,
      kind: part.kind,
      name: part.name,
      quantity: part.quantity,
      quantity_unit: part.quantity_unit,
      nutrition: part.nutrition_snapshot,
    })),
  }
}

export const ANALYSIS_FAILURES: Record<string, { title: string; body: string }> = {
  no_analysis_service: {
    title: 'No analysis service connected',
    body: 'MyCal will not invent nutrition numbers from a photo. Your photo is saved — describe what is in it and the entry keeps the picture attached.',
  },
  no_food_detected: {
    title: 'Nothing recognisable as food',
    body: 'Try again with the plate filling more of the frame, or describe the meal yourself.',
  },
  unclear_image: {
    title: 'The photo is too unclear to read',
    body: 'More light and a steadier shot usually fixes it. You can also type the meal in.',
  },
  timeout: {
    title: 'Analysis took too long',
    body: 'The photo is saved, so you can try again in a moment or enter it by hand.',
  },
  rate_limited: {
    title: 'Too many photos too quickly',
    body: 'Wait a minute before the next analysis, or enter this one by hand.',
  },
  service_unavailable: {
    title: 'The analysis service did not answer',
    body: 'Your photo is saved. Retry in a moment, or describe the meal yourself.',
  },
}

export function failureCopy(code: string | null, retryAfterSeconds?: number | null) {
  const copy = ANALYSIS_FAILURES[code ?? ''] ?? {
    title: 'That analysis did not work',
    body: 'Your photo is saved. Retry, or describe the meal yourself.',
  }
  // A limit you can wait out is a different thing from a limit you cannot, so
  // say which one this is rather than leaving someone to guess.
  if (code === 'rate_limited' && retryAfterSeconds && retryAfterSeconds > 0) {
    const wait = retryAfterSeconds >= 90
      ? `${Math.ceil(retryAfterSeconds / 60)} minutes`
      : `${Math.ceil(retryAfterSeconds)} seconds`
    return { ...copy, body: `Try again in about ${wait}, or enter this one by hand.` }
  }
  return copy
}

export function draftFoods(draft: AnalysisDraft): DraftFood[] {
  return draft.foods.map((food) => ({
    ...food,
    temp_id: food.temp_id || tempId('food'),
    ingredients: food.ingredients.map((part) => ({
      ...part, temp_id: part.temp_id || tempId('part'),
    })),
  }))
}
