import type { ReactNode } from 'react'
import { AlertIcon, InfoIcon, SparkIcon } from '@/components/Icons'
import { cn } from '@/lib/cn'

type Tone = 'note' | 'estimate' | 'problem'

const TONES: Record<Tone, { icon: ReactNode; surface: string; ink: string }> = {
  note: {
    icon: <InfoIcon size={17} strokeWidth={1.9} />,
    surface: 'bg-[var(--color-fill)]',
    ink: 'text-[var(--color-ink-2)]',
  },
  estimate: {
    icon: <SparkIcon size={17} strokeWidth={1.9} />,
    surface: 'bg-[color-mix(in_oklab,var(--color-fat)_10%,var(--color-paper))]',
    ink: 'text-[var(--color-fat)]',
  },
  problem: {
    icon: <AlertIcon size={17} strokeWidth={1.9} />,
    surface: 'bg-[color-mix(in_oklab,var(--color-critical)_10%,var(--color-paper))]',
    ink: 'text-[var(--color-critical)]',
  },
}

interface Props {
  tone?: Tone
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function Callout({ tone = 'note', title, children, action, className }: Props) {
  const style = TONES[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-[14px] p-3.5', style.surface, className)}>
      <span className={cn('mt-[3px] shrink-0', style.ink)}>{style.icon}</span>
      <div className="min-w-0 flex-1 text-[0.87rem] leading-snug text-[var(--color-ink-2)]">
        {title && <p className="mb-0.5 font-semibold text-[var(--color-ink)]">{title}</p>}
        {children}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}

/** Marks a number the app guessed rather than read off a label. */
export function EstimateTag({ provenance }: { provenance: 'reference' | 'estimate' | 'label' | 'corrected' }) {
  const copy = {
    reference: { text: 'Database', tone: 'text-[var(--color-protein)]' },
    label: { text: 'From label', tone: 'text-[var(--color-protein)]' },
    estimate: { text: 'Estimated', tone: 'text-[var(--color-fat)]' },
    corrected: { text: 'Edited', tone: 'text-[var(--color-ink-2)]' },
  }[provenance]

  return (
    <span className={cn('inline-flex items-center gap-1 text-[0.74rem] font-medium', copy.tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {copy.text}
    </span>
  )
}
