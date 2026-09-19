import type { MacroTargets } from '@/lib/calc'
import { KCAL_PER_G } from '@/lib/calc'
import { kcal } from '@/lib/format'

/**
 * A target's macro split is an allocation of one budget, not three separate
 * scores — so it is drawn as one bar divided three ways, with each share
 * written out beside it.
 */
export function MacroAllocation({ macros, calories }: { macros: MacroTargets; calories: number }) {
  const rows = [
    { label: 'Protein', grams: macros.protein_g, energy: macros.protein_g * KCAL_PER_G.protein, color: 'var(--color-protein)' },
    { label: 'Carbs', grams: macros.carbs_g, energy: macros.carbs_g * KCAL_PER_G.carbs, color: 'var(--color-carbs)' },
    { label: 'Fat', grams: macros.fat_g, energy: macros.fat_g * KCAL_PER_G.fat, color: 'var(--color-fat)' },
  ]
  const total = rows.reduce((sum, row) => sum + row.energy, 0) || 1

  return (
    <div>
      <div className="flex h-[12px] overflow-hidden rounded-full">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className="meter-seg h-full"
            style={{
              width: `${(row.energy / total) * 100}%`,
              background: row.color,
              animationDelay: `${index * 70}ms`,
              boxShadow: index > 0 ? '-1.5px 0 0 0 var(--color-paper)' : undefined,
            }}
          />
        ))}
      </div>

      <dl className="mt-3.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-[0.92rem]">
            <dt className="flex items-center gap-2 font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} aria-hidden="true" />
              {row.label}
            </dt>
            <dd className="tnum">
              {Math.round(row.grams)} g
              <span className="ml-2 text-[var(--color-ink-3)]">
                {Math.round((row.energy / total) * 100)}%
              </span>
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-2 text-[0.92rem] hairline-t">
          <dt className="flex items-center gap-2 pt-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-fibre)]" aria-hidden="true" />
            Fibre
          </dt>
          <dd className="tnum pt-2">
            {Math.round(macros.fibre_g)} g
            <span className="ml-2 text-[var(--color-ink-3)]">of {kcal(calories)} kcal</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
