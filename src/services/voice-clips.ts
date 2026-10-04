/**
 * Recordings waiting on a voice log, kept in this browser only.
 *
 * The job queue lives in sessionStorage, which cannot hold audio. Without this
 * a reload in the middle of a reading — an app update, a pull to refresh —
 * would lose a minute of somebody talking, with nothing to retry from. A clip
 * is dropped the moment its log is saved or discarded, and anything a job no
 * longer points to is swept on the next start.
 *
 * Every call swallows its own failure. Private browsing and full disks break
 * IndexedDB, and a broken cache must cost a reload's worth of resilience,
 * never the recording that is still in memory.
 */

const DB_NAME = 'mycal-voice'
const STORE = 'clips'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | null,
  fallback: T,
): Promise<T> {
  try {
    const db = await openDb()
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        tx.oncomplete = () => resolve((request?.result as T) ?? fallback)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return fallback
  }
}

export function saveClip(id: string, blob: Blob): Promise<void> {
  return withStore<void>('readwrite', (store) => store.put(blob, id), undefined)
}

export async function loadClip(id: string): Promise<Blob | null> {
  const value = await withStore<unknown>('readonly', (store) => store.get(id), null)
  return value instanceof Blob ? value : null
}

export function dropClip(id: string): Promise<void> {
  return withStore<void>('readwrite', (store) => store.delete(id), undefined)
}

/** Sweeps every clip whose job is gone. An empty list clears the lot. */
export async function dropClipsExcept(keep: string[]): Promise<void> {
  const ids = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys(), [])
  const wanted = new Set(keep)
  for (const id of ids) {
    if (!wanted.has(String(id))) await dropClip(String(id))
  }
}
