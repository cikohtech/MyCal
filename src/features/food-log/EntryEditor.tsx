import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { DraftFood, MealType } from '@/types/domain'
import { useSession } from '@/app/session'
import { useDeleteEntry, useUpdateEntry } from '@/app/queries'
import { store } from '@/services/db'
import { Button, IconButton, Spinner } from '@/components/Button'
import { Callout, EstimateTag } from '@/components/Callout'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { TrashIcon } from '@/components/Icons'
import { NavBar } from '@/components/NavBar'
import { DraftFoodCard } from '@/features/food-log/DraftFoodCard'
import { MealPicker } from '@/features/food-log/MealPicker'
import { draftTotal, entryToDraft } from '@/features/food-log/draft'

import { friendlyDate } from '@/lib/dates'
import { kcal } from '@/lib/format'

/** Editing a saved entry recalculates the day the moment you save. */
export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, today } = useSession()
  const userId = user!.id

  const updateEntry = useUpdateEntry(userId)
  const deleteEntry = useDeleteEntry(userId)

  const entryQuery = useQuery({
    queryKey: ['entry', id],
    queryFn: () => store.getEntry(id!),
    enabled: Boolean(id),
  })

  const [food, setFood] = useState<DraftFood | null>(null)
  const [meal, setMeal] = useState<MealType>('unassigned')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entry = entryQuery.data ?? null

  useEffect(() => {
    if (!entry) return
    setFood(entryToDraft(entry))
    setMeal(entry.meal_type)
    if (!entry.food_image_id) return

    let cancelled = false
    store.getFoodImage(entry.food_image_id)
      .then((image) => (image ? store.getImageUrl(image) : null))
      .then((url) => { if (!cancelled) setImageUrl(url) })
      .catch(() => { if (!cancelled) setImageUrl(null) })
    return () => { cancelled = true }
  }, [entry])

  if (entryQuery.isLoading) {
    return <div className="grid min-h-[60dvh] place-items-center text-[var(--color-ink-3)]"><Spinner /></div>
  }

  if (!entry || !food) {
    return (
      <div className="pt-10">
        <Callout tone="problem" title="That entry is gone">
          It may have been deleted on another device.
        </Callout>
        <Button className="mt-4" variant="primary" onClick={() => navigate('/today')}>Back to today</Button>
      </div>
    )
  }

  const total = draftTotal(food)

  async function save() {
    if (!food || !entry) return
    if (!food.name.trim()) return setError('Give this food a name.')
    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        patch: {
          display_name: food.name.trim(),
          quantity: food.quantity,
          quantity_unit: food.quantity_unit,
          meal_type: meal,
          nutrition_snapshot: food.nutrition,
          user_corrected: true,
          parts: food.ingredients.map((part) => ({
            kind: part.kind,
            name: part.name,
            quantity: part.quantity,
            quantity_unit: part.quantity_unit,
            nutrition_snapshot: part.nutrition,
          })),
        },
      })
      toast.done('Saved')
      navigate(entry.consumed_on === today ? '/today' : `/today?date=${entry.consumed_on}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save those changes.')
    }
  }

  async function remove() {
    if (!entry) return
    await deleteEntry.mutateAsync(entry)
    toast.done('Removed')
    navigate(entry.consumed_on === today ? '/today' : `/today?date=${entry.consumed_on}`)
  }

  return (
    <>
      <NavBar
        title="Edit entry"
        back="Today"
        onBack={() => navigate(-1)}
        trailing={
          <IconButton
            label="Remove this entry" className="text-[var(--color-critical)]"
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon size={19} />
          </IconButton>
        }
      />

      <header className="pb-4 pt-3">
        <h1 className="text-[1.75rem] leading-tight">{entry.display_name}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.84rem] text-[var(--color-ink-3)]">
          <span>Logged for {friendlyDate(entry.consumed_on, today).toLowerCase()}</span>
          <EstimateTag
            provenance={entry.user_corrected ? 'corrected' : entry.source === 'barcode' ? 'label' : entry.source === 'photo_ai' ? 'estimate' : 'reference'}
          />
        </p>
      </header>

      {imageUrl && (
        <img
          src={imageUrl} alt="The meal you photographed"
          className="mb-4 h-44 w-full rounded-[var(--radius-card)] object-cover"
        />
      )}

      <DraftFoodCard
        food={food}
        defaultOpen
        onChange={setFood}
        onRemove={() => setConfirmDelete(true)}
      />

      <div className="card mt-4 p-4">
        <MealPicker value={meal} onChange={setMeal} />
      </div>

      <Callout tone="note" className="mt-4">
        Changing these values updates {friendlyDate(entry.consumed_on, today).toLowerCase()}'s
        totals only. The original {entry.source === 'photo_ai' ? 'estimate' : 'record'} is kept
        as the source on this entry.
      </Callout>

      {error && <Callout tone="problem" className="mt-4">{error}</Callout>}

      <div className="glass-canvas hairline-t sticky bottom-0 -mx-4 mt-6 px-4 pb-safe pt-3">
        <div className="mb-2 flex items-baseline justify-between px-0.5 text-[0.88rem]">
          <span className="text-[var(--color-ink-2)]">This entry</span>
          <span className="tnum text-[1.08rem] font-semibold">{kcal(total.calories_kcal)} kcal</span>
        </div>
        <Button
          variant="primary" size="lg" full
          loading={updateEntry.isPending} onClick={save}
        >
          Save changes
        </Button>
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Remove ${entry.display_name}?`}
        description="This takes it out of the day's totals. It cannot be undone."
        footer={
          <div className="flex gap-2.5">
            <Button full size="lg" onClick={() => setConfirmDelete(false)} data-autofocus>Keep it</Button>
            <Button full size="lg" variant="danger" loading={deleteEntry.isPending} onClick={remove}>
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-[0.88rem] leading-relaxed text-[var(--color-ink-2)]">
          {kcal(total.calories_kcal)} kcal will come off{' '}
          {friendlyDate(entry.consumed_on, today).toLowerCase()}.
          {entry.food_image_id && ' The photo stays in your history until you delete it from your profile.'}
        </p>
      </Sheet>
    </>
  )
}
