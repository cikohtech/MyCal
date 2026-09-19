import { useEffect, useMemo, useRef, useState } from 'react'
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
import { validateImageFile } from '@/services/camera'
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

  const cameraFileRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Guards the auto-open below so it fires once per visit, not on every render. */
  const openedCamera = useRef(false)

  const jobId = params.get('job')
  const job = getJob(jobId)
  const manual = params.get('mode') === 'manual'
  /** The viewfinder is the default; a job or a manual entry is a review. */
  const reviewing = manual || Boolean(jobId)

  const [foods, setFoods] = useState<DraftFood[]>(() => (manual ? [blankFood()] : []))
  const [meal, setMeal] = useState<MealType>(job?.meal ?? suggestMeal())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [idempotencyKey] = useState(() => uuid())
  /** Which draft this screen has already loaded, so edits are never clobbered. */
  const loadedDraft = useRef<string | null>(null)

  // Arriving here to shoot opens the device's own camera app immediately —
  // no live preview of our own, so no `getUserMedia` grant to lose. iOS ties
  // that grant to the page's process and drops it whenever the app is killed
  // in the background, which meant re-prompting on every relaunch; handing
  // the shot off to the native camera (like a plain `capture` file input)
  // sidesteps that permission entirely, same as the file library button below.
  useEffect(() => {
    if (reviewing || openedCamera.current) return
    openedCamera.current = true
    cameraFileRef.current?.click()
  }, [reviewing])

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
    start(blob, { consumedOn: today })
    toast.note('Reading your photo — it will appear on today.')
    navigate('/today', { replace: true })
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

        <div className="relative flex-1 grid place-items-center">
          {/* The tap here is what gives the input.click() below a genuine user
              gesture if the auto-open above got missed or blocked. */}
          <button
            type="button"
            onClick={() => cameraFileRef.current?.click()}
            className="press flex flex-col items-center gap-3 text-white/85"
          >
            <span className="grid h-[92px] w-[92px] place-items-center rounded-full border-[3px] border-white/70">
              <CameraIcon size={34} />
            </span>
            <span className="text-[0.9rem] font-medium">Tap to open the camera</span>
          </button>
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-[0.84rem] text-white backdrop-blur-md">
            {error}
          </p>
        )}

        <div className="flex items-center justify-center gap-12 px-9 pb-safe pt-6">
          <button
            type="button" onClick={() => fileRef.current?.click()}
            className="press flex flex-col items-center gap-1.5 text-[0.72rem] font-medium text-white/80"
          >
            <ImageIcon size={24} />
            Library
          </button>

          <button
            type="button"
            onClick={() => navigate('/add?mode=manual', { replace: true })}
            className="press flex flex-col items-center gap-1.5 text-[0.72rem] font-medium text-white/80"
          >
            <PencilIcon size={24} />
            By hand
          </button>
        </div>

        {/* `capture` sends this straight to the device's own camera app —
            never a live preview of our own — so there is no `getUserMedia`
            grant for iOS to drop when the app is cleared from the background. */}
        <input
          ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="sr-only"
          onChange={(e) => {
            chooseFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {/* No `capture` attribute here: that is what sends a phone straight to the
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
