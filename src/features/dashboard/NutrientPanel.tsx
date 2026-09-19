import { useState } from 'react'
import type { Micronutrients } from '@/types/domain'
import { missingNutrientCount, presentNutrients } from '@/lib/nutrients'
import { ChevronDownIcon } from '@/components/Icons'
import { amount } from '@/lib/format'

/**
 * Only nutrients the logged food actually carries data for. A nutrient that no
 * source reported is listed as missing rather than drawn as an empty bar —
 * an empty bar reads as "you ate none of it", which is a different claim.
 */
export function NutrientPanel({ micronutrients }: { micronutrients: Micronutrients }) {
  const [open, setOpen] = useState(false)
  const present = presentNutrients(micronutrients)
  const missing = missingNutrientCount(micronutrients)

  if (!present.length) {
    return (
      <div className="card px-5 py-4">
        <h2 className="text-[1.05rem]">Vitamins and minerals</h2>
        <p className="mt-1 text-[0.87rem] leading-relaxed text-[var(--color-ink-2)]">
          None of today’s foods came with micronutrient data. Scanned packages and database
          matches usually carry some; photo estimates rarely do.
        </p>
      </div>
    )
  }

  return (
    <div className="list-group">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="list-row press-sm active:bg-[var(--color-fill)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium">Vitamins and minerals</span>
          <span className="mt-0.5 block text-[0.8rem] text-[var(--color-ink-3)]">
            {present.length} with data{missing > 0 && `, ${missing} not reported`}
          </span>
        </span>
        <ChevronDownIcon
          size={19} strokeWidth={2.2}
          className="shrink-0 text-[var(--color-ink-3)] transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3.5">
          <ul className="flex flex-col gap-3.5">
            {present.map((nutrient) => (
              <li key={nutrient.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.88rem]">{nutrient.label}</span>
                  <span className="tnum text-[0.88rem]">
                    {amount(nutrient.amount, nutrient.amount < 10 ? 1 : 0)} {nutrient.unit}
                    {nutrient.percentOfReference !== null && (
                      <span className="ml-1.5 text-[var(--color-ink-3)]">
                        {nutrient.percentOfReference}% RDV
                      </span>
                    )}
                  </span>
                </div>
                {nutrient.percentOfReference !== null && (
                  <div className="h-[6px] overflow-hidden rounded-full bg-[var(--color-track)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-fibre)]"
                      style={{ width: `${Math.min(100, nutrient.percentOfReference)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.76rem] leading-relaxed text-[var(--color-ink-3)]">
            Reference daily values are a general adult guide. A blank here means no source
            reported that nutrient, not that the food contains none.
          </p>
        </div>
      )}
    </div>
  )
}
