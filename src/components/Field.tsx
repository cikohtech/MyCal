import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { CheckIcon } from '@/components/Icons'
import { cn } from '@/lib/cn'

interface WrapProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (id: string, describedBy: string | undefined) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className }: WrapProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="px-0.5 text-[0.82rem] font-medium text-[var(--color-ink-2)]">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="px-0.5 text-[0.78rem] leading-snug text-[var(--color-ink-3)]">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="px-0.5 text-[0.78rem] leading-snug text-[var(--color-critical)]">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | null
  suffix?: string
  wrapClassName?: string
}

export function TextField({ label, hint, error, suffix, wrapClassName, className, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapClassName}>
      {(id, describedBy) => (
        <div className="relative">
          <input
            id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}
            className={cn('field', suffix && 'pr-12', error && 'border-[var(--color-critical)]', className)}
            {...rest}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.88rem] text-[var(--color-ink-3)]">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  )
}

/**
 * One number, set big enough to type with a thumb and read across a kitchen.
 * Used wherever a screen exists to collect a single figure.
 */
export function HeroNumberField({
  value, onChange, unit, placeholder, autoFocus, inputMode = 'decimal', label,
}: {
  value: string
  onChange: (value: string) => void
  unit?: string
  placeholder?: string
  autoFocus?: boolean
  inputMode?: 'decimal' | 'numeric'
  label: string
}) {
  return (
    <div className="flex items-baseline justify-center gap-2">
      <input
        aria-label={label}
        className="field-hero tnum"
        style={{ width: `${Math.max(2, (value || placeholder || '').length + 0.6)}ch` }}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ''))}
      />
      {unit && (
        <span className="text-[1.3rem] font-medium text-[var(--color-ink-3)]">{unit}</span>
      )}
    </div>
  )
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | null
}

export function SelectField({ label, hint, error, className, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <select
          id={id} aria-describedby={describedBy}
          className={cn('field appearance-none pr-9 bg-no-repeat', className)}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23a5a5aa' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m5 9 7 7 7-7'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 0.7rem center',
          }}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  )
}

interface AreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  hint?: ReactNode
}

export function TextArea({ label, hint, className, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <textarea id={id} aria-describedby={describedBy} className={cn('field resize-y', className)} {...rest} />
      )}
    </Field>
  )
}

/**
 * A selection list, drawn as a grouped list with a checkmark on the chosen row
 * — the native pattern — rather than a web radio group. The whole row is the
 * target, so it is always thumb-sized.
 */
interface ChoiceProps<T extends string> {
  label?: string
  value: T
  options: { value: T; title: string; detail?: string }[]
  onChange: (value: T) => void
  hint?: ReactNode
}

export function ChoiceField<T extends string>({
  label, value, options, onChange, hint,
}: ChoiceProps<T>) {
  return (
    <fieldset className="min-w-0">
      {label && <legend className="group-label px-0.5 pb-1.5">{label}</legend>}
      <div className="list-group">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className="list-row press-sm cursor-pointer items-start active:bg-[var(--color-fill)]"
            >
              <input
                type="radio" name={label ?? 'choice'} value={option.value} checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="min-w-0 flex-1">
                <span className={cn(
                  'block text-[1rem] leading-tight',
                  selected && 'font-semibold',
                )}>
                  {option.title}
                </span>
                {option.detail && (
                  <span className="mt-1 block text-[0.82rem] leading-snug text-[var(--color-ink-3)]">
                    {option.detail}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'mt-0.5 shrink-0 transition-opacity',
                  selected ? 'text-[var(--color-tint)] opacity-100' : 'opacity-0',
                )}
                aria-hidden="true"
              >
                <CheckIcon size={20} strokeWidth={2.4} />
              </span>
            </label>
          )
        })}
      </div>
      {hint && <p className="group-note px-0.5">{hint}</p>}
    </fieldset>
  )
}
