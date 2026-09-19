import type { NutritionSnapshot } from '@/types/domain'
import { TextField } from '@/components/Field'
import { caloriesFromMacros } from '@/lib/calc'

interface Props {
  value: NutritionSnapshot
  onChange: (next: NutritionSnapshot) => void
  /** Hidden for additions, where fibre is rarely meaningful. */
  showFibre?: boolean
}

const parse = (raw: string): number => {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * The numbers themselves, always editable. When hand-edited macros disagree
 * with the calorie figure by more than a rounding error, we say so and offer
 * the arithmetic rather than silently overwriting what the user typed.
 */
export function NutritionFields({ value, onChange, showFibre = true }: Props) {
  const set = (patch: Partial<NutritionSnapshot>) => onChange({ ...value, ...patch })

  const implied = caloriesFromMacros(value.protein_g, value.carbs_g, value.fat_g)
  const drift = Math.abs(implied - value.calories_kcal)
  const disagrees = value.calories_kcal > 0 && drift > Math.max(25, value.calories_kcal * 0.12)

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Calories" inputMode="decimal" suffix="kcal"
        value={String(value.calories_kcal)}
        onChange={(e) => set({ calories_kcal: parse(e.target.value) })}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <TextField
          label="Protein" inputMode="decimal" suffix="g"
          value={String(value.protein_g)}
          onChange={(e) => set({ protein_g: parse(e.target.value) })}
        />
        <TextField
          label="Carbs" inputMode="decimal" suffix="g"
          value={String(value.carbs_g)}
          onChange={(e) => set({ carbs_g: parse(e.target.value) })}
        />
        <TextField
          label="Fat" inputMode="decimal" suffix="g"
          value={String(value.fat_g)}
          onChange={(e) => set({ fat_g: parse(e.target.value) })}
        />
      </div>

      {showFibre && (
        <TextField
          label="Fibre" inputMode="decimal" suffix="g"
          value={value.fibre_g === null ? '' : String(value.fibre_g)}
          placeholder="Not reported"
          onChange={(e) => set({ fibre_g: e.target.value === '' ? null : parse(e.target.value) })}
          hint="Leave blank if the label does not list it. Blank means unknown, not zero."
        />
      )}

      {disagrees && (
        <button
          type="button"
          onClick={() => set({ calories_kcal: implied })}
          className="press self-start rounded-[10px] bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] px-3 py-2 text-left text-[0.8rem] font-medium leading-snug text-[var(--color-warn)]"
        >
          Those macros work out to {implied} kcal, not {Math.round(value.calories_kcal)}.
          Use {implied}?
        </button>
      )}
    </div>
  )
}
