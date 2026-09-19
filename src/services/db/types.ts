import type {
  AnalysisDraft, BarcodeDraft, FoodEntry, FoodEntryPart, FoodImage, IsoDate,
  NutritionTarget, Profile, Uuid, WeightEntry,
} from '@/types/domain'

export interface AppUser {
  id: Uuid
  email: string | null
  /** True when this session lives only on this device. */
  isLocal: boolean
}

/**
 * Creating an account either lets you straight in or sends you to your inbox,
 * depending on whether the project asks for confirmation. Both are ordinary
 * outcomes, so neither is an error.
 */
export type SignUpResult =
  | { status: 'signed-in'; user: AppUser }
  | { status: 'confirm-email'; email: string }

export type NewEntry = Omit<FoodEntry, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'parts'> & {
  parts?: Omit<FoodEntryPart, 'id' | 'food_entry_id' | 'created_at'>[]
}

export type EntryPatch = Partial<
  Pick<FoodEntry, 'display_name' | 'quantity' | 'quantity_unit' | 'meal_type'
  | 'nutrition_snapshot' | 'note' | 'user_corrected' | 'consumed_on'>
> & {
  parts?: (Omit<FoodEntryPart, 'id' | 'food_entry_id' | 'created_at'> & { id?: string })[]
}

export type NewTarget = Omit<NutritionTarget, 'id' | 'user_id' | 'created_at'>

/**
 * One data boundary for the whole app. Features talk to this, never to SQL
 * or to a storage SDK directly, which is what lets the same UI run against
 * Supabase or against this device.
 */
export interface DataStore {
  readonly kind: 'supabase' | 'local'

  getUser(): Promise<AppUser | null>
  onAuthChange(handler: (user: AppUser | null) => void): () => void
  /** Creates the account, and says whether an inbox step stands in the way. */
  signUp(email: string, password: string): Promise<SignUpResult>
  /** Sends the confirmation mail again, to the same address. */
  resendConfirmation(email: string): Promise<void>
  signIn(email: string, password: string): Promise<AppUser>
  /** Hands the browser off to Google; the session arrives on the way back. */
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>

  getProfile(userId: Uuid): Promise<Profile | null>
  saveProfile(profile: Profile): Promise<Profile>

  listTargets(userId: Uuid): Promise<NutritionTarget[]>
  /** The target in force on a given day — history is never rewritten. */
  getTargetOn(userId: Uuid, date: IsoDate): Promise<NutritionTarget | null>
  createTarget(userId: Uuid, target: NewTarget): Promise<NutritionTarget>

  listWeights(userId: Uuid): Promise<WeightEntry[]>
  saveWeight(userId: Uuid, recordedOn: IsoDate, weightKg: number, note: string | null): Promise<WeightEntry>
  deleteWeight(id: Uuid): Promise<void>

  listEntries(userId: Uuid, date: IsoDate): Promise<FoodEntry[]>
  listEntriesRange(userId: Uuid, from: IsoDate, to: IsoDate): Promise<FoodEntry[]>
  getEntry(id: Uuid): Promise<FoodEntry | null>
  /** `idempotencyKey` stops a retried save from logging the same meal twice. */
  createEntry(userId: Uuid, entry: NewEntry, idempotencyKey?: string): Promise<FoodEntry>
  updateEntry(id: Uuid, patch: EntryPatch): Promise<FoodEntry>
  deleteEntry(id: Uuid): Promise<void>

  uploadFoodImage(userId: Uuid, file: Blob, mimeType: string): Promise<FoodImage>
  getFoodImage(id: Uuid): Promise<FoodImage | null>
  /** Short-lived where the backend supports it; an object URL on this device. */
  getImageUrl(image: FoodImage): Promise<string | null>
  deleteFoodImage(image: FoodImage): Promise<void>

  analyzePhoto(userId: Uuid, image: FoodImage, idempotencyKey: string): Promise<AnalysisDraft>
  lookupBarcode(userId: Uuid, barcode: string): Promise<BarcodeDraft>

  /** Removes every record and image this account owns. */
  deleteAllData(userId: Uuid): Promise<void>
}
