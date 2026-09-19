import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AnalysisDraft, DraftFood, FoodImage, MealType } from '@/types/domain'
import { useSession } from '@/app/session'
import { useCreateEntry } from '@/app/queries'
import { store } from '@/services/db'
import { Button, IconButton, Spinner } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { useToast } from '@/components/Toast'
import { CameraIcon, CloseIcon, ImageIcon, PencilIcon, PlusIcon, RefreshIcon } from '@/components/Icons'
import { DraftFoodCard } from '@/features/food-log/DraftFoodCard'
import { MealPicker } from '@/features/food-log/MealPicker'
import { blankFood, draftFoods, draftsTotal, failureCopy, toNewEntry } from '@/features/food-log/draft'
import {
  CameraError, captureFrame, openCamera, prepareImage, stopStream, validateImageFile,
} from '@/services/camera'
import { suggestMeal } from '@/lib/meals'
import { uuid } from '@/lib/id'
import { kcal } from '@/lib/format'

type Phase = 'capture' | 'working' | 'review'

export function AddFood() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const { user, today } = useSession()
  const userId = user!.id
  const createEntry = useCreateEntry(userId)

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startedManual = params.get('mode') === 'manual'

  const [phase, setPhase] = useState<Phase>(startedManual ? 'review' : 'capture')
  const [cameraProblem, setCameraProblem] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [status, setStatus] = useState('')
  const [foods, setFoods] = useState<DraftFood[]>(startedManual ? [blankFood()] : [])
  const [image, setImage] = useState<FoodImage | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisDraft | null>(null)
  const [meal, setMeal] = useState<MealType>(suggestMeal())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [idempotencyKey] = useState(() => uuid())

  const shutdownCamera = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraReady(false)
  }, [])

  // The camera opens because you navigated here to use it — and closes the
  // moment you leave, every time.
  useEffect(() => {
    if (phase !== 'capture') {
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
  }, [phase, shutdownCamera])

  useEffect(() => () => shutdownCamera(), [shutdownCamera])

  async function handleBlob(blob: Blob) {
    setError(null)
    setPhase('working')
    setStatus('Preparing the photo')
    try {
      const prepared = await prepareImage(blob)
      setStatus('Saving it to your account')
      const uploaded = await store.uploadFoodImage(userId, prepared.blob, prepared.mimeType)
      setImage(uploaded)
      setImageUrl(await store.getImageUrl(uploaded))

      setStatus('Looking at what is on the plate')
      const draft = await store.analyzePhoto(userId, uploaded, idempotencyKey)
      setAnalysis(draft)
      setFoods(draft.foods.length ? draftFoods(draft) : [blankFood()])
      setPhase('review')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That photo could not be saved.')
      setPhase('capture')
    }
  }

  async function shoot() {
    if (!videoRef.current) return
    try {
      const blob = await captureFrame(videoRef.current)
      shutdownCamera()
      await handleBlob(blob)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not take that photo.')
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return
    const problem = validateImageFile(file)
    if (problem) return setError(problem)
    shutdownCamera()
    void handleBlob(file)
  }

  async function retryAnalysis() {
    if (!image) return
    setPhase('working')
    setStatus('Trying the analysis again')
    const draft = await store.analyzePhoto(userId, image, uuid())
    setAnalysis(draft)
    if (draft.foods.length) setFoods(draftFoods(draft))
    setPhase('review')
  }

  async function discardAndLeave() {
    if (image) await store.deleteFoodImage(image).catch(() => undefined)
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
            food, meal, today,
            image ? 'photo_ai' : 'manual',
            { analysisId: analysis?.analysis_id ?? null, imageId: image?.id ?? null },
            true,
          ),
          // One key per food so a retried save cannot duplicate the meal.
          idempotencyKey: `${idempotencyKey}:${index}`,
        })
      }
      toast.done(usable.length === 1 ? 'Saved to today' : `${usable.length} foods saved to today`)
      navigate('/today')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  const total = draftsTotal(foods)

  /* ------------------------------- capture ------------------------------- */

  if (phase === 'capture') {
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
            onClick={() => { shutdownCamera(); setFoods([blankFood()]); setPhase('review') }}
            className="press flex flex-col items-center gap-1.5 text-[0.72rem] font-medium text-white/80"
          >
            <PencilIcon size={24} />
            By hand
          </button>
        </div>

        <input
          ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only"
          onChange={(e) => chooseFile(e.target.files?.[0])}
        />
      </div>
    )
  }

  /* ------------------------------- working ------------------------------- */

  if (phase === 'working') {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink)]">
          <Spinner />
        </span>
        <div>
          <p className="text-[1.08rem] font-semibold">{status}</p>
          <p className="mx-auto mt-1.5 max-w-[30ch] text-[0.87rem] leading-relaxed text-[var(--color-ink-3)]">
            Nothing is added to your day until you have seen it and said yes.
          </p>
        </div>
      </div>
    )
  }

  /* -------------------------------- review ------------------------------- */

  const failed = analysis && analysis.status === 'failed'
  const copy = failed ? failureCopy(analysis.failure_code) : null

  return (
    <>
      <header className="flex items-start justify-between gap-3 pb-4 pt-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight">
            {image ? 'Check the estimate' : 'Add it by hand'}
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[0.88rem] leading-snug text-[var(--color-ink-2)]">
            {image
              ? 'Change anything that is wrong. Nothing has been logged yet.'
              : 'Type what you ate and roughly what was in it.'}
          </p>
        </div>
        <IconButton label="Cancel" tone="filled" onClick={discardAndLeave}>
          <CloseIcon size={18} strokeWidth={2.2} />
        </IconButton>
      </header>

      {imageUrl && (
        <img
          src={imageUrl} alt="The meal you photographed"
          className="mb-4 h-48 w-full rounded-[var(--radius-card)] object-cover"
        />
      )}

      {copy && (
        <Callout tone="problem" title={copy.title} className="mb-4"
          action={image ? (
            <div className="flex gap-2">
              <Button size="sm" icon={<RefreshIcon size={16} />} onClick={retryAnalysis}>Try again</Button>
              <Button size="sm" variant="danger" onClick={async () => {
                await store.deleteFoodImage(image)
                setImage(null)
                setImageUrl(null)
                setAnalysis(null)
              }}>
                Delete the photo
              </Button>
            </div>
          ) : undefined}
        >
          {copy.body}
        </Callout>
      )}

      {analysis?.notes && !failed && (
        <Callout tone="estimate" className="mb-4">{analysis.notes}</Callout>
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
        <MealPicker value={meal} onChange={setMeal} />
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
