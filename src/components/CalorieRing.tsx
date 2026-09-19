import { useEffect, useMemo, useState } from 'react'
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
  size?: number
}

const STROKE = 17

/**
 * The day as one ring. Each meal is a real proportional arc of the target, in
 * the order it was eaten; going past the target starts a second lap in amber
 * rather than jamming the ring at full, because "over" is information and
 * hiding it would be a lie the rest of the app does not tell.
 */
export function CalorieRing({ segments, consumed, target, animate = true, size = 212 }: Props) {
  const [drawn, setDrawn] = useState(!animate)

  useEffect(() => {
    if (!animate) return setDrawn(true)
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [animate])

  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius

  const { arcs, overage } = useMemo(() => {
    const domain = target > 0 ? target : Math.max(consumed, 1)
    let cursor = 0
    const drawnArcs: { key: string; color: string; length: number; offset: number }[] = []

    for (const segment of segments) {
      if (segment.calories_kcal <= 0) continue
      const remaining = Math.max(0, 1 - cursor)
      if (remaining <= 0) break
      const share = Math.min(segment.calories_kcal / domain, remaining)
      drawnArcs.push({
        key: segment.meal_type,
        color: MEAL_COLORS[segment.meal_type],
        length: share * circumference,
        offset: cursor * circumference,
      })
      cursor += share
    }

    const excess = target > 0 && consumed > target ? (consumed - target) / target : 0
    return { arcs: drawnArcs, overage: Math.min(excess, 1) * circumference }
  }, [segments, consumed, target, circumference])

  const remaining = target - consumed
  const over = target > 0 && remaining < 0
  const reached = target > 0 && consumed >= target

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={
          target > 0
            ? `${kcal(consumed)} of ${kcal(target)} kilocalories logged, ${kcal(Math.abs(remaining))} ${over ? 'over' : 'remaining'}`
            : `${kcal(consumed)} kilocalories logged`
        }
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="var(--color-track)" strokeWidth={STROKE}
          />
          {arcs.map((arc, index) => (
            <circle
              key={arc.key}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeLinecap={arcs.length === 1 ? 'round' : 'butt'}
              strokeDasharray={`${drawn ? arc.length : 0} ${circumference * 2}`}
              strokeDashoffset={-arc.offset}
              style={{
                transition: 'stroke-dasharray 720ms cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: `${index * 80}ms`,
              }}
            />
          ))}
          {overage > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth={STROKE - 6}
              strokeLinecap="round"
              strokeDasharray={`${drawn ? overage : 0} ${circumference * 2}`}
              style={{
                transition: 'stroke-dasharray 720ms cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: '280ms',
              }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[0.78rem] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
            {target > 0 ? (over ? 'Over' : 'Remaining') : 'Logged'}
          </p>
          <p className="tnum mt-0.5 text-[2.9rem] font-bold leading-none tracking-[-0.035em]">
            {kcal(target > 0 ? Math.abs(remaining) : consumed)}
          </p>
          <p className="mt-1.5 text-[0.82rem] text-[var(--color-ink-2)]">
            {target > 0 ? `${kcal(consumed)} / ${kcal(target)} kcal` : 'kcal today'}
          </p>
        </div>
      </div>

      {segments.length > 0 && (
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {segments.filter((s) => s.calories_kcal > 0).map((segment) => (
            <li
              key={segment.meal_type}
              className="flex items-center gap-1.5 text-[0.8rem] text-[var(--color-ink-2)]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: MEAL_COLORS[segment.meal_type] }}
                aria-hidden="true"
              />
              {MEAL_LABELS[segment.meal_type]}
              <span className="tnum text-[var(--color-ink-3)]">{kcal(segment.calories_kcal)}</span>
            </li>
          ))}
        </ul>
      )}

      {reached && (
        <p className="mt-3 text-[0.82rem] text-[var(--color-ink-2)]">
          {over
            ? 'One day above target is ordinary — the weekly trend is what moves weight.'
            : 'You have met your target for today.'}
        </p>
      )}
    </div>
  )
}
