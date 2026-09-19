import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertIcon, CheckIcon, InfoIcon } from '@/components/Icons'

type Tone = 'done' | 'problem' | 'note'

interface Toast {
  id: number
  tone: Tone
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  /** Past tense, matching the button that caused it: "Saved", "Removed". */
  done(message: string, action?: Toast['action']): void
  problem(message: string, action?: Toast['action']): void
  note(message: string, action?: Toast['action']): void
}

const ToastContext = createContext<ToastApi | null>(null)

const TONE_STYLE: Record<Tone, { icon: ReactNode; className: string }> = {
  done: { icon: <CheckIcon size={17} strokeWidth={2.4} />, className: 'text-[var(--color-good)]' },
  problem: { icon: <AlertIcon size={17} strokeWidth={2.2} />, className: 'text-[var(--color-critical)]' },
  note: { icon: <InfoIcon size={17} strokeWidth={2.2} />, className: 'text-[var(--color-ink-2)]' },
}

/** A floating capsule above the tab bar — the shape a phone uses to confirm. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((tone: Tone, message: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { id, tone, message, action }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, action ? 8000 : 4200)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    done: (m, a) => push('done', m, a),
    problem: (m, a) => push('problem', m, a),
    note: (m, a) => push('note', m, a),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] z-[60] flex flex-col items-center gap-2 px-4"
          role="status" aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="rise glass pointer-events-auto flex w-auto max-w-[min(92vw,420px)] items-center gap-2.5 rounded-full py-2.5 pl-3.5 pr-4 text-[0.9rem] shadow-[var(--shadow-float)]"
            >
              <span className={TONE_STYLE[toast.tone].className}>{TONE_STYLE[toast.tone].icon}</span>
              <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick()
                    setToasts((c) => c.filter((t) => t.id !== toast.id))
                  }}
                  className="shrink-0 font-semibold text-[var(--color-tint)]"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
