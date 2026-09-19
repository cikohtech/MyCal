/**
 * Supabase-backed store. Ordinary CRUD goes straight to PostgreSQL under row
 * level security; anything privileged (the AI provider, the product provider)
 * goes through an edge function that verifies the caller first.
 */
import type {
  AnalysisDraft, BarcodeDraft, FoodEntry, FoodEntryPart, FoodImage, IsoDate,
  NutritionTarget, Profile, Uuid, WeightEntry,
} from '@/types/domain'
import type { AppUser, DataStore, EntryPatch, NewEntry, NewTarget } from '@/services/db/types'
import { FOOD_IMAGE_BUCKET, requireSupabase } from '@/lib/supabase'
import { uuid } from '@/lib/id'

const SIGNED_URL_TTL_SECONDS = 60 * 10

function toUser(user: { id: string; email?: string } | null | undefined): AppUser | null {
  return user ? { id: user.id, email: user.email ?? null, isLocal: false } : null
}

/** Turns a PostgREST error into something a person can act on. */
function fail(context: string, error: { message: string; code?: string } | null): never {
  if (error?.code === '23505') throw new Error('That record already exists for this date.')
  if (error?.code === '42501') throw new Error('You do not have access to that record.')
  throw new Error(error?.message ? `${context}: ${error.message}` : context)
}

const ENTRY_SELECT = '*, parts:food_entry_parts(*)'

function normaliseEntry(row: Record<string, unknown>): FoodEntry {
  const parts = (row.parts as FoodEntryPart[] | null) ?? []
  return { ...(row as unknown as FoodEntry), parts }
}

export class SupabaseStore implements DataStore {
  readonly kind = 'supabase' as const

  async getUser(): Promise<AppUser | null> {
    const { data } = await requireSupabase().auth.getUser()
    return toUser(data.user)
  }

  onAuthChange(handler: (user: AppUser | null) => void): () => void {
    const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => {
      handler(toUser(session?.user ?? null))
    })
    return () => data.subscription.unsubscribe()
  }

  async signUp(email: string, password: string) {
    const { data, error } = await requireSupabase().auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    return { user: toUser(data.user), needsConfirmation: !data.session }
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const user = toUser(data.user)
    if (!user) throw new Error('Sign-in did not return an account.')
    return user
  }

  async signOut(): Promise<void> {
    await requireSupabase().auth.signOut()
  }

  async getProfile(userId: Uuid): Promise<Profile | null> {
    const { data, error } = await requireSupabase()
      .from('profiles').select('*').eq('user_id', userId).maybeSingle()
    if (error) fail('Could not load your profile', error)
    return data as Profile | null
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    const { data, error } = await requireSupabase()
      .from('profiles').upsert(profile, { onConflict: 'user_id' }).select().single()
    if (error) fail('Could not save your profile', error)
    return data as Profile
  }

  async listTargets(userId: Uuid): Promise<NutritionTarget[]> {
    const { data, error } = await requireSupabase()
      .from('nutrition_targets').select('*')
      .eq('user_id', userId).order('effective_on', { ascending: false })
    if (error) fail('Could not load your targets', error)
    return (data ?? []) as NutritionTarget[]
  }

  async getTargetOn(userId: Uuid, date: IsoDate): Promise<NutritionTarget | null> {
    const client = requireSupabase()
    const { data, error } = await client
      .from('nutrition_targets').select('*')
      .eq('user_id', userId).lte('effective_on', date)
      .order('effective_on', { ascending: false }).limit(1).maybeSingle()
    if (error) fail('Could not load your target', error)
    if (data) return data as NutritionTarget
    // Viewing a day from before the first target still deserves a target.
    const { data: earliest } = await client
      .from('nutrition_targets').select('*')
      .eq('user_id', userId).order('effective_on', { ascending: true }).limit(1).maybeSingle()
    return (earliest as NutritionTarget) ?? null
  }

  async createTarget(userId: Uuid, target: NewTarget): Promise<NutritionTarget> {
    const { data, error } = await requireSupabase()
      .from('nutrition_targets')
      .upsert({ ...target, user_id: userId }, { onConflict: 'user_id,effective_on' })
      .select().single()
    if (error) fail('Could not save your target', error)
    return data as NutritionTarget
  }

  async listWeights(userId: Uuid): Promise<WeightEntry[]> {
    const { data, error } = await requireSupabase()
      .from('weight_entries').select('*')
      .eq('user_id', userId).order('recorded_on', { ascending: true })
    if (error) fail('Could not load your weight history', error)
    return (data ?? []) as WeightEntry[]
  }

  async saveWeight(
    userId: Uuid, recordedOn: IsoDate, weightKg: number, note: string | null,
  ): Promise<WeightEntry> {
    const { data, error } = await requireSupabase()
      .from('weight_entries')
      .upsert({ user_id: userId, recorded_on: recordedOn, weight_kg: weightKg, note },
        { onConflict: 'user_id,recorded_on' })
      .select().single()
    if (error) fail('Could not save that weight', error)
    return data as WeightEntry
  }

  async deleteWeight(id: Uuid): Promise<void> {
    const { error } = await requireSupabase().from('weight_entries').delete().eq('id', id)
    if (error) fail('Could not remove that weight', error)
  }

  async listEntries(userId: Uuid, date: IsoDate): Promise<FoodEntry[]> {
    const { data, error } = await requireSupabase()
      .from('food_entries').select(ENTRY_SELECT)
      .eq('user_id', userId).eq('consumed_on', date)
      .order('created_at', { ascending: true })
    if (error) fail('Could not load that day', error)
    return (data ?? []).map(normaliseEntry)
  }

  async listEntriesRange(userId: Uuid, from: IsoDate, to: IsoDate): Promise<FoodEntry[]> {
    const { data, error } = await requireSupabase()
      .from('food_entries').select(ENTRY_SELECT)
      .eq('user_id', userId).gte('consumed_on', from).lte('consumed_on', to)
      .order('consumed_on', { ascending: true })
    if (error) fail('Could not load that range', error)
    return (data ?? []).map(normaliseEntry)
  }

  async getEntry(id: Uuid): Promise<FoodEntry | null> {
    const { data, error } = await requireSupabase()
      .from('food_entries').select(ENTRY_SELECT).eq('id', id).maybeSingle()
    if (error) fail('Could not load that entry', error)
    return data ? normaliseEntry(data) : null
  }

  async createEntry(userId: Uuid, entry: NewEntry, idempotencyKey?: string): Promise<FoodEntry> {
    const client = requireSupabase()
    const { parts = [], ...rest } = entry

    if (idempotencyKey) {
      const { data: existing } = await client
        .from('food_entries').select(ENTRY_SELECT)
        .eq('user_id', userId).eq('idempotency_key', idempotencyKey).maybeSingle()
      if (existing) return normaliseEntry(existing)
    }

    const { data, error } = await client
      .from('food_entries')
      .insert({ ...rest, user_id: userId, idempotency_key: idempotencyKey ?? null })
      .select().single()
    if (error) fail('Could not save that food', error)

    const entryId = (data as FoodEntry).id
    if (parts.length) {
      const { error: partError } = await client
        .from('food_entry_parts')
        .insert(parts.map((p) => ({ ...p, food_entry_id: entryId })))
      if (partError) fail('Saved the food, but not its ingredients', partError)
    }

    return (await this.getEntry(entryId))!
  }

  async updateEntry(id: Uuid, patch: EntryPatch): Promise<FoodEntry> {
    const client = requireSupabase()
    const { parts, ...fields } = patch

    if (Object.keys(fields).length) {
      const { error } = await client
        .from('food_entries')
        .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) fail('Could not update that entry', error)
    }

    if (parts) {
      // Parts are replaced wholesale — the editor always submits the full list.
      const { error: deleteError } = await client
        .from('food_entry_parts').delete().eq('food_entry_id', id)
      if (deleteError) fail('Could not update the ingredients', deleteError)
      if (parts.length) {
        const { error: insertError } = await client.from('food_entry_parts').insert(
          parts.map(({ id: _partId, ...p }) => ({ ...p, food_entry_id: id })),
        )
        if (insertError) fail('Could not update the ingredients', insertError)
      }
    }

    return (await this.getEntry(id))!
  }

  async deleteEntry(id: Uuid): Promise<void> {
    const { error } = await requireSupabase().from('food_entries').delete().eq('id', id)
    if (error) fail('Could not remove that entry', error)
  }

  async uploadFoodImage(userId: Uuid, file: Blob, mimeType: string): Promise<FoodImage> {
    const client = requireSupabase()
    const imageId = uuid()
    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    // The owner prefix is what the storage policy checks.
    const path = `${userId}/${imageId}.${extension}`

    const { error: uploadError } = await client.storage
      .from(FOOD_IMAGE_BUCKET)
      .upload(path, file, { contentType: mimeType, upsert: false })
    if (uploadError) throw new Error(`Could not upload that photo: ${uploadError.message}`)

    const { data, error } = await client.from('food_images').insert({
      id: imageId, user_id: userId, storage_path: path,
      mime_type: mimeType, size_bytes: file.size, status: 'uploaded',
    }).select().single()
    if (error) {
      await client.storage.from(FOOD_IMAGE_BUCKET).remove([path])
      fail('Could not record that photo', error)
    }
    return data as FoodImage
  }

  async getFoodImage(id: Uuid): Promise<FoodImage | null> {
    const { data, error } = await requireSupabase()
      .from('food_images').select('*').eq('id', id).maybeSingle()
    if (error) return null
    return data as FoodImage | null
  }

  async getImageUrl(image: FoodImage): Promise<string | null> {
    const { data, error } = await requireSupabase().storage
      .from(FOOD_IMAGE_BUCKET)
      .createSignedUrl(image.storage_path, SIGNED_URL_TTL_SECONDS)
    if (error) return null
    return data?.signedUrl ?? null
  }

  async deleteFoodImage(image: FoodImage): Promise<void> {
    const client = requireSupabase()
    await client.storage.from(FOOD_IMAGE_BUCKET).remove([image.storage_path])
    const { error } = await client.from('food_images').delete().eq('id', image.id)
    if (error) fail('Could not remove that photo', error)
  }

  async analyzePhoto(_userId: Uuid, image: FoodImage, idempotencyKey: string): Promise<AnalysisDraft> {
    const { data, error } = await requireSupabase().functions.invoke<AnalysisDraft>(
      'analyze-food-photo',
      { body: { food_image_id: image.id, idempotency_key: idempotencyKey } },
    )
    if (error || !data) {
      return {
        status: 'failed', analysis_id: null, model: null, notes: null, foods: [],
        failure_code: 'service_unavailable',
      }
    }
    return data
  }

  async lookupBarcode(_userId: Uuid, barcode: string): Promise<BarcodeDraft> {
    const { data, error } = await requireSupabase().functions.invoke<BarcodeDraft>(
      'lookup-barcode', { body: { barcode } },
    )
    if (error || !data) {
      return {
        status: 'not_found', barcode, reference: null,
        message: 'Could not reach the product database. Enter the label by hand.',
      }
    }
    return data
  }

  async deleteAllData(userId: Uuid): Promise<void> {
    const client = requireSupabase()
    const { data: images } = await client
      .from('food_images').select('storage_path').eq('user_id', userId)
    const paths = (images ?? []).map((i: { storage_path: string }) => i.storage_path)
    if (paths.length) await client.storage.from(FOOD_IMAGE_BUCKET).remove(paths)

    // food_entry_parts and ai_analyses cascade from their parents.
    for (const table of ['food_entries', 'food_images', 'weight_entries', 'nutrition_targets']) {
      const { error } = await client.from(table).delete().eq('user_id', userId)
      if (error) fail(`Could not clear ${table}`, error)
    }
    const { error } = await client.from('profiles').delete().eq('user_id', userId)
    if (error) fail('Could not clear your profile', error)
  }
}
