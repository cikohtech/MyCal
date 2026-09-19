import { Link } from 'react-router-dom'
import type { FoodEntry, MealType } from '@/types/domain'
import { MEAL_COLORS, MEAL_LABELS, MEAL_ORDER } from '@/lib/meals'
import { entryTotal } from '@/lib/calc'
import { kcal } from '@/lib/format'
import { EstimateTag } from '@/components/Callout'
import { ChevronRightIcon } from '@/components/Icons'

interface Props {
  entries: FoodEntry[]
  editable: boolean
}

/**
 * The ledger. Meals in the order you eat them, each an inset group with its own
 * total in the section header, every line tabular so the numbers line up as you
 * scan down.
 */
export function MealList({ entries, editable }: Props) {
  const groups = MEAL_ORDER.map((meal) => ({
    meal_type: meal,
    entries: entries.filter((e) => e.meal_type === meal),
  })).filter((group) => group.entries.length > 0)

  if (!groups.length) return null

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.meal_type}>
          <header className="flex items-baseline justify-between gap-3 px-1 pb-1.5">
            <h3 className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: MEAL_COLORS[group.meal_type] }}
                aria-hidden="true"
              />
              {MEAL_LABELS[group.meal_type]}
            </h3>
            <span className="tnum text-[0.82rem] font-medium text-[var(--color-ink-3)]">
              {kcal(group.entries.reduce((sum, e) => sum + entryTotal(e).calories_kcal, 0))} kcal
            </span>
          </header>

          <ul className="list-group">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} editable={editable} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function EntryRow({ entry, editable }: { entry: FoodEntry; editable: boolean }) {
  const total = entryTotal(entry)
  const parts = entry.parts ?? []
  // Provenance is only worth a line when the app proposed the numbers. Food
  // the user typed themselves is already theirs; labelling it "you edited
  // this" would be noise on every row.
  const proposed = entry.source !== 'manual'
  const provenance = entry.user_corrected
    ? 'corrected'
    : entry.source === 'barcode' ? 'label' : 'estimate'

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem]">{entry.display_name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.78rem] text-[var(--color-ink-3)]">
          <span className="tnum">{entry.quantity} {entry.quantity_unit}</span>
          {proposed && <EstimateTag provenance={provenance} />}
          {parts.length > 0 && (
            <span>{parts.length === 1 ? '1 addition' : `${parts.length} additions`}</span>
          )}
        </span>
      </span>
      <span className="tnum shrink-0 text-right text-[1rem] font-medium">
        {kcal(total.calories_kcal)}
        <span className="ml-1 text-[0.72rem] font-normal text-[var(--color-ink-3)]">kcal</span>
      </span>
      {editable && (
        <ChevronRightIcon size={17} strokeWidth={2.2} className="shrink-0 text-[var(--color-ink-3)]" />
      )}
    </>
  )

  return (
    <li>
      {editable ? (
        <Link to={`/entry/${entry.id}`} className="list-row press-sm items-start active:bg-[var(--color-fill)]">
          {body}
        </Link>
      ) : (
        <div className="list-row items-start">{body}</div>
      )}
    </li>
  )
}

export function mealSegments(entries: FoodEntry[]): { meal_type: MealType; calories_kcal: number }[] {
  return MEAL_ORDER.map((meal) => ({
    meal_type: meal,
    calories_kcal: entries
      .filter((e) => e.meal_type === meal)
      .reduce((sum, e) => sum + entryTotal(e).calories_kcal, 0),
  })).filter((s) => s.calories_kcal > 0)
}
