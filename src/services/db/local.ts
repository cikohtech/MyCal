/**
 * On-device store. Keeps the whole product usable before a Supabase project
 * exists — same interface, same UI, data that never leaves the phone.
 * Records live in localStorage; photo bytes live in IndexedDB.
 */
import type {
  AnalysisDraft, BarcodeDraft, FoodEntry, FoodImage, IsoDate, NutritionTarget,
  Profile, Uuid, WeightEntry,
} from '@/types/domain'
import type { AppUser, DataStore, EntryPatch, NewEntry, NewTarget } from '@/services/db/types'
import { uuid } from '@/lib/id'
import { compareIso } from '@/lib/dates'
import { lookupOpenFoodFacts } from '@/services/openfoodfacts'

const NS = 'mycal.v1'
const key = (name: string) => `${NS}.${name}`

function read<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name))
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(name: string, value: T): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
  } catch (error) {
    console.warn('Could not save locally', error)
    throw new Error('This device is out of storage space. Free some space and try again.')
  }
}

/* --------------------------- blob store (IndexedDB) -------------------------- */

const DB_NAME = 'mycal-images'
const STORE = 'blobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => resolve((request.result as Blob) ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return blob
}

async function removeBlob(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/* ---------------------------------- store ---------------------------------- */

const LOCAL_USER_ID = 'local-user'
const listeners = new Set<(user: AppUser | null) => void>()
const objectUrls = new Map<string, string>()

function currentUser(): AppUser | null {
  return read<AppUser | null>('user', null)
}

function notify(user: AppUser | null) {
  listeners.forEach((fn) => fn(user))
}

export class LocalStore implements DataStore {
  readonly kind = 'local' as const

  async getUser(): Promise<AppUser | null> {
    return currentUser()
  }

  onAuthChange(handler: (user: AppUser | null) => void): () => void {
    listeners.add(handler)
    return () => listeners.delete(handler)
  }

  async signUp(email: string): Promise<{ user: AppUser | null; needsConfirmation: boolean }> {
    const user: AppUser = { id: LOCAL_USER_ID, email: email || null, isLocal: true }
    write('user', user)
    notify(user)
    return { user, needsConfirmation: false }
  }

  async signIn(email: string): Promise<AppUser> {
    const user: AppUser = { id: LOCAL_USER_ID, email: email || null, isLocal: true }
    write('user', user)
    notify(user)
    return user
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(key('user'))
    notify(null)
  }

  async getProfile(): Promise<Profile | null> {
    return read<Profile | null>('profile', null)
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    const next = { ...profile, user_id: LOCAL_USER_ID, updated_at: new Date().toISOString() }
    write('profile', next)
    return next
  }

  async listTargets(): Promise<NutritionTarget[]> {
    return read<NutritionTarget[]>('targets', []).sort((a, b) =>
      compareIso(b.effective_on, a.effective_on))
  }

  async getTargetOn(_userId: Uuid, date: IsoDate): Promise<NutritionTarget | null> {
    const targets = await this.listTargets()
    return targets.find((t) => compareIso(t.effective_on, date) <= 0) ?? targets.at(-1) ?? null
  }

  async createTarget(_userId: Uuid, target: NewTarget): Promise<NutritionTarget> {
    const targets = read<NutritionTarget[]>('targets', [])
    // One target per effective date; re-saving the same day replaces it.
    const filtered = targets.filter((t) => t.effective_on !== target.effective_on)
    const created: NutritionTarget = {
      ...target, id: uuid(), user_id: LOCAL_USER_ID, created_at: new Date().toISOString(),
    }
    write('targets', [...filtered, created])
    return created
  }

  async listWeights(): Promise<WeightEntry[]> {
    return read<WeightEntry[]>('weights', []).sort((a, b) =>
      compareIso(a.recorded_on, b.recorded_on))
  }

  async saveWeight(
    _userId: Uuid, recordedOn: IsoDate, weightKg: number, note: string | null,
  ): Promise<WeightEntry> {
    const weights = read<WeightEntry[]>('weights', [])
    const existing = weights.find((w) => w.recorded_on === recordedOn)
    const entry: WeightEntry = existing
      ? { ...existing, weight_kg: weightKg, note }
      : {
          id: uuid(), user_id: LOCAL_USER_ID, recorded_on: recordedOn,
          weight_kg: weightKg, note, created_at: new Date().toISOString(),
        }
    write('weights', [...weights.filter((w) => w.recorded_on !== recordedOn), entry])
    return entry
  }

  async deleteWeight(id: Uuid): Promise<void> {
    write('weights', read<WeightEntry[]>('weights', []).filter((w) => w.id !== id))
  }

  async listEntries(_userId: Uuid, date: IsoDate): Promise<FoodEntry[]> {
    return read<FoodEntry[]>('entries', [])
      .filter((e) => e.consumed_on === date)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  }

  async listEntriesRange(_userId: Uuid, from: IsoDate, to: IsoDate): Promise<FoodEntry[]> {
    return read<FoodEntry[]>('entries', []).filter(
      (e) => compareIso(e.consumed_on, from) >= 0 && compareIso(e.consumed_on, to) <= 0,
    )
  }

  async getEntry(id: Uuid): Promise<FoodEntry | null> {
    return read<FoodEntry[]>('entries', []).find((e) => e.id === id) ?? null
  }

  async createEntry(_userId: Uuid, entry: NewEntry, idempotencyKey?: string): Promise<FoodEntry> {
    const entries = read<FoodEntry[]>('entries', [])
    const seen = read<Record<string, string>>('idempotency', {})
    if (idempotencyKey && seen[idempotencyKey]) {
      const previous = entries.find((e) => e.id === seen[idempotencyKey])
      if (previous) return previous
    }
    const { parts = [], ...rest } = entry
    const id = uuid()
    const created: FoodEntry = {
      ...rest,
      id,
      user_id: LOCAL_USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parts: parts.map((p) => ({ ...p, id: uuid(), food_entry_id: id })),
    }
    write('entries', [...entries, created])
    if (idempotencyKey) write('idempotency', { ...seen, [idempotencyKey]: id })
    return created
  }

  async updateEntry(id: Uuid, patch: EntryPatch): Promise<FoodEntry> {
    const entries = read<FoodEntry[]>('entries', [])
    const index = entries.findIndex((e) => e.id === id)
    if (index === -1) throw new Error('That entry no longer exists.')
    const { parts, ...fields } = patch
    const next: FoodEntry = {
      ...entries[index],
      ...fields,
      updated_at: new Date().toISOString(),
      parts: parts
        ? parts.map((p) => ({ ...p, id: p.id ?? uuid(), food_entry_id: id }))
        : entries[index].parts,
    }
    entries[index] = next
    write('entries', entries)
    return next
  }

  async deleteEntry(id: Uuid): Promise<void> {
    write('entries', read<FoodEntry[]>('entries', []).filter((e) => e.id !== id))
  }

  async uploadFoodImage(_userId: Uuid, file: Blob, mimeType: string): Promise<FoodImage> {
    const id = uuid()
    await putBlob(id, file)
    const image: FoodImage = {
      id,
      user_id: LOCAL_USER_ID,
      storage_path: `local://${id}`,
      mime_type: mimeType,
      size_bytes: file.size,
      status: 'uploaded',
      created_at: new Date().toISOString(),
    }
    write('images', [...read<FoodImage[]>('images', []), image])
    return image
  }

  async getFoodImage(id: Uuid): Promise<FoodImage | null> {
    return read<FoodImage[]>('images', []).find((i) => i.id === id) ?? null
  }

  async getImageUrl(image: FoodImage): Promise<string | null> {
    const cached = objectUrls.get(image.id)
    if (cached) return cached
    const blob = await getBlob(image.id)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    objectUrls.set(image.id, url)
    return url
  }

  async deleteFoodImage(image: FoodImage): Promise<void> {
    await removeBlob(image.id)
    const url = objectUrls.get(image.id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(image.id)
    }
    write('images', read<FoodImage[]>('images', []).filter((i) => i.id !== image.id))
  }

  /**
   * There is no recognition model on this device, and inventing numbers from a
   * photo would be exactly the kind of invisible guess the product refuses to
   * make. So the photo is kept and handed back as an editable blank draft.
   */
  async analyzePhoto(): Promise<AnalysisDraft> {
    return {
      status: 'failed',
      analysis_id: null,
      model: null,
      notes: null,
      foods: [],
      failure_code: 'no_analysis_service',
    }
  }

  async lookupBarcode(_userId: Uuid, barcode: string): Promise<BarcodeDraft> {
    const cache = read<Record<string, BarcodeDraft>>('barcodes', {})
    if (cache[barcode]) return cache[barcode]
    const draft = await lookupOpenFoodFacts(barcode)
    if (draft.status === 'found') write('barcodes', { ...cache, [barcode]: draft })
    return draft
  }

  async deleteAllData(): Promise<void> {
    for (const image of read<FoodImage[]>('images', [])) {
      await removeBlob(image.id).catch(() => undefined)
    }
    for (const name of ['profile', 'targets', 'weights', 'entries', 'images', 'barcodes', 'idempotency']) {
      localStorage.removeItem(key(name))
    }
  }
}
