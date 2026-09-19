import { useMemo, useState } from 'react'
import { useSession } from '@/app/session'
import { useDeleteWeight, useSaveWeight, useTargetOn, useWeights } from '@/app/queries'
import { Button, IconButton } from '@/components/Button'
import { HeroNumberField, TextField } from '@/components/Field'
import { Sheet } from '@/components/Sheet'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { WeightChart } from '@/components/WeightChart'
import { ListGroup, ListRow } from '@/components/List'
import { LargeTitle } from '@/components/NavBar'
import { useToast } from '@/components/Toast'
import { PlusIcon, ScaleIcon, TrashIcon } from '@/components/Icons'
import { calcBmi, bmiBand, calcWeightTrend, lbToKg } from '@/lib/calc'
import { addDays, friendlyDate } from '@/lib/dates'
import { signed, weight as formatWeight } from '@/lib/format'

export function Weight() {
  const toast = useToast()
  const { user, profile, today } = useSession()
  const userId = user!.id

  const weightsQuery = useWeights(userId)
  const targetQuery = useTargetOn(userId, today)
  const saveWeight = useSaveWeight(userId)
  const deleteWeight = useDeleteWeight(userId)

  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const unit = profile?.unit_preference ?? 'metric'
  const unitLabel = unit === 'imperial' ? 'lb' : 'kg'
  const weights = weightsQuery.data ?? []
  const trend = useMemo(() => calcWeightTrend(weights), [weights])

  async function submit() {
    const raw = Number(value)
    if (!Number.isFinite(raw) || raw <= 0) {
      return setError('Enter the number from the scale.')
    }
    const kg = unit === 'imperial' ? lbToKg(raw) : raw
    if (kg < 25 || kg > 400) {
      return setError(unit === 'imperial' ? 'Enter a weight between 55 and 880 lb.' : 'Enter a weight between 25 and 400 kg.')
    }
    try {
      await saveWeight.mutateAsync({ recordedOn: date, weightKg: kg, note: note.trim() || null })
      toast.done(`Saved for ${friendlyDate(date, today).toLowerCase()}`)
      setAdding(false)
      setValue('')
      setNote('')
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that weight.')
    }
  }

  const heightCm = profile?.height_cm ?? 0
  const currentBmi = trend.latest_kg && heightCm ? calcBmi(trend.latest_kg, heightCm) : null

  return (
    <>
      <LargeTitle
        title="Weight"
        subtitle="Measured over time"
        trailing={
          <Button
            variant="primary" size="sm" icon={<PlusIcon size={17} strokeWidth={2.2} />}
            onClick={() => { setDate(today); setValue(''); setAdding(true) }}
          >
            Add
          </Button>
        }
      />

      {weights.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ScaleIcon size={26} />}
            title="No weigh-ins yet"
            body="Weigh yourself at roughly the same time of day, a few times a week. Daily readings bounce; the line through them is what matters."
            action={<Button variant="primary" onClick={() => setAdding(true)}>Record your weight</Button>}
          />
        </div>
      ) : (
        <>
          <section className="card px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.78rem] font-medium uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
                  Last weighed
                </p>
                <p className="tnum mt-1 text-[2.9rem] font-bold leading-none tracking-[-0.035em]">
                  {formatWeight(trend.latest_kg ?? 0, unit).replace(/ (kg|lb)$/, '')}
                  <span className="ml-1.5 text-[1.1rem] font-medium text-[var(--color-ink-3)]">
                    {unitLabel}
                  </span>
                </p>
                <p className="mt-1.5 text-[0.85rem] text-[var(--color-ink-2)]">
                  {friendlyDate(weights.at(-1)!.recorded_on, today)}
                </p>
              </div>
              {currentBmi && (
                <div className="w-[120px] shrink-0 rounded-[12px] bg-[var(--color-fill)] px-3 py-2.5 text-center">
                  <p className="text-[0.74rem] font-medium uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
                    BMI
                  </p>
                  <p className="tnum text-[1.4rem] font-semibold leading-tight">{currentBmi.toFixed(1)}</p>
                  <p className="mt-0.5 text-[0.7rem] leading-tight text-[var(--color-ink-3)]">
                    {bmiBand(currentBmi)}
                  </p>
                </div>
              )}
            </div>

            {weights.length >= 2 && (
              <div className="mt-5">
                <WeightChart
                  raw={weights.map((w) => ({ recorded_on: w.recorded_on, weight_kg: w.weight_kg }))}
                  smoothed={trend.smoothed}
                  unit={unit}
                  today={today}
                />
              </div>
            )}
          </section>

          <section className="card mt-3 px-5 py-5">
            <h2 className="text-[1.05rem]">The trend</h2>
            {trend.slope_kg_per_week !== null ? (
              <>
                <p className="tnum mt-2 text-[1.9rem] font-bold leading-none tracking-[-0.03em]">
                  {signed(unit === 'imperial' ? trend.slope_kg_per_week * 2.2046 : trend.slope_kg_per_week, 2)}
                  <span className="ml-1.5 text-[0.9rem] font-medium text-[var(--color-ink-3)]">
                    {unitLabel} per week
                  </span>
                </p>
                <p className="mt-2.5 text-[0.85rem] leading-relaxed text-[var(--color-ink-2)]">
                  A straight line fitted through {weights.length} weigh-ins over{' '}
                  {Math.round(trend.span_days)} days. Direction, not a prediction: hydration,
                  salt, sleep and training all move the scale in ways that have nothing to do
                  with fat.
                </p>
              </>
            ) : (
              <p className="mt-2 max-w-[44ch] text-[0.88rem] leading-relaxed text-[var(--color-ink-2)]">
                Not enough to draw a line yet. Four weigh-ins spread over at least a week and a
                trend will appear here.
              </p>
            )}

            {targetQuery.data && trend.slope_kg_per_week !== null && (
              <p className="hairline-t mt-4 pt-3.5 text-[0.85rem] leading-relaxed text-[var(--color-ink-2)]">
                Your current target is {Math.round(targetQuery.data.calorie_target_kcal)} kcal a
                day, set for a {profile?.goal === 'lose' ? 'loss' : profile?.goal === 'gain' ? 'gain' : 'hold'}.
                {' '}If the measured trend disagrees after a few weeks, adjust the target in your
                profile rather than the other way around.
              </p>
            )}
          </section>

          <div className="mt-6">
            <ListGroup label="Every weigh-in">
              {[...weights].reverse().map((entry, index, list) => {
                const previous = list[index + 1]
                const delta = previous ? entry.weight_kg - previous.weight_kg : null
                return (
                  <ListRow
                    key={entry.id}
                    title={friendlyDate(entry.recorded_on, today)}
                    detail={entry.note || undefined}
                    trailing={
                      <span className="flex shrink-0 items-center gap-2.5">
                        {delta !== null && Math.abs(delta) >= 0.05 && (
                          <span className="tnum text-[0.78rem] text-[var(--color-ink-3)]">
                            {signed(unit === 'imperial' ? delta * 2.2046 : delta, 1)}
                          </span>
                        )}
                        <span className="tnum text-[0.98rem] font-medium">
                          {formatWeight(entry.weight_kg, unit)}
                        </span>
                        <IconButton
                          label={`Remove the weigh-in for ${friendlyDate(entry.recorded_on, today)}`}
                          className="-mr-1.5 h-[32px] w-[32px] hover:text-[var(--color-critical)]"
                          onClick={() => {
                            deleteWeight.mutate(entry.id)
                            toast.done(`Removed ${friendlyDate(entry.recorded_on, today).toLowerCase()}`, {
                              label: 'Undo',
                              onClick: () => saveWeight.mutate({
                                recordedOn: entry.recorded_on,
                                weightKg: entry.weight_kg,
                                note: entry.note,
                              }),
                            })
                          }}
                        >
                          <TrashIcon size={17} />
                        </IconButton>
                      </span>
                    }
                  />
                )
              })}
            </ListGroup>
          </div>
        </>
      )}

      <div className="h-8" />

      <Sheet
        open={adding}
        onClose={() => { setAdding(false); setError(null) }}
        title="Record your weight"
        description="One entry per day. Saving again for the same day replaces it."
        footer={
          <Button variant="primary" size="lg" full loading={saveWeight.isPending} onClick={submit}>
            Save weight
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="card px-4 py-7">
            <HeroNumberField
              label="Weight" value={value} onChange={setValue}
              unit={unitLabel} placeholder={unit === 'imperial' ? '160' : '72'} autoFocus
            />
          </div>
          <div className="card p-4">
            <div className="flex flex-col gap-3.5">
              <TextField
                label="Date" type="date" value={date}
                max={today} min={addDays(today, -365)}
                onChange={(e) => setDate(e.target.value)}
              />
              <TextField
                label="Note" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Optional — after a long flight, before breakfast…"
              />
            </div>
          </div>
          {error && <Callout tone="problem">{error}</Callout>}
        </div>
      </Sheet>
    </>
  )
}
