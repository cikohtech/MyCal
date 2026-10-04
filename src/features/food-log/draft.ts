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

/** Sources whose numbers a model proposed, rather than a label or a person. */
export function isAiSource(source: FoodEntry['source']): boolean {
  return source === 'photo_ai' || source === 'voice_ai'
}

/**
 * Gives every food of a voice log a meal. People say the meal once and then
 * list what was in it — "for breakfast eggs and toast, then a coffee" — so a
 * food with no meal of its own takes the one spoken before it. Anything said
 * before any meal was named gets the fallback, the meal the clock suggests.
 */
export function fillMeals(foods: DraftFood[], fallback: MealType): DraftFood[] {
  let current: MealType | null = null
  return foods.map((food) => {
    if (food.meal) current = food.meal
    return { ...food, meal: food.meal ?? current ?? fallback }
  })
}

/** True when a voice log's foods belong to more than one meal. */
export function mixesMeals(foods: DraftFood[], fallback: MealType): boolean {
  return new Set(foods.map((food) => food.meal ?? fallback)).size > 1
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
    provenance: entry.source === 'barcode' ? 'label' : isAiSource(entry.source) ? 'estimate' : 'reference',
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
  free_limit_reached: {
    title: 'Your free photos are used up',
    body: 'Photo estimates need a paid plan from here on. Your photo is saved — describe the meal yourself, or scan a barcode.',
  },
  service_unavailable: {
    title: 'The analysis service did not answer',
    body: 'Your photo is saved. Retry in a moment, or describe the meal yourself.',
  },
}

/** The same moments, for something said or typed rather than photographed. */
export const VOICE_FAILURES: Record<string, { title: string; body: string }> = {
  no_analysis_service: {
    title: 'No analysis service connected',
    body: 'MyCal will not invent nutrition numbers from a description. Add the food yourself instead.',
  },
  no_transcription_service: {
    title: 'Voice is not switched on yet',
    body: 'This server can read a typed description but cannot transcribe speech. Type what you ate instead.',
  },
  no_speech: {
    title: 'Nothing was heard',
    body: 'The recording came through silent. Check the microphone is not muted and try again, or type it.',
  },
  no_food_mentioned: {
    title: 'No food in what was said',
    body: 'It did not sound like a description of something you ate. Record it again, or add it yourself.',
  },
  unclear_speech: {
    title: 'That was hard to make out',
    body: 'Try again somewhere quieter, with the phone a little closer — or type it.',
  },
  timeout: {
    title: 'That took too long',
    body: 'Nothing is lost. Try again in a moment, or add it yourself.',
  },
  rate_limited: {
    title: 'Too many logs too quickly',
    body: 'Wait a minute before the next one, or add this one yourself.',
  },
  free_limit_reached: {
    title: 'Your free voice logs are used up',
    body: 'Logging by voice needs a paid plan from here on. Photos, barcodes and typing a meal in still work.',
  },
  service_unavailable: {
    title: 'The service did not answer',
    body: 'Nothing is lost. Try again in a moment, or add it yourself.',
  },
  offline: {
    title: 'You are offline',
    body: 'It is kept on this phone. Try again once you are connected.',
  },
  audio_too_large: {
    title: 'That recording is too long',
    body: 'Keep it under three minutes, or split the day into two logs.',
  },
  unsupported_audio: {
    title: 'That recording could not be read',
    body: 'This browser recorded in a format the service could not open. Type what you ate instead.',
  },
  text_too_long: {
    title: 'That is a lot to read at once',
    body: 'Split it into two logs of a few meals each.',
  },
}

/**
 * Failures a second try can fix. The rest — silence, nothing edible said, a
 * format the service cannot read — would come back the same, so they offer a
 * new recording instead.
 */
const RETRYABLE_VOICE = new Set(['timeout', 'service_unavailable', 'offline', 'rate_limited'])

export function canRetryVoice(code: string | null | undefined): boolean {
  return !code || RETRYABLE_VOICE.has(code)
}

export function failureCopy(
  code: string | null,
  retryAfterSeconds?: number | null,
  kind: 'photo' | 'voice' = 'photo',
) {
  const copy = (kind === 'voice' ? VOICE_FAILURES : ANALYSIS_FAILURES)[code ?? ''] ?? (
    kind === 'voice'
      ? { title: 'That did not work', body: 'Nothing is lost. Try again, or add it yourself.' }
      : { title: 'That analysis did not work', body: 'Your photo is saved. Retry, or describe the meal yourself.' }
  )
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
