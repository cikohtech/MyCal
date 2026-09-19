import { useState } from 'react'
import type { DraftFood } from '@/types/domain'
import { TextField } from '@/components/Field'
import { IconButton } from '@/components/Button'
import { NutritionFields } from '@/features/food-log/NutritionFields'
import { PartsEditor } from '@/features/food-log/PartsEditor'
import { draftTotal } from '@/features/food-log/draft'
import { EstimateTag } from '@/components/Callout'
import { ChevronDownIcon, TrashIcon } from '@/components/Icons'
import { scaleSnapshot } from '@/lib/calc'
import { kcal } from '@/lib/format'

interface Props {
  food: DraftFood
  onChange: (food: DraftFood) => void
  onRemove: () => void
  defaultOpen?: boolean
}

/** One suggested food, fully editable before anything is saved. */
export function DraftFoodCard({ food, onChange, onRemove, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [baseNutrition] = useState(food.nutrition)
  const [baseQuantity] = useState(food.quantity || 1)

  const total = draftTotal(food)

  const setQuantity = (raw: string) => {
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      onChange({ ...food, quantity: Number(raw) || 0 })
      return
    }
    onChange({
      ...food,
      quantity,
      nutrition: scaleSnapshot(baseNutrition, quantity / baseQuantity),
    })
  }

  const lowConfidence = food.confidence !== null && food.confidence < 0.55

  return (
    <article className="card overflow-hidden">
      <div className="flex items-start gap-1.5 p-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[1.05rem] font-semibold">
              {food.name || 'Unnamed food'}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.78rem] text-[var(--color-ink-3)]">
              <span className="tnum">{food.quantity} {food.quantity_unit}</span>
              <EstimateTag provenance={food.provenance} />
              {food.confidence !== null && (
                <span className="tnum">{Math.round(food.confidence * 100)}% sure</span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="tnum text-[1.05rem] font-semibold">{kcal(total.calories_kcal)}</span>
            <ChevronDownIcon
              size={18} strokeWidth={2.2}
              className="text-[var(--color-ink-3)] transition-transform duration-200"
              style={{ transform: open ? 'rotate(180deg)' : undefined }}
            />
          </span>
        </button>
        <IconButton
          label={`Remove ${food.name || 'this food'}`}
          className="-mr-1 h-[32px] w-[32px] hover:text-[var(--color-critical)]"
          onClick={onRemove}
        >
          <TrashIcon size={17} />
        </IconButton>
      </div>

      {lowConfidence && !open && (
        <p className="bg-[color-mix(in_oklab,var(--color-warn)_12%,var(--color-paper))] px-4 py-2.5 text-[0.8rem] text-[var(--color-warn)]">
          Low confidence on this one — worth opening before you save.
        </p>
      )}

      {open && (
        <div className="hairline-t flex flex-col gap-4 p-4">
          <TextField
            label="What is it?" value={food.name}
            onChange={(e) => onChange({ ...food, name: e.target.value })}
            placeholder="Chicken thigh, grilled"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <TextField
              label="Amount" inputMode="decimal" value={String(food.quantity)}
              onChange={(e) => setQuantity(e.target.value)}
              hint="Scales the nutrition below."
            />
            <TextField
              label="Measured in" value={food.quantity_unit}
              onChange={(e) => onChange({ ...food, quantity_unit: e.target.value })}
              placeholder="g, plate, cup"
            />
          </div>

          <NutritionFields
            value={food.nutrition}
            onChange={(nutrition) => onChange({ ...food, nutrition })}
          />

          <div>
            <h4 className="group-label px-0 pb-2">Ingredients and additions</h4>
            <PartsEditor
              parts={food.ingredients}
              onChange={(ingredients) => onChange({ ...food, ingredients })}
            />
          </div>
        </div>
      )}
    </article>
  )
}
