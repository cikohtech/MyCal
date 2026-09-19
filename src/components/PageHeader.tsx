import type { ReactNode } from 'react'

interface Props {
  title: string
  eyebrow?: string
  aside?: ReactNode
  children?: ReactNode
}

/** Kept for screens that want the large title with an action beside it. */
export function PageHeader({ title, eyebrow, aside, children }: Props) {
  return (
    <header className="flex items-end justify-between gap-4 pb-4 pt-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="truncate text-[0.84rem] font-medium text-[var(--color-ink-3)]">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 truncate text-[2rem] leading-[1.1]">{title}</h1>
        {children}
      </div>
      {aside && <div className="shrink-0 pb-1">{aside}</div>}
    </header>
  )
}
