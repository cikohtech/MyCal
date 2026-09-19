import type { ReactNode } from 'react'

interface Props {
  title: string
  body: string
  action?: ReactNode
  icon?: ReactNode
}

/** An empty screen is an invitation to act, not a shrug. */
export function EmptyState({ title, body, action, icon }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && (
        <span className="mb-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink-3)]">
          {icon}
        </span>
      )}
      <div>
        <h3 className="text-[1.15rem]">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[0.9rem] leading-relaxed text-[var(--color-ink-2)]">
          {body}
        </p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
