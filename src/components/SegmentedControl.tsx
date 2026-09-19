import { cn } from '@/lib/cn'

interface Props<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

/**
 * The iOS segmented control: a recessed track with one raised pill that slides
 * between positions. Two to four peers, all visible at once — which is what
 * makes it the right control for units, themes and ranges, and the wrong one
 * for anything longer.
 */
export function SegmentedControl<T extends string>({
  value, options, onChange, label, className, size = 'md',
}: Props<T>) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'relative isolate grid gap-0 rounded-[10px] bg-[var(--color-fill)] p-[2px]',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* The raised pill lives behind the labels and slides; it is the only
          thing that animates, so the type never blurs mid-transition. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-[2px] -z-10 rounded-[8px] bg-[var(--color-paper)] shadow-[0_1px_3px_rgb(16_18_24/0.14)] transition-transform duration-[260ms]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative rounded-[8px] text-center font-medium transition-colors',
              size === 'md' ? 'py-[7px] text-[0.92rem]' : 'py-[5px] text-[0.84rem]',
              selected ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-2)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
