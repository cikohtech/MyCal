import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { AnalysisDraft, FoodImage, MealType } from '@/types/domain'
import { store } from '@/services/db'
import { useSession } from '@/app/session'
import { useToast } from '@/components/Toast'
import { ImageError, prepareImage } from '@/services/camera'
import { suggestMeal } from '@/lib/meals'
import { uuid } from '@/lib/id'

/**
 * A photo, on its way to an estimate — without holding the person hostage.
 *
 * Taking a picture used to park you on a full-screen spinner for as long as the
 * model took. Now the work is a job: it runs here, outside any one screen, and
 * the day screen shows a card for it. You can log something else, look at
 * yesterday, or put the phone down while it runs. The review opens when you
 * choose to open it — nothing reaches the ledger without you saying yes.
 */

export type JobStage = 'preparing' | 'uploading' | 'analyzing' | 'ready' | 'failed'

export interface AnalysisJob {
  id: string
  stage: JobStage
  startedAt: number
  /** The day the photo was taken, so a job that outlives midnight still lands right. */
  consumedOn: string
  meal: MealType
  /** An object URL while the source blob is alive; a signed URL after a reload. */
  previewUrl: string | null
  image: FoodImage | null
  /** The model's answer, including the failures it reports itself. */
  draft: AnalysisDraft | null
  /** Set only when the job itself broke — a model failure lives on `draft`. */
  error: string | null
  idempotencyKey: string
}

interface JobsApi {
  jobs: AnalysisJob[]
  get(id: string | null | undefined): AnalysisJob | undefined
  /** Starts the work and hands back the id immediately. */
  start(blob: Blob, options?: { meal?: MealType; consumedOn?: string }): string
  retry(id: string): void
  setMeal(id: string, meal: MealType): void
  /** Saved to the ledger: forget the job, keep the photo. */
  complete(id: string): void
  /** Thrown away: forget the job and delete its photo with it. */
  discard(id: string): void
}

const JobsContext = createContext<JobsApi | null>(null)

const STORAGE_KEY = 'mycal.analysis-jobs'

/** What survives a reload. Blobs and object URLs cannot, and are rebuilt. */
interface StoredJob {
  id: string
  stage: JobStage
  startedAt: number
  consumedOn: string
  meal: MealType
  imageId: string | null
  draft: AnalysisDraft | null
  error: string | null
  idempotencyKey: string
}

function persist(jobs: AnalysisJob[]): void {
  try {
    const slim: StoredJob[] = jobs.map((job) => ({
      id: job.id,
      stage: job.stage,
      startedAt: job.startedAt,
      consumedOn: job.consumedOn,
      meal: job.meal,
      imageId: job.image?.id ?? null,
      draft: job.draft,
      error: job.error,
      idempotencyKey: job.idempotencyKey,
    }))
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {
    // A full or blocked sessionStorage costs a reload, not the run in progress.
  }
}

function readPersisted(): StoredJob[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredJob[]) : []
  } catch {
    return []
  }
}

export function AnalysisJobsProvider({ children }: { children: ReactNode }) {
  const { user, loading, today } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const userId = user?.id ?? null

  const [jobs, setJobs] = useState<AnalysisJob[]>([])

  /** The live list, readable from a callback without re-creating it each change. */
  const jobsRef = useRef<AnalysisJob[]>(jobs)
  /** Source blobs, kept only so a failed job can retry without a new photo. */
  const blobs = useRef(new Map<string, Blob>())
  const previews = useRef(new Map<string, string>())
  /** Ids already being worked, so a re-render never starts a second run. */
  const running = useRef(new Set<string>())

  const commit = useCallback((next: AnalysisJob[]) => {
    jobsRef.current = next
    persist(next)
    setJobs(next)
  }, [])

  const patch = useCallback((id: string, next: Partial<AnalysisJob>) => {
    commit(jobsRef.current.map((job) => (job.id === id ? { ...job, ...next } : job)))
  }, [commit])

  const forget = useCallback((id: string) => {
    blobs.current.delete(id)
    const preview = previews.current.get(id)
    if (preview) {
      URL.revokeObjectURL(preview)
      previews.current.delete(id)
    }
    running.current.delete(id)
    commit(jobsRef.current.filter((job) => job.id !== id))
  }, [commit])

  /**
   * The whole pipeline for one photo: prepare, upload, ask, record. The key and
   * the image are passed in rather than read off state, so a retry cannot pick
   * up the key it is trying to get away from.
   */
  const run = useCallback(async (
    id: string, idempotencyKey: string, existing: FoodImage | null,
  ) => {
    if (!userId || running.current.has(id)) return
    running.current.add(id)
    try {
      let image = existing
      if (!image) {
        const blob = blobs.current.get(id)
        if (!blob) throw new ImageError('That photo is no longer available. Take it again.')

        patch(id, { stage: 'preparing', error: null })
        const prepared = await prepareImage(blob)

        patch(id, { stage: 'uploading' })
        image = await store.uploadFoodImage(userId, prepared.blob, prepared.mimeType)
        patch(id, { image, stage: 'analyzing' })
      } else {
        patch(id, { stage: 'analyzing', error: null })
      }

      // Never throws: a model that could not answer comes back as a draft
      // carrying its own failure code, which the card turns into a way out.
      const draft = await store.analyzePhoto(userId, image, idempotencyKey)
      patch(id, { draft, stage: 'ready', error: null })

      if (draft.status !== 'failed' && draft.foods.length) {
        toast.done(
          draft.foods.length === 1
            ? 'An estimate is ready to check'
            : `${draft.foods.length} foods estimated — ready to check`,
          { label: 'Review', onClick: () => navigate(`/add?job=${id}`) },
        )
      }
    } catch (caught) {
      patch(id, {
        stage: 'failed',
        error: caught instanceof Error ? caught.message : 'That photo could not be sent.',
      })
    } finally {
      running.current.delete(id)
    }
  }, [navigate, patch, toast, userId])

  const start = useCallback((blob: Blob, options?: { meal?: MealType; consumedOn?: string }) => {
    const id = uuid()
    const preview = URL.createObjectURL(blob)
    blobs.current.set(id, blob)
    previews.current.set(id, preview)

    const job: AnalysisJob = {
      id,
      stage: 'preparing',
      startedAt: Date.now(),
      consumedOn: options?.consumedOn ?? today,
      meal: options?.meal ?? suggestMeal(),
      previewUrl: preview,
      image: null,
      draft: null,
      error: null,
      idempotencyKey: uuid(),
    }
    commit([...jobsRef.current, job])
    void run(id, job.idempotencyKey, null)
    return id
  }, [commit, run, today])

  const retry = useCallback((id: string) => {
    const job = jobsRef.current.find((item) => item.id === id)
    if (!job) return
    // A fresh key, because a retry asks for a second opinion — the first one is
    // on file and would otherwise simply be handed back.
    const key = uuid()
    patch(id, {
      draft: null, error: null, idempotencyKey: key,
      stage: job.image ? 'analyzing' : 'preparing',
    })
    void run(id, key, job.image)
  }, [patch, run])

  const complete = useCallback((id: string) => forget(id), [forget])

  const discard = useCallback((id: string) => {
    const job = jobsRef.current.find((item) => item.id === id)
    if (job?.image) void store.deleteFoodImage(job.image).catch(() => undefined)
    forget(id)
  }, [forget])

  const setMeal = useCallback((id: string, meal: MealType) => patch(id, { meal }), [patch])

  // Rehydrate after a reload. Anything that never reached storage went with its
  // blob, so it is dropped rather than left spinning against nothing.
  const rehydrated = useRef(false)
  useEffect(() => {
    if (loading || !userId || rehydrated.current) return
    rehydrated.current = true

    const stored = readPersisted()
    if (!stored.length) return

    // No cancellation flag on purpose. Under StrictMode this effect is run,
    // torn down and run again, and the second run is blocked by the guard
    // above — so cancelling the first would mean the queue never comes back at
    // all in development. Landing the result late is harmless; losing it isn't.
    void (async () => {
      const restored: AnalysisJob[] = []
      for (const item of stored) {
        const image = item.imageId
          ? await store.getFoodImage(item.imageId).catch(() => null)
          : null
        if (!image) continue
        restored.push({
          id: item.id,
          stage: item.stage === 'ready' || item.stage === 'failed' ? item.stage : 'analyzing',
          startedAt: item.startedAt,
          consumedOn: item.consumedOn,
          meal: item.meal,
          previewUrl: await store.getImageUrl(image).catch(() => null),
          image,
          draft: item.draft,
          error: item.error,
          idempotencyKey: item.idempotencyKey,
        })
      }
      commit(restored)
      // The same key returns the analysis already paid for, so picking a job
      // back up after a reload costs nothing.
      for (const job of restored) {
        if (job.stage === 'analyzing') void run(job.id, job.idempotencyKey, job.image)
      }
    })()
  }, [commit, loading, run, userId])

  // Signing out takes the queue with it — one account never sees another's.
  // `loading` matters here: there is no user during the first moments of a
  // page load either, and clearing then would throw away the very jobs the
  // rehydration below is waiting to pick back up.
  useEffect(() => {
    if (loading || userId) return
    for (const url of previews.current.values()) URL.revokeObjectURL(url)
    previews.current.clear()
    blobs.current.clear()
    running.current.clear()
    jobsRef.current = []
    setJobs([])
    rehydrated.current = false
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* nothing to clean up */ }
  }, [loading, userId])

  useEffect(() => {
    const urls = previews.current
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url) }
  }, [])

  const value = useMemo<JobsApi>(() => ({
    jobs,
    get: (id) => (id ? jobs.find((job) => job.id === id) : undefined),
    start, retry, setMeal, complete, discard,
  }), [jobs, start, retry, setMeal, complete, discard])

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useAnalysisJobs(): JobsApi {
  const context = useContext(JobsContext)
  if (!context) throw new Error('useAnalysisJobs must be used inside AnalysisJobsProvider')
  return context
}

/** How far along a running job is, in the words its card uses. */
export const STAGE_COPY: Record<'preparing' | 'uploading' | 'analyzing', string> = {
  preparing: 'Preparing the photo',
  uploading: 'Saving it to your account',
  analyzing: 'Reading what is on the plate',
}
