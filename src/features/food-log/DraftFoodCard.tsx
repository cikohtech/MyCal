import { useRef, useState } from 'react'
import type { DraftFood, MealType } from '@/types/domain'
import { TextField } from '@/components/Field'
import { IconButton } from '@/components/Button'
import { NutritionFields } from '@/features/food-log/NutritionFields'
import { PartsEditor } from '@/features/food-log/PartsEditor'
import { MealPicker } from '@/features/food-log/MealPicker'
import { draftTotal } from '@/features/food-log/draft'
import { EstimateTag } from '@/components/Callout'
import { ChevronDownIcon, TrashIcon } from '@/components/Icons'
import { scaleSnapshot } from '@/lib/calc'
import { kcal } from '@/lib/format'
import { MEAL_COLORS, MEAL_LABELS } from '@/lib/meals'

interface Props {
  food: DraftFood
  onChange: (food: DraftFood) => void
  onRemove: () => void
  defaultOpen?: boolean
  /**
   * A voice log can name a different meal for each food. Given these, the card
   * lets this one food be moved; `showMeal` also puts its meal on the summary
   * line, for when the foods on screen do not all share one.
   */
  meal?: MealType
  onMealChange?: (meal: MealType) => void
  showMeal?: boolean
}

/** One suggested food, fully editable before anything is saved. */
export function DraftFoodCard({
  food, onChange, onRemove, defaultOpen = false, meal, onMealChange, showMeal = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [baseNutrition] = useState(food.nutrition)
  const [baseQuantity] = useState(food.quantity || 1)
  /**
   * The amount the parts were last scaled to. They follow it from there rather
   * than from a starting copy, so an ingredient edited by hand keeps its edit.
   */
  const partsQuantity = useRef(food.quantity || 1)

  const total = draftTotal(food)

  const setQuantity = (raw: string) => {
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      onChange({ ...food, quantity: Number(raw) || 0 })
      return
    }
    const factor = quantity / partsQuantity.current
    partsQuantity.current = quantity
    onChange({
      ...food,
      quantity,
      nutrition: scaleSnapshot(baseNutrition, quantity / baseQuantity),
      // A dish's own components grow with it — two plates is twice the rice.
      // An extra added on the side, like a drink, does not.
      ingredients: food.ingredients.map((part) => (part.kind === 'ingredient'
        ? {
          ...part,
          quantity: part.quantity === null ? null : Math.round(part.quantity * factor * 100) / 100,
          nutrition: scaleSnapshot(part.nutrition, factor),
        }
        : part)),
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
              {showMeal && meal && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full" aria-hidden="true"
                    style={{ background: MEAL_COLORS[meal] }}
                  />
                  {MEAL_LABELS[meal]}
                </span>
              )}
            </span>
            {/* The words this came from: why it is on the list at all. */}
            {food.said && (
              <span className="mt-1 block truncate text-[0.78rem] italic text-[var(--color-ink-3)]">
                “{food.said}”
              </span>
            )}
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

          {meal && onMealChange && (
            <MealPicker
              name={`meal-${food.temp_id}`} legend="Which meal was this?"
              value={meal} onChange={onMealChange}
            />
          )}

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
