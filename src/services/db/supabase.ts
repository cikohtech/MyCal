/**
 * Supabase-backed store. Ordinary CRUD goes straight to PostgreSQL under row
 * level security; anything privileged (the AI provider, the product provider)
 * goes through an edge function that verifies the caller first.
 */
import type {
  AnalysisDraft, BarcodeDraft, FoodEntry, FoodEntryPart, FoodImage, IsoDate,
  NutritionTarget, PhotoAllowance, Profile, Uuid, VoiceContext, VoiceInput, WeightEntry,
} from '@/types/domain'
import type {
  AppUser, DataStore, EntryPatch, NewEntry, NewTarget, SignUpResult,
} from '@/services/db/types'
import { FOOD_IMAGE_BUCKET, requireSupabase } from '@/lib/supabase'
import { authRedirectUrl, siteUrl } from '@/lib/site'
import { uuid } from '@/lib/id'
import { audioExtension, baseAudioType } from '@/services/voice'

const SIGNED_URL_TTL_SECONDS = 60 * 10
/**
 * Transcribing and then reading a long description can take most of the two
 * and a half minutes the platform allows a request. Waiting a little past that
 * means the client never gives up on an answer that was about to arrive.
 */
const VOICE_TIMEOUT_MS = 160_000

function failedDraft(code: string, extra: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    status: 'failed', analysis_id: null, model: null, notes: null, foods: [],
    failure_code: code, ...extra,
  }
}

/**
 * The SDK hands back an error for anything that is not a 2xx. The function
 * answers its own failures with a 200, so what arrives here is the network or
 * the platform — and those are worth telling apart, because "you are offline"
 * and "wait and retry" ask different things of the person.
 */
async function voiceFailure(error: unknown): Promise<AnalysisDraft> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return failedDraft('offline')
  const context = (error as { context?: unknown })?.context
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as Partial<AnalysisDraft> | null
    if (body?.failure_code) return failedDraft(body.failure_code)
    if (context.status === 413) return failedDraft('audio_too_large')
  }
  const text = `${(error as Error)?.message ?? ''} ${(context as Error)?.name ?? ''} ${(context as Error)?.message ?? ''}`
  return failedDraft(/abort|timed? ?out/i.test(text) ? 'timeout' : 'service_unavailable')
}

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

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      // Without this, Supabase mails the project's Site URL — which is how a
      // deployed app sends people a link back to somebody's laptop.
      options: { emailRedirectTo: authRedirectUrl() },
    })
    if (error) throw new Error(error.message)

    // With confirmations off, sign-up hands back a session and the person is
    // simply in. With them on there is no session, and the inbox is the next
    // step rather than a failure.
    if (data.session) {
      const user = toUser(data.user)
      if (!user) throw new Error('Sign-up did not return an account.')
      return { status: 'signed-in', user }
    }

    // An address that already has a confirmed account comes back looking like
    // a fresh sign-up with no identities — Supabase does that on purpose, so
    // the form cannot be used to discover who has an account. Trying the
    // password is what separates "you already have one" from "check your mail".
    if (!data.user?.identities?.length) {
      try {
        return { status: 'signed-in', user: await this.signIn(email, password) }
      } catch {
        return { status: 'confirm-email', email }
      }
    }

    return { status: 'confirm-email', email }
  }

  async resendConfirmation(email: string): Promise<void> {
    const { error } = await requireSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl() },
    })
    if (error) throw new Error(error.message)
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Back to the front door; the router sends people on from there.
        redirectTo: `${siteUrl()}/`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw new Error(error.message)
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

  async analyzeVoice(
    _userId: Uuid, input: VoiceInput, idempotencyKey: string, context: VoiceContext,
  ): Promise<AnalysisDraft> {
    let body: FormData | Record<string, unknown>
    if (input.kind === 'audio') {
      // Multipart rather than base64 in JSON: a third smaller on the wire, and
      // the function can turn an oversized upload away by its declared length.
      const type = baseAudioType(input.mimeType || input.blob.type)
      const form = new FormData()
      form.append('audio', input.blob, `voice.${audioExtension(type)}`)
      // Some browsers send the part with no type at all; this is the backup.
      form.append('mime_type', type)
      form.append('duration_ms', String(Math.round(input.durationMs)))
      form.append('idempotency_key', idempotencyKey)
      form.append('timezone', context.timezone)
      form.append('units', context.units)
      body = form
    } else {
      body = {
        text: input.text,
        transcribed: input.transcribed === true,
        idempotency_key: idempotencyKey,
        timezone: context.timezone,
        units: context.units,
      }
    }

    try {
      const { data, error } = await requireSupabase().functions.invoke<AnalysisDraft>(
        'analyze-food-voice', { body, timeout: VOICE_TIMEOUT_MS },
      )
      if (error || !data) return await voiceFailure(error)
      return data
    } catch (caught) {
      return voiceFailure(caught)
    }
  }

  async deleteAnalysis(id: Uuid): Promise<void> {
    const { error } = await requireSupabase().from('ai_analyses').delete().eq('id', id)
    if (error) fail('Could not remove that analysis', error)
  }

  async getPhotoAllowance(userId: Uuid): Promise<PhotoAllowance | null> {
    // Every column rather than a list: a project that has not run the voice
    // migration yet still answers, instead of failing on a column it lacks.
    const { data, error } = await requireSupabase()
      .from('user_plans').select('*')
      .eq('user_id', userId).maybeSingle()
    // Not worth an error screen: this only decides what the UI warns about,
    // and the edge function refuses an exhausted account regardless.
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      is_paid: Boolean(row.is_paid),
      free_photo_limit: Number(row.free_photo_limit) || 0,
      photos_analyzed: Number(row.photos_analyzed) || 0,
      free_voice_limit: typeof row.free_voice_limit === 'number' ? row.free_voice_limit : undefined,
      voice_logs_analyzed: typeof row.voice_logs_analyzed === 'number' ? row.voice_logs_analyzed : undefined,
    }
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

    // food_entry_parts cascade from their entries. Analyses of photos cascade
    // from their images, but a voice log has no image — its transcript would
    // outlive "delete everything" unless it is removed by name.
    for (const table of [
      'food_entries', 'food_images', 'ai_analyses', 'weight_entries', 'nutrition_targets',
    ]) {
      const { error } = await client.from(table).delete().eq('user_id', userId)
      if (error) fail(`Could not clear ${table}`, error)
    }
    const { error } = await client.from('profiles').delete().eq('user_id', userId)
    if (error) fail('Could not clear your profile', error)
  }
}
