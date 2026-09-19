import type { MealType } from '@/types/domain'
import { MEAL_COLORS, MEAL_LABELS, MEAL_ORDER } from '@/lib/meals'
import { cn } from '@/lib/cn'

interface Props {
  value: MealType
  onChange: (meal: MealType) => void
}

/** Chips, because five short peers read faster than a list of five rows. */
export function MealPicker({ value, onChange }: Props) {
  return (
    <fieldset>
      <legend className="group-label px-0 pb-2.5">Which meal?</legend>
      <div className="flex flex-wrap gap-2">
        {MEAL_ORDER.map((meal) => {
          const selected = meal === value
          return (
            <label
              key={meal}
              className={cn(
                'press flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[0.88rem] font-medium transition-colors',
                selected
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                  : 'bg-[var(--color-fill)] text-[var(--color-ink-2)]',
              )}
            >
              <input
                type="radio" name="meal" value={meal} checked={selected}
                onChange={() => onChange(meal)} className="sr-only"
              />
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: selected ? 'currentColor' : MEAL_COLORS[meal] }}
                aria-hidden="true"
              />
              {MEAL_LABELS[meal]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
