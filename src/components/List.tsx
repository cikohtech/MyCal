import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '@/components/Icons'
import { cn } from '@/lib/cn'

/**
 * The inset grouped list. One white block on the canvas, rows divided by a
 * hairline, an optional uppercase label above and a footnote below — the
 * pattern a phone user has read ten thousand times, so nothing here has to be
 * explained.
 */
export function ListGroup({
  label, note, className, children,
}: { label?: string; note?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={className}>
      {label && <p className="group-label">{label}</p>}
      <div className="list-group">{children}</div>
      {note && <p className="group-note">{note}</p>}
    </section>
  )
}

interface RowProps {
  icon?: ReactNode
  /** A rounded tinted tile behind the icon, the way Settings badges a row. */
  iconTone?: string
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  destructive?: boolean
  className?: string
}

export function ListRow({
  icon, iconTone, title, detail, value, trailing, to, onClick, destructive, className,
}: RowProps) {
  const pressable = Boolean(to || onClick)

  const body = (
    <>
      {icon && (
        <span
          className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-[8px] text-white"
          style={{ background: iconTone ?? 'var(--color-ink-3)' }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn(
          'block truncate text-[1rem]',
          destructive && 'text-[var(--color-critical)]',
        )}>
          {title}
        </span>
        {detail && (
          <span className="mt-0.5 block text-[0.8rem] leading-snug text-[var(--color-ink-3)]">
            {detail}
          </span>
        )}
      </span>
      {value !== undefined && (
        <span className="tnum shrink-0 text-[1rem] text-[var(--color-ink-2)]">{value}</span>
      )}
      {trailing}
      {pressable && !trailing && (
        <ChevronRightIcon size={17} strokeWidth={2.2} className="shrink-0 text-[var(--color-ink-3)]" />
      )}
    </>
  )

  const classes = cn('list-row', pressable && 'press-sm active:bg-[var(--color-fill)]', className)

  if (to) return <Link to={to} className={classes}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  return <div className={classes}>{body}</div>
}
