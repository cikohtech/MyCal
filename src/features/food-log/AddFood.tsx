import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { DraftFood, MealType } from '@/types/domain'
import { useSession } from '@/app/session'
import { useCreateEntry } from '@/app/queries'
import { useAnalysisJobs } from '@/app/analysis-jobs'
import { Button, IconButton, Spinner } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { useToast } from '@/components/Toast'
import { CameraIcon, CloseIcon, ImageIcon, PencilIcon, PlusIcon, RefreshIcon } from '@/components/Icons'
import { DraftFoodCard } from '@/features/food-log/DraftFoodCard'
import { MealPicker } from '@/features/food-log/MealPicker'
import { blankFood, draftFoods, draftsTotal, failureCopy, toNewEntry } from '@/features/food-log/draft'
import {
  CameraError, captureFrame, openCamera, stopStream, validateImageFile,
} from '@/services/camera'
import { suggestMeal } from '@/lib/meals'
import { uuid } from '@/lib/id'
import { kcal } from '@/lib/format'

/**
 * Two screens with one URL between them.
 *
 *   /add              the viewfinder
 *   /add?mode=manual  a blank entry to type
 *   /add?job=<id>     the review for a photo that was read in the background
 *
 * Taking a picture no longer blocks: the shutter hands the frame to the job
 * queue and returns you to your day, and the estimate turns up as a card there.
 */
export function AddFood() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const { user, today } = useSession()
  const userId = user!.id
  const createEntry = useCreateEntry(userId)
  const { get: getJob, start, retry, setMeal: setJobMeal, complete, discard } = useAnalysisJobs()

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const jobId = params.get('job')
  const job = getJob(jobId)
  const manual = params.get('mode') === 'manual'
  /** The viewfinder is the default; a job or a manual entry is a review. */
  const reviewing = manual || Boolean(jobId)

  const [cameraProblem, setCameraProblem] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [foods, setFoods] = useState<DraftFood[]>(() => (manual ? [blankFood()] : []))
  const [meal, setMeal] = useState<MealType>(job?.meal ?? suggestMeal())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [idempotencyKey] = useState(() => uuid())
  /** Which draft this screen has already loaded, so edits are never clobbered. */
  const loadedDraft = useRef<string | null>(null)

  const shutdownCamera = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraReady(false)
  }, [])

  // The camera opens because you navigated here to use it — and closes the
  // moment you leave, every time.
  useEffect(() => {
    if (reviewing) {
      shutdownCamera()
      return
    }
    let cancelled = false
    openCamera()
      .then((stream) => {
        if (cancelled) return stopStream(stream)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
        setCameraReady(true)
        setCameraProblem(null)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setCameraProblem(caught instanceof CameraError ? caught.message : 'The camera could not be opened.')
      })
    return () => {
      cancelled = true
      shutdownCamera()
    }
  }, [reviewing, shutdownCamera])

  useEffect(() => () => shutdownCamera(), [shutdownCamera])

  // "By hand" is a navigation, not a state change, so the same component stays
  // mounted and its initial state does not run again. Without this, arriving at
  // the manual form from the viewfinder gives you a page with nothing to type
  // into.
  useEffect(() => {
    if (manual && !jobId) setFoods((current) => (current.length ? current : [blankFood()]))
  }, [manual, jobId])

  // A job's estimate lands here once, when it arrives. A retry produces a new
  // analysis id, which is what lets a second answer replace the first — while
  // anything you have typed in the meantime survives a re-render.
  useEffect(() => {
    if (!job) return
    if (job.stage === 'ready' && job.draft) {
      const stamp = job.draft.analysis_id ?? job.idempotencyKey
      if (loadedDraft.current === stamp) return
      loadedDraft.current = stamp
      setFoods(job.draft.foods.length ? draftFoods(job.draft) : [blankFood()])
      return
    }
    // Nothing came back at all — give them something to type into rather than
    // an explanation above an empty space.
    if (job.stage === 'failed' && loadedDraft.current !== 'failed') {
      loadedDraft.current = 'failed'
      setFoods((current) => (current.length ? current : [blankFood()]))
    }
  }, [job])

  /** Hands the frame to the queue and gets out of the way. */
  function handOff(blob: Blob) {
    shutdownCamera()
    start(blob, { consumedOn: today })
    toast.note('Reading your photo — it will appear on today.')
    navigate('/today', { replace: true })
  }

  async function shoot() {
    if (!videoRef.current) return
    try {
      handOff(await captureFrame(videoRef.current))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not take that photo.')
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return
    const problem = validateImageFile(file)
    if (problem) return setError(problem)
    handOff(file)
  }

  function leave() {
    if (jobId) discard(jobId)
    navigate('/today')
  }

  async function save() {
    const usable = foods.filter((f) => f.name.trim() && f.nutrition.calories_kcal >= 0)
    if (!usable.length) return setError('Give at least one food a name before saving.')
    if (usable.some((f) => f.nutrition.calories_kcal === 0 && !f.ingredients.length)) {
      setError('One of these has no calories yet. Fill it in, or remove it.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      for (const [index, food] of usable.entries()) {
        await createEntry.mutateAsync({
          entry: toNewEntry(
            food, meal, job?.consumedOn ?? today,
            job?.image ? 'photo_ai' : 'manual',
            { analysisId: job?.draft?.analysis_id ?? null, imageId: job?.image?.id ?? null },
            true,
          ),
          // One key per food so a retried save cannot duplicate the meal.
          idempotencyKey: `${jobId ?? idempotencyKey}:${index}`,
        })
      }
      if (jobId) complete(jobId)
      toast.done(usable.length === 1 ? 'Saved to today' : `${usable.length} foods saved to today`)
      navigate('/today')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  const total = useMemo(() => draftsTotal(foods), [foods])

  /* ------------------------------ viewfinder ----------------------------- */

  if (!reviewing) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center justify-between px-3 pt-safe text-white">
          <IconButton label="Cancel" tone="overlay" onClick={() => navigate('/today')}>
            <CloseIcon size={19} strokeWidth={2.2} />
          </IconButton>
          <p className="text-[0.92rem] font-semibold">Photograph your meal</p>
          <span className="w-[36px]" />
        </div>

        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef} playsInline muted
            className="h-full w-full object-cover"
            style={{ opacity: cameraReady ? 1 : 0, transition: 'opacity 320ms ease' }}
          />
          {!cameraReady && !cameraProblem && (
            <div className="absolute inset-0 grid place-items-center text-white/70">
              <Spinner />
            </div>
          )}
          {cameraProblem && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-[32ch] text-center text-white">
                <CameraIcon size={30} className="mx-auto mb-3 opacity-60" />
                <p className="text-[0.95rem] leading-relaxed">{cameraProblem}</p>
                <Button
                  className="mx-auto mt-4" variant="secondary"
                  icon={<ImageIcon size={17} />}
                  onClick={() => fileRef.current?.click()}
                >
                  Choose from library
                </Button>
              </div>
            </div>
          )}
          {cameraReady && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-7 top-1/2 aspect-square -translate-y-1/2 rounded-[32px] border-2 border-white/30"
              />
              <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[0.82rem] text-white/70">
                Fill the frame with the plate
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-[0.84rem] text-white backdrop-blur-md">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-6 px-9 pb-safe pt-6">
          <button
            type="button" onClick={() => fileRef.current?.click()}
            className="press flex flex-col items-center gap-1.5 text-[0.72rem] font-medium text-white/80"
          >
            <ImageIcon size={24} />
            Library
          </button>

          <button
            type="button" onClick={shoot} disabled={!cameraReady}
            aria-label="Take photo"
            className="press grid h-[74px] w-[74px] place-items-center rounded-full border-[3px] border-white/90 disabled:opacity-40"
          >
            <span className="block h-[60px] w-[60px] rounded-full bg-white" />
          </button>

          <button
            type="button"
            onClick={() => { shutdownCamera(); navigate('/add?mode=manual', { replace: true }) }}
            className="press flex flex-col items-center gap-1.5 text-[0.72rem] font-medium text-white/80"
          >
            <PencilIcon size={24} />
            By hand
          </button>
        </div>

        {/* No `capture` attribute: that is what sends a phone straight to the
            camera and makes this button open the wrong thing entirely. */}
        <input
          ref={fileRef} type="file" accept="image/*" className="sr-only"
          onChange={(e) => {
            chooseFile(e.target.files?.[0])
            // Without this, picking the same photo twice in a row is silent.
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  /* ------------------------------- waiting ------------------------------- */

  // Reached by opening a job that is still being read — from a link, or by
  // getting here before it finished.
  if (job && job.stage !== 'ready' && job.stage !== 'failed') {
    return (
      <WaitingForJob previewUrl={job.previewUrl} onLeave={() => navigate('/today')} />
    )
  }

  if (jobId && !job) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-[1.05rem] font-semibold">That estimate is no longer here</p>
        <p className="max-w-[32ch] text-[0.88rem] leading-relaxed text-[var(--color-ink-3)]">
          It was saved or discarded. Photograph the meal again, or add it by hand.
        </p>
        <Button variant="primary" onClick={() => navigate('/today')}>Back to today</Button>
      </div>
    )
  }

  /* -------------------------------- review ------------------------------- */

  const modelFailed = job?.draft?.status === 'failed'
  const jobBroke = job?.stage === 'failed'
  const copy = modelFailed
    ? failureCopy(job!.draft!.failure_code, job!.draft!.retry_after_seconds)
    : jobBroke
      ? { title: 'That photo did not go through', body: job!.error ?? 'Try again, or describe the meal yourself.' }
      : null

  return (
    <>
      <header className="flex items-start justify-between gap-3 pb-4 pt-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight">
            {job ? 'Check the estimate' : 'Add it by hand'}
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[0.88rem] leading-snug text-[var(--color-ink-2)]">
            {job
              ? 'Change anything that is wrong. Nothing has been logged yet.'
              : 'Type what you ate and roughly what was in it.'}
          </p>
        </div>
        <IconButton label="Cancel" tone="filled" onClick={leave}>
          <CloseIcon size={18} strokeWidth={2.2} />
        </IconButton>
      </header>

      {job?.previewUrl && (
        <img
          src={job.previewUrl} alt="The meal you photographed"
          className="mb-4 h-48 w-full rounded-[var(--radius-card)] object-cover"
        />
      )}

      {copy && (
        <Callout tone="problem" title={copy.title} className="mb-4"
          action={jobId ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<RefreshIcon size={16} />} onClick={() => retry(jobId)}>
                Try again
              </Button>
              <Button size="sm" variant="danger" onClick={() => { discard(jobId); navigate('/add?mode=manual', { replace: true }) }}>
                Delete the photo
              </Button>
            </div>
          ) : undefined}
        >
          {copy.body}
        </Callout>
      )}

      {job?.draft?.notes && !modelFailed && (
        <Callout tone="estimate" className="mb-4">{job.draft.notes}</Callout>
      )}

      <div className="flex flex-col gap-3">
        {foods.map((food, index) => (
          <DraftFoodCard
            key={food.temp_id}
            food={food}
            defaultOpen={foods.length === 1 || (food.confidence !== null && food.confidence < 0.55)}
            onChange={(next) => setFoods(foods.map((f, i) => (i === index ? next : f)))}
            onRemove={() => setFoods(foods.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <Button
        className="mt-3" size="sm" icon={<PlusIcon size={16} strokeWidth={2.2} />}
        onClick={() => setFoods([...foods, blankFood()])}
      >
        Add another food
      </Button>

      <div className="card mt-5 p-4">
        <MealPicker
          value={meal}
          onChange={(next) => { setMeal(next); if (jobId) setJobMeal(jobId, next) }}
        />
      </div>

      {error && <Callout tone="problem" className="mt-4">{error}</Callout>}

      <div className="glass-canvas hairline-t sticky bottom-0 -mx-4 mt-6 px-4 pb-safe pt-3">
        <div className="mb-2 flex items-baseline justify-between px-0.5 text-[0.88rem]">
          <span className="text-[var(--color-ink-2)]">Adds to today</span>
          <span className="tnum text-[1.08rem] font-semibold">{kcal(total.calories_kcal)} kcal</span>
        </div>
        <Button variant="primary" size="lg" full loading={saving} onClick={save}>
          Save to today
        </Button>
      </div>
    </>
  )
}

/** Opened a job that is still running: say so, and offer the way out. */
function WaitingForJob({ previewUrl, onLeave }: { previewUrl: string | null; onLeave: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 text-center">
      {previewUrl && (
        <img
          src={previewUrl} alt=""
          className="h-[132px] w-[132px] rounded-[20px] object-cover opacity-70"
        />
      )}
      <span className="grid h-[44px] w-[44px] place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink)]">
        <Spinner />
      </span>
      <div>
        <p className="text-[1.08rem] font-semibold">Still reading this one</p>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[0.87rem] leading-relaxed text-[var(--color-ink-3)]">
          You do not have to wait here. It will be on your day when it is done.
        </p>
      </div>
      <Button variant="secondary" onClick={onLeave}>Back to today</Button>
    </div>
  )
}
