import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/components/Icons'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * A bottom sheet, because every destructive or committing action in this app
 * happens with one thumb. It carries a grabber so the shape reads as draggable
 * furniture rather than a dialog; focus is trapped while it is open and Escape
 * closes it.
 */
export function Sheet({ open, onClose, title, description, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }, 60)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      window.clearTimeout(timer)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button" aria-label="Close" onClick={onClose}
        className="fade-in absolute inset-0 bg-[rgb(0_0_0/0.32)] backdrop-blur-[3px]"
      />
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-label={title}
        className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] bg-[var(--color-canvas)] shadow-[var(--shadow-float)] sm:max-w-[520px] sm:rounded-[var(--radius-sheet)]"
        style={{ animation: 'sheet-up 340ms cubic-bezier(0.32,0.72,0,1) both' }}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-[var(--color-line-strong)] sm:hidden"
        />

        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-3">
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[1.25rem]">{title}</h2>
            {description && (
              <p className="mt-1 text-[0.85rem] leading-snug text-[var(--color-ink-2)]">{description}</p>
            )}
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="press -mr-1 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink-2)]"
          >
            <CloseIcon size={17} strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer && (
          <div className="glass hairline-t px-5 pb-safe pt-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
