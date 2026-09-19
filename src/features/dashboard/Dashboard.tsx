import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { FoodEntry, Goal, UnitPreference } from '@/types/domain'
import type { TrendPoint } from '@/lib/calc'
import { useSession } from '@/app/session'
import { useEntries, useEntriesRange, useTargetOn, useWeights } from '@/app/queries'
import { CalorieRing } from '@/components/CalorieRing'
import { Meter } from '@/components/Meter'
import { Button, IconButton } from '@/components/Button'
import { ListGroup, ListRow } from '@/components/List'
import { EmptyState } from '@/components/EmptyState'
import { Callout } from '@/components/Callout'
import {
  BarcodeIcon, CameraIcon, ChevronLeftIcon, ChevronRightIcon, LedgerIcon, PencilIcon,
} from '@/components/Icons'
import { MealList, mealSegments } from '@/features/dashboard/MealList'
import { NutrientPanel } from '@/features/dashboard/NutrientPanel'
import { addDays, compareIso, friendlyDate, longDate, parseIsoDate, weekdayName } from '@/lib/dates'
import { calcWeightTrend, entryTotal, projectWeightChangeKg, sumDay } from '@/lib/calc'
import { kcal, signed, weight as formatWeight } from '@/lib/format'
import { cn } from '@/lib/cn'

export function Dashboard() {
  const { user, profile, today } = useSession()
  const userId = user!.id
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today
  const isToday = date === today
  const isFuture = compareIso(date, today) > 0

  const entriesQuery = useEntries(userId, date)
  const targetQuery = useTargetOn(userId, date)
  const weightsQuery = useWeights(userId)
  const weekQuery = useEntriesRange(userId, addDays(today, -6), today)

  const entries = entriesQuery.data ?? []
  const target = targetQuery.data ?? null
  const totals = useMemo(() => sumDay(entries, date), [entries, date])
  const segments = useMemo(() => mealSegments(entries), [entries])

  const calorieTarget = target?.calorie_target_kcal ?? 0
  const unit = profile?.unit_preference ?? 'metric'

  const goToDate = (next: string) => {
    if (next === today) setParams({})
    else setParams({ date: next })
  }

  return (
    <>
      <header className="flex items-end justify-between gap-3 pb-3 pt-2">
        <div className="min-w-0">
          <p className="text-[0.84rem] font-medium text-[var(--color-ink-3)]">{longDate(date)}</p>
          <h1 className="mt-0.5 truncate text-[2rem] leading-[1.1]">
            {friendlyDate(date, today)}
          </h1>
        </div>
        {!isToday && (
          <Button size="sm" variant="tinted" className="mb-1" onClick={() => goToDate(today)}>
            Today
          </Button>
        )}
      </header>

      <DayStrip date={date} today={today} onPick={goToDate} />

      {isFuture && (
        <Callout tone="note" className="mt-4">
          This day hasn’t happened yet. Food is always logged to the day you’re in.
        </Callout>
      )}

      {/* The day, as one measure. */}
      <section className="card mt-4 px-5 pb-5 pt-6">
        <CalorieRing
          segments={segments}
          consumed={totals.calories_kcal}
          target={calorieTarget}
          animate={!entriesQuery.isFetching}
        />
      </section>

      {/* Macros. */}
      {target && (
        <section className="card mt-3 flex flex-col gap-4 px-5 py-5">
          <Meter label="Protein" value={totals.protein_g} target={target.protein_target_g} unit="g" color="var(--color-protein)" />
          <Meter label="Carbs" value={totals.carbs_g} target={target.carbs_target_g} unit="g" color="var(--color-carbs)" />
          <Meter label="Fat" value={totals.fat_g} target={target.fat_target_g} unit="g" color="var(--color-fat)" />
          <Meter
            label="Fibre" value={totals.fibre_g} target={target.fibre_target_g} unit="g"
            color="var(--color-fibre)" unknownNote="not reported"
          />
        </section>
      )}

      {/* Quick actions, only for the day you are in. */}
      {isToday && (
        <nav aria-label="Add food" className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { to: '/add', label: 'Photo', icon: <CameraIcon size={21} /> },
            { to: '/scan', label: 'Barcode', icon: <BarcodeIcon size={21} /> },
            { to: '/add?mode=manual', label: 'By hand', icon: <PencilIcon size={21} /> },
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="card press flex flex-col items-center gap-1.5 py-3.5 text-[0.8rem] font-medium"
            >
              <span className="text-[var(--color-ink)]">{action.icon}</span>
              {action.label}
            </Link>
          ))}
        </nav>
      )}

      {/* The ledger. */}
      <section className="mt-6">
        {entriesQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[72px] rounded-[var(--radius-card)]" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<LedgerIcon size={25} />}
              title={isToday ? 'Nothing logged yet' : 'Nothing was logged'}
              body={
                isToday
                  ? 'Photograph what you are about to eat, scan a package, or type it in.'
                  : 'Use the strip above to look at any other day.'
              }
              action={isToday ? (
                <Link to="/add">
                  <Button variant="primary" icon={<CameraIcon size={18} />}>Add your first food</Button>
                </Link>
              ) : undefined}
            />
          </div>
        ) : (
          <MealList entries={entries} editable />
        )}
      </section>

      {entries.length > 0 && (
        <div className="mt-6">
          <NutrientPanel micronutrients={totals.micronutrients} />
        </div>
      )}

      <GoalStatus
        weights={weightsQuery.data ?? []}
        weekEntries={weekQuery.data ?? []}
        tdee={target?.tdee_kcal ?? 0}
        goal={profile?.goal ?? 'maintain'}
        unit={unit}
      />

      <p className="px-2 py-7 text-[0.75rem] leading-relaxed text-[var(--color-ink-3)]">
        Totals are the sum of what you saved, not a fresh calculation. Editing an entry
        changes this day immediately and leaves every other day untouched.
      </p>
    </>
  )
}

/**
 * A week of days you can thumb between, with the selected one always in view.
 * The chevrons step a single day, which is what shifts the window.
 */
function DayStrip({
  date, today, onPick,
}: { date: string; today: string; onPick: (iso: string) => void }) {
  const days = useMemo(() => {
    const end = compareIso(addDays(date, 3), today) > 0 ? today : addDays(date, 3)
    return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6))
  }, [date, today])

  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous day" onClick={() => onPick(addDays(date, -1))}>
        <ChevronLeftIcon size={19} strokeWidth={2.2} />
      </IconButton>

      <div className="grid flex-1 grid-cols-7 gap-1">
        {days.map((iso) => {
          const selected = iso === date
          const future = compareIso(iso, today) > 0
          const { day } = parseIsoDate(iso)
          return (
            <button
              key={iso}
              type="button"
              disabled={future}
              onClick={() => onPick(iso)}
              aria-current={selected ? 'date' : undefined}
              aria-label={longDate(iso)}
              className={cn(
                'press flex flex-col items-center gap-0.5 rounded-[12px] py-1.5 transition-colors',
                selected
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                  : 'text-[var(--color-ink-2)] active:bg-[var(--color-fill)]',
                future && 'opacity-30',
              )}
            >
              <span className="text-[0.66rem] font-medium uppercase tracking-[0.04em] opacity-70">
                {weekdayName(iso, true).slice(0, 3)}
              </span>
              <span className={cn('tnum text-[0.95rem]', (selected || iso === today) && 'font-semibold')}>
                {day}
              </span>
            </button>
          )
        })}
      </div>

      <IconButton
        label="Next day" disabled={date === today}
        className="disabled:opacity-30"
        onClick={() => onPick(addDays(date, 1))}
      >
        <ChevronRightIcon size={19} strokeWidth={2.2} />
      </IconButton>
    </div>
  )
}

interface GoalProps {
  weights: TrendPoint[]
  weekEntries: FoodEntry[]
  tdee: number
  goal: Goal
  unit: UnitPreference
}

function GoalStatus({ weights, weekEntries, tdee, goal, unit }: GoalProps) {
  const trend = useMemo(() => calcWeightTrend(weights), [weights])

  const { averageIntake, daysLogged } = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const entry of weekEntries) {
      byDay.set(
        entry.consumed_on,
        (byDay.get(entry.consumed_on) ?? 0) + entryTotal(entry).calories_kcal,
      )
    }
    // Only days you actually logged count — a blank day is missing data, not a fast.
    const values = [...byDay.values()]
    return {
      averageIntake: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      daysLogged: values.length,
    }
  }, [weekEntries])

  if (!trend.latest_kg && daysLogged === 0) return null

  const projection = tdee > 0 && daysLogged >= 3
    ? projectWeightChangeKg(averageIntake, tdee, 7)
    : null

  const unitLabel = unit === 'imperial' ? 'lb' : 'kg'
  const convert = (kg: number) => (unit === 'imperial' ? kg * 2.2046 : kg)

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
        <h2 className="text-[1.15rem]">Where this is heading</h2>
        <Link to="/weight" className="text-[0.88rem] font-medium text-[var(--color-tint)]">
          History
        </Link>
      </div>

      <ListGroup
        note={projection !== null
          ? `A planning figure from energy balance at roughly 7,700 kcal per kg. Water, sleep, training and how completely you log all move the real number. Your goal is to ${goal === 'lose' ? 'lose' : goal === 'gain' ? 'gain' : 'hold'} weight.`
          : 'Log a few more days and record your weight a few more times, and an estimated direction will appear here.'}
      >
        {trend.latest_kg !== null && (
          <ListRow title="Last weighed" value={formatWeight(trend.latest_kg, unit)} />
        )}
        <ListRow
          title="Measured trend"
          value={trend.slope_kg_per_week !== null
            ? `${signed(convert(trend.slope_kg_per_week), 2)} ${unitLabel}/wk`
            : <span className="text-[var(--color-ink-3)]">needs more weigh-ins</span>}
        />
        {daysLogged > 0 && (
          <ListRow
            title="Average intake"
            detail={`Last ${daysLogged} logged ${daysLogged === 1 ? 'day' : 'days'}`}
            value={`${kcal(averageIntake)} kcal`}
          />
        )}
        {projection !== null && (
          <ListRow
            title="Implied by that intake"
            value={`${signed(convert(projection), 2)} ${unitLabel}/wk`}
          />
        )}
      </ListGroup>
    </div>
  )
}
