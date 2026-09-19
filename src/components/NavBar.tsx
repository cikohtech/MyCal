import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '@/components/Icons'
import { cn } from '@/lib/cn'

interface Props {
  title?: string
  /** The word after the chevron, as iOS labels a back button with its origin. */
  back?: string | false
  onBack?: () => void
  trailing?: ReactNode
  /** Transparent until the page scrolls under it. */
  transparent?: boolean
}

/**
 * A pinned navigation bar. It stays put while the page moves under it and
 * frosts whatever passes behind, so the title and the way back are never
 * scrolled off the screen.
 */
export function NavBar({ title, back = 'Back', onBack, trailing, transparent }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'sticky top-0 z-30 -mx-4 px-2 pt-safe-0',
        transparent ? 'bg-transparent' : 'glass-canvas hairline-b',
      )}
    >
      <div className="flex h-[46px] items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center">
          {back !== false && (
            <button
              type="button"
              onClick={() => (onBack ? onBack() : navigate(-1))}
              className="press -ml-1 flex items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-2 text-[1rem] text-[var(--color-tint)]"
            >
              <ChevronLeftIcon size={20} strokeWidth={2.4} />
              <span className="truncate">{back}</span>
            </button>
          )}
        </div>
        {title && (
          <h2 className="pointer-events-none absolute inset-x-0 mx-auto max-w-[60%] truncate text-center text-[1.02rem] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">{trailing}</div>
      </div>
    </div>
  )
}

/**
 * The oversized title a native app parks at the top of a root screen, with its
 * action sitting on the same baseline.
 */
export function LargeTitle({
  title, subtitle, trailing, className,
}: { title: string; subtitle?: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex items-end justify-between gap-3 pb-4 pt-2', className)}>
      <div className="min-w-0">
        {subtitle && (
          <p className="text-[0.84rem] font-medium text-[var(--color-ink-3)]">{subtitle}</p>
        )}
        <h1 className="mt-0.5 truncate text-[2rem] leading-[1.1]">{title}</h1>
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2 pb-1">{trailing}</div>}
    </header>
  )
}
