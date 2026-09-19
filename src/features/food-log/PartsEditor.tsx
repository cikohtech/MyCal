import { useState } from 'react'
import type { DraftPart, NutritionSnapshot } from '@/types/domain'
import { Button, IconButton } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { TextField } from '@/components/Field'
import { NutritionFields } from '@/features/food-log/NutritionFields'
import { PlusIcon, TrashIcon } from '@/components/Icons'
import { EXTRA_GROUP_LABELS, EXTRA_PRESETS, type ExtraPreset } from '@/lib/extras'
import { scaleSnapshot } from '@/lib/calc'
import { tempId } from '@/lib/id'
import { kcal } from '@/lib/format'

interface Props {
  parts: DraftPart[]
  onChange: (parts: DraftPart[]) => void
}

const BLANK: NutritionSnapshot = {
  calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: null, micronutrients: {},
}

/**
 * The things a photo cannot see: the oil it was fried in, the sauce, the drink
 * beside it. Presets cover the common ones; anything else is a named line with
 * its own calories.
 */
export function PartsEditor({ parts, onChange }: Props) {
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<DraftPart | null>(null)

  const addPreset = (preset: ExtraPreset) => {
    onChange([...parts, {
      temp_id: tempId('part'),
      kind: 'extra',
      name: preset.name,
      quantity: preset.quantity,
      quantity_unit: preset.unit,
      nutrition: preset.nutrition,
    }])
    setPicking(false)
  }

  const startBlank = (kind: DraftPart['kind']) => {
    setPicking(false)
    setEditing({
      temp_id: tempId('part'), kind, name: '', quantity: 1, quantity_unit: 'serving',
      nutrition: { ...BLANK },
    })
  }

  const commit = (part: DraftPart) => {
    const exists = parts.some((p) => p.temp_id === part.temp_id)
    onChange(exists ? parts.map((p) => (p.temp_id === part.temp_id ? part : p)) : [...parts, part])
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {parts.length > 0 && (
        <ul className="overflow-hidden rounded-[12px] bg-[var(--color-fill)]">
          {parts.map((part, index) => (
            <li
              key={part.temp_id}
              className="flex items-center gap-2 px-3 py-2.5"
              style={index > 0 ? { boxShadow: 'inset 0 0.5px 0 0 var(--hairline)' } : undefined}
            >
              <button
                type="button"
                onClick={() => setEditing(part)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[0.94rem]">{part.name || 'Unnamed'}</span>
                <span className="tnum text-[0.75rem] text-[var(--color-ink-3)]">
                  {part.quantity ?? ''} {part.quantity_unit ?? ''} ·{' '}
                  {part.kind === 'ingredient' ? 'ingredient' : 'addition'}
                </span>
              </button>
              <span className="tnum shrink-0 text-[0.92rem] font-medium">
                {kcal(part.nutrition.calories_kcal)}
              </span>
              <IconButton
                label={`Remove ${part.name || 'item'}`}
                className="-mr-1 h-[30px] w-[30px] hover:text-[var(--color-critical)]"
                onClick={() => onChange(parts.filter((p) => p.temp_id !== part.temp_id))}
              >
                <TrashIcon size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Button size="sm" icon={<PlusIcon size={16} />} onClick={() => setPicking(true)} className="self-start">
        Add what is missing
      </Button>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="What else was in it?"
        description="Cooking fat, sauce and drinks are where logged meals usually come up short."
      >
        <div className="flex flex-col gap-5">
          {(['cooking', 'condiment', 'side', 'drink'] as const).map((group) => (
            <section key={group}>
              <h3 className="group-label px-0 pb-2">{EXTRA_GROUP_LABELS[group]}</h3>
              <div className="flex flex-wrap gap-2">
                {EXTRA_PRESETS.filter((p) => p.group === group).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-autofocus={group === 'cooking' && preset.id === 'olive-oil' ? true : undefined}
                    onClick={() => addPreset(preset)}
                    className="press rounded-full bg-[var(--color-fill)] px-3.5 py-2 text-[0.88rem] font-medium transition-colors active:bg-[var(--color-fill-2)]"
                  >
                    {preset.name}
                    <span className="tnum ml-1.5 text-[0.75rem] text-[var(--color-ink-3)]">
                      {kcal(preset.nutrition.calories_kcal)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <div className="hairline-t flex gap-2.5 pt-4">
            <Button full onClick={() => startBlank('extra')}>Something else</Button>
            <Button full onClick={() => startBlank('ingredient')}>An ingredient</Button>
          </div>
        </div>
      </Sheet>

      {editing && (
        <PartSheet
          part={editing}
          onCancel={() => setEditing(null)}
          onSave={commit}
        />
      )}
    </div>
  )
}

function PartSheet({
  part, onCancel, onSave,
}: { part: DraftPart; onCancel: () => void; onSave: (part: DraftPart) => void }) {
  const [draft, setDraft] = useState(part)
  const baseQuantity = part.quantity || 1

  /** Changing the amount scales the nutrition with it. */
  const setQuantity = (raw: string) => {
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDraft({ ...draft, quantity: Number(raw) || 0 })
      return
    }
    setDraft({
      ...draft,
      quantity,
      nutrition: scaleSnapshot(part.nutrition, quantity / baseQuantity),
    })
  }

  return (
    <Sheet
      open
      onClose={onCancel}
      title={part.name || (part.kind === 'ingredient' ? 'New ingredient' : 'New addition')}
      footer={
        <div className="flex gap-2.5">
          <Button full size="lg" onClick={onCancel}>Cancel</Button>
          <Button
            full size="lg" variant="primary"
            disabled={!draft.name.trim()}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Name" value={draft.name} data-autofocus
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={part.kind === 'ingredient' ? 'Basmati rice' : 'Olive oil'}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <TextField
            label="Amount" inputMode="decimal"
            value={draft.quantity === null ? '' : String(draft.quantity)}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField
            label="Measured in" value={draft.quantity_unit ?? ''}
            onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })}
            placeholder="g, tbsp, slice"
          />
        </div>
        <NutritionFields
          value={draft.nutrition}
          onChange={(nutrition) => setDraft({ ...draft, nutrition })}
          showFibre={false}
        />
      </div>
    </Sheet>
  )
}
