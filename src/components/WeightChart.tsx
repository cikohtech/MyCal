/**
 * Weight over time: the raw measurements you actually stepped on the scale for,
 * and a rolling mean through them. One y-axis, both series direct-labelled, and
 * a crosshair readout on hover or touch.
 */
import { useMemo, useRef, useState } from 'react'
import type { UnitPreference } from '@/types/domain'
import type { TrendPoint } from '@/lib/calc'
import { friendlyDate } from '@/lib/dates'
import { weight as formatWeight } from '@/lib/format'

interface Props {
  raw: TrendPoint[]
  smoothed: TrendPoint[]
  unit: UnitPreference
  today: string
}

const PAD = { top: 14, right: 12, bottom: 24, left: 42 }

const WIDTH = 640
const HEIGHT = 250

export function WeightChart({ raw, smoothed, unit, today }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const model = useMemo(() => {
    if (raw.length < 2) return null
    const xs = raw.map((p) => Date.parse(p.recorded_on))
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const values = [...raw, ...smoothed].map((p) => p.weight_kg)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const pad = Math.max(0.6, (rawMax - rawMin) * 0.18)
    const minY = rawMin - pad
    const maxY = rawMax + pad

    const x = (iso: string) =>
      PAD.left + ((Date.parse(iso) - minX) / Math.max(1, maxX - minX)) * (WIDTH - PAD.left - PAD.right)
    const y = (kg: number) =>
      PAD.top + (1 - (kg - minY) / Math.max(0.001, maxY - minY)) * (HEIGHT - PAD.top - PAD.bottom)

    const line = (points: TrendPoint[]) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.recorded_on).toFixed(1)},${y(p.weight_kg).toFixed(1)}`).join(' ')

    const ticks = [minY, (minY + maxY) / 2, maxY]

    return { x, y, line, minY, maxY, ticks }
  }, [raw, smoothed])

  if (!model) return null

  const point = hover !== null ? raw[hover] : null
  const smoothedAt = hover !== null ? smoothed[hover] : null

  const handleMove = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = ((clientX - rect.left) / rect.width) * WIDTH
    let best = 0
    let bestDistance = Infinity
    raw.forEach((p, i) => {
      const distance = Math.abs(model.x(p.recorded_on) - ratio)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    })
    setHover(best)
  }

  return (
    <figure className="m-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full touch-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Weight from ${friendlyDate(raw[0].recorded_on, today)} to ${friendlyDate(raw.at(-1)!.recorded_on, today)}`}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => handleMove(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        {model.ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left} x2={WIDTH - PAD.right} y1={model.y(value)} y2={model.y(value)}
              stroke="var(--color-line)" strokeWidth={1}
            />
            <text
              x={PAD.left - 8} y={model.y(value) + 4} textAnchor="end"
              className="tnum" fill="var(--color-ink-3)" fontSize={11}
            >
              {unit === 'imperial' ? Math.round(value * 2.2046) : value.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={model.line(smoothed)} fill="none" stroke="var(--color-tint)" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" />

        {raw.map((p, i) => (
          <circle
            key={p.recorded_on}
            cx={model.x(p.recorded_on)} cy={model.y(p.weight_kg)} r={hover === i ? 5.5 : 3.6}
            fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={2.5}
          />
        ))}

        {point && (
          <line
            x1={model.x(point.recorded_on)} x2={model.x(point.recorded_on)}
            y1={PAD.top} y2={HEIGHT - PAD.bottom}
            stroke="var(--color-ink-3)" strokeWidth={1} strokeDasharray="3 3"
          />
        )}

        <text x={PAD.left} y={HEIGHT - 6} fill="var(--color-ink-3)" fontSize={11}>
          {friendlyDate(raw[0].recorded_on, today)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fill="var(--color-ink-3)" fontSize={11}>
          {friendlyDate(raw.at(-1)!.recorded_on, today)}
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.78rem] text-[var(--color-ink-3)]">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-[var(--color-tint)]" aria-hidden="true" />
            Rolling average
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--color-ink)]" aria-hidden="true" />
            Measured
          </span>
        </span>
        <span className="tnum min-h-[1em]" aria-live="polite">
          {point && (
            <>
              {friendlyDate(point.recorded_on, today)} · {formatWeight(point.weight_kg, unit)}
              {smoothedAt && ` · avg ${formatWeight(smoothedAt.weight_kg, unit)}`}
            </>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
