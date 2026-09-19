import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  full?: boolean
  loading?: boolean
}

/**
 * Filled, tinted and plain — the three weights a native control system needs.
 * Everything meets the 44px touch target at `md` and above.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-card)] hover:opacity-90',
  secondary:
    'bg-[var(--color-fill)] text-[var(--color-ink)] hover:bg-[var(--color-fill-2)]',
  tinted:
    'bg-[var(--color-tint-wash)] text-[var(--color-tint-ink)] hover:brightness-[0.97]',
  ghost:
    'bg-transparent text-[var(--color-tint)] hover:bg-[var(--color-fill)]',
  danger:
    'bg-transparent text-[var(--color-critical)] hover:bg-[color-mix(in_oklab,var(--color-critical)_10%,transparent)]',
}

const SIZES: Record<Size, string> = {
  sm: 'text-[0.9rem] min-h-[34px] px-3.5 py-1.5 gap-1.5 rounded-[10px] font-medium',
  md: 'text-[1rem] min-h-[44px] px-4 py-2.5 gap-2 rounded-[13px] font-medium',
  lg: 'text-[1.05rem] min-h-[52px] px-5 py-3.5 gap-2.5 rounded-[15px] font-semibold',
}

export function Button({
  variant = 'secondary', size = 'md', icon, full, loading, className, children, disabled, ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'press inline-flex items-center justify-center leading-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant], SIZES[size], full && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

/** A round icon button — the shape iOS uses for nav-bar and overlay actions. */
export function IconButton({
  label, tone = 'plain', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'plain' | 'filled' | 'overlay' }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'press grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full',
        tone === 'filled' && 'bg-[var(--color-fill)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]',
        tone === 'overlay' && 'bg-black/35 text-white backdrop-blur-md hover:bg-black/50',
        tone === 'plain' && 'text-[var(--color-ink-2)] hover:bg-[var(--color-fill)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)} width={18} height={18} viewBox="0 0 24 24"
      fill="none" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
