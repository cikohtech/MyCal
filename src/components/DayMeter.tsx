/**
 * The day as one bar. Each meal is a real proportional segment; the target is
 * a tick you can cross. Past the tick the fill keeps going into a hatched band
 * — over your target is information, not a failure state.
 *
 * The dashboard uses the ring; this is the compact form, for previews and any
 * place a full ring would not fit.
 */
import { useMemo } from 'react'
import type { MealType } from '@/types/domain'
import { MEAL_COLORS, MEAL_LABELS } from '@/lib/meals'
import { kcal } from '@/lib/format'

export interface MeterSegment {
  meal_type: MealType
  calories_kcal: number
}

interface Props {
  segments: MeterSegment[]
  consumed: number
  target: number
  animate?: boolean
  showLegend?: boolean
}

const HEADROOM = 1.06

export function DayMeter({ segments, consumed, target, animate = true, showLegend = true }: Props) {
  const { targetPercent, filled } = useMemo(() => {
    const domain = Math.max(target, consumed, 1) * HEADROOM
    return {
      targetPercent: target > 0 ? (target / domain) * 100 : 100,
      filled: segments
        .filter((s) => s.calories_kcal > 0)
        .map((s) => ({ ...s, percent: (s.calories_kcal / domain) * 100 })),
    }
  }, [segments, consumed, target])

  const over = consumed > target && target > 0

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-[14px] w-full overflow-hidden rounded-full bg-[var(--color-track)]"
        role="img"
        aria-label={
          target > 0
            ? `${kcal(consumed)} of ${kcal(target)} kilocalories logged`
            : `${kcal(consumed)} kilocalories logged`
        }
      >
        {target > 0 && (
          <div
            className="absolute inset-y-0 right-0"
            style={{
              left: `${targetPercent}%`,
              backgroundImage:
                'repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-ink-3) 20%, transparent) 0 2px, transparent 2px 7px)',
            }}
          />
        )}

        <div className="absolute inset-0 flex">
          {filled.map((segment, index) => (
            <div
              key={segment.meal_type}
              className={`h-full ${animate ? 'meter-seg' : ''}`}
              style={{
                width: `${segment.percent}%`,
                background: MEAL_COLORS[segment.meal_type],
                animationDelay: animate ? `${index * 70}ms` : undefined,
                boxShadow: index > 0 ? '-1.5px 0 0 0 var(--color-track)' : undefined,
                borderRadius: index === 0 ? '999px 0 0 999px' : undefined,
              }}
            />
          ))}
        </div>

        {target > 0 && targetPercent < 99 && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-[var(--color-ink)]/70"
            style={{ left: `calc(${targetPercent}% - 1px)` }}
          />
        )}
      </div>

      {showLegend && (
        <div className="flex min-h-[18px] items-center justify-between text-[0.78rem] text-[var(--color-ink-3)]">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {filled.length
              ? filled.map((segment) => (
                  <span key={segment.meal_type} className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: MEAL_COLORS[segment.meal_type] }}
                      aria-hidden="true"
                    />
                    {MEAL_LABELS[segment.meal_type]}
                  </span>
                ))
              : 'Nothing logged yet'}
          </span>
          {target > 0 && (
            <span className="tnum shrink-0">
              {over ? `${kcal(consumed - target)} over` : `of ${kcal(target)}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
