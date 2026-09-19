import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BarcodeDraft, DraftFood, MealType } from '@/types/domain'
import { useSession } from '@/app/session'
import { useCreateEntry } from '@/app/queries'
import { store } from '@/services/db'
import { Button, IconButton, Spinner } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { TextField } from '@/components/Field'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { BarcodeIcon, CloseIcon, PencilIcon } from '@/components/Icons'
import { DraftFoodCard } from '@/features/food-log/DraftFoodCard'
import { MealPicker } from '@/features/food-log/MealPicker'
import { blankFood, draftTotal, foodFromReference, toNewEntry } from '@/features/food-log/draft'
import { CameraError, openCamera, stopStream } from '@/services/camera'
import { barcodeSupport, isPlausibleBarcode, startScanning, type ScannerHandle } from '@/services/barcode'
import { suggestMeal } from '@/lib/meals'
import { uuid } from '@/lib/id'
import { kcal } from '@/lib/format'

type Phase = 'scanning' | 'looking-up' | 'review'

export function ScanBarcode() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, today } = useSession()
  const userId = user!.id
  const createEntry = useCreateEntry(userId)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerRef = useRef<ScannerHandle | null>(null)

  const [phase, setPhase] = useState<Phase>('scanning')
  const [cameraProblem, setCameraProblem] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState<BarcodeDraft | null>(null)
  const [food, setFood] = useState<DraftFood | null>(null)
  const [meal, setMeal] = useState<MealType>(suggestMeal())
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [idempotencyKey] = useState(() => uuid())

  const teardown = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current = null
    stopStream(streamRef.current)
    streamRef.current = null
    setReady(false)
  }, [])

  const lookUp = useCallback(async (code: string) => {
    teardown()
    setPhase('looking-up')
    setError(null)
    const result = await store.lookupBarcode(userId, code)
    setDraft(result)
    setFood(result.reference ? foodFromReference(result.reference) : blankFood())
    setPhase('review')
  }, [teardown, userId])

  useEffect(() => {
    if (phase !== 'scanning') return
    let cancelled = false

    openCamera()
      .then((stream) => {
        if (cancelled) return stopStream(stream)
        streamRef.current = stream
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        void videoRef.current.play()
        setReady(true)
        scannerRef.current = startScanning(
          videoRef.current,
          (code) => void lookUp(code),
          (message) => setError(message),
        )
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCameraProblem(caught instanceof CameraError ? caught.message : 'The camera could not be opened.')
        }
      })

    return () => {
      cancelled = true
      teardown()
    }
  }, [phase, lookUp, teardown])

  useEffect(() => () => teardown(), [teardown])

  async function save() {
    if (!food) return
    if (!food.name.trim()) return setError('Give this product a name before saving.')
    if (food.nutrition.calories_kcal <= 0) return setError('Enter the calories from the label.')

    setSaving(true)
    setError(null)
    try {
      await createEntry.mutateAsync({
        entry: toNewEntry(food, meal, today, 'barcode', {}, draft?.status !== 'found'),
        idempotencyKey,
      })
      toast.done('Saved to today')
      navigate('/today')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  function submitManual() {
    const code = manualCode.replace(/\D/g, '')
    if (!isPlausibleBarcode(code)) {
      setError('That is not a valid UPC or EAN number — check the digits under the bars.')
      return
    }
    setManualOpen(false)
    void lookUp(code)
  }

  /* ------------------------------- scanning ------------------------------ */

  if (phase === 'scanning') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center justify-between px-3 pt-safe text-white">
          <IconButton label="Cancel" tone="overlay" onClick={() => navigate('/today')}>
            <CloseIcon size={19} strokeWidth={2.2} />
          </IconButton>
          <p className="text-[0.92rem] font-semibold">Scan the barcode</p>
          <span className="w-[36px]" />
        </div>

        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef} playsInline muted
            className="h-full w-full object-cover"
            style={{ opacity: ready ? 1 : 0, transition: 'opacity 320ms ease' }}
          />
          {!ready && !cameraProblem && (
            <div className="absolute inset-0 grid place-items-center text-white/70"><Spinner /></div>
          )}
          {cameraProblem && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-[34ch] text-center text-white">
                <BarcodeIcon size={30} className="mx-auto mb-3 opacity-60" />
                <p className="text-[0.95rem] leading-relaxed">{cameraProblem}</p>
              </div>
            </div>
          )}
          {ready && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-9 top-1/2 h-[128px] -translate-y-1/2 rounded-[20px] border-2 border-white/60"
              />
              <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[0.84rem] text-white/70">
                Hold the bars inside the frame
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-[0.84rem] text-white backdrop-blur-md">{error}</p>
        )}

        <div className="flex items-center justify-center gap-3 px-6 pb-safe pt-5">
          <button
            type="button" onClick={() => setManualOpen(true)}
            className="press flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-[0.9rem] font-medium text-white backdrop-blur-md"
          >
            <PencilIcon size={18} />
            Type the number
          </button>
        </div>

        <Sheet
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          title="Enter the barcode"
          description={
            barcodeSupport() === 'fallback'
              ? 'This browser uses a slower software reader, so typing the digits is often quicker.'
              : 'The digits printed under the bars.'
          }
          footer={<Button variant="primary" size="lg" full onClick={submitManual}>Look it up</Button>}
        >
          <TextField
            label="Barcode number" inputMode="numeric" data-autofocus
            value={manualCode} onChange={(e) => setManualCode(e.target.value)}
            placeholder="5000112637922"
          />
        </Sheet>
      </div>
    )
  }

  /* ------------------------------ looking up ----------------------------- */

  if (phase === 'looking-up') {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink)]">
          <Spinner />
        </span>
        <div>
          <p className="text-[1.08rem] font-semibold">Looking up the product</p>
          <p className="mx-auto mt-1.5 max-w-[30ch] text-[0.87rem] leading-relaxed text-[var(--color-ink-3)]">
            Scanning never logs anything on its own — you confirm the amount first.
          </p>
        </div>
      </div>
    )
  }

  /* -------------------------------- review ------------------------------- */

  const notFound = draft?.status !== 'found'

  return (
    <>
      <header className="flex items-start justify-between gap-3 pb-4 pt-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight">
            {notFound ? 'Enter the label' : 'Check the amount'}
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[0.88rem] leading-snug text-[var(--color-ink-2)]">
            {notFound
              ? 'Copy the numbers from the nutrition panel for the amount you actually had.'
              : 'Package nutrition is used as-is. Set how much of it you ate.'}
          </p>
        </div>
        <IconButton label="Cancel" tone="filled" onClick={() => navigate('/today')}>
          <CloseIcon size={18} strokeWidth={2.2} />
        </IconButton>
      </header>

      {notFound && draft && (
        <Callout tone="problem" title={`Barcode ${draft.barcode}`} className="mb-4"
          action={
            <Button size="sm" onClick={() => { setDraft(null); setPhase('scanning') }}>
              Scan a different code
            </Button>
          }
        >
          {draft.message ?? 'No product matches this barcode.'}
        </Callout>
      )}

      {!notFound && draft?.reference && (
        <Callout tone="note" className="mb-4">
          From Open Food Facts, retrieved{' '}
          {draft.reference.retrieved_at ? new Date(draft.reference.retrieved_at).toLocaleDateString() : 'just now'}.
          Packaging changes — check it against the panel in your hand.
        </Callout>
      )}

      {food && (
        <DraftFoodCard food={food} defaultOpen onChange={setFood} onRemove={() => navigate('/today')} />
      )}

      <div className="card mt-4 p-4">
        <MealPicker value={meal} onChange={setMeal} />
      </div>

      {error && <Callout tone="problem" className="mt-4">{error}</Callout>}

      <div className="glass-canvas hairline-t sticky bottom-0 -mx-4 mt-6 px-4 pb-safe pt-3">
        <div className="mb-2 flex items-baseline justify-between px-0.5 text-[0.88rem]">
          <span className="text-[var(--color-ink-2)]">Adds to today</span>
          <span className="tnum text-[1.08rem] font-semibold">{kcal(food ? draftTotal(food).calories_kcal : 0)} kcal</span>
        </div>
        <Button variant="primary" size="lg" full loading={saving} onClick={save}>
          Save to today
        </Button>
      </div>
    </>
  )
}
