import { cn } from '@/lib/cn'

interface Props {
  label: string
  value: number | null
  target: number | null
  unit: string
  color: string
  /** Shown instead of the numbers when the data simply isn't there. */
  unknownNote?: string
}

/**
 * A thin measure with its number always written out beside it. The value is
 * never carried by colour alone, which is also what lets the amber macro pass
 * its contrast check.
 */
export function Meter({ label, value, target, unit, color, unknownNote }: Props) {
  const known = value !== null && value !== undefined
  const pct = known && target ? Math.min(100, (value / target) * 100) : 0
  const over = known && target ? value > target : false

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.92rem] font-medium">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
          {label}
        </span>
        <span className="tnum text-[0.92rem] text-[var(--color-ink)]">
          {known ? (
            <>
              {Math.round(value)}
              {target ? (
                <span className="font-normal text-[var(--color-ink-3)]"> / {Math.round(target)} {unit}</span>
              ) : (
                <span className="font-normal text-[var(--color-ink-3)]"> {unit}</span>
              )}
            </>
          ) : (
            <span className="text-[var(--color-ink-3)]">{unknownNote ?? 'no data'}</span>
          )}
        </span>
      </div>
      <div
        className="relative h-[8px] overflow-hidden rounded-full"
        style={{
          background: known
            ? 'var(--color-track)'
            : 'repeating-linear-gradient(90deg, var(--color-track) 0 5px, transparent 5px 10px)',
        }}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out')}
          style={{ width: `${pct}%`, background: color }}
        />
        {over && (
          <div
            className="absolute inset-y-0 right-0 w-[3px] rounded-full"
            style={{ background: 'var(--color-ink)' }}
            title="Over target"
          />
        )}
      </div>
    </div>
  )
}
