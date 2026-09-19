import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DayMeter } from '@/components/DayMeter'
import { Callout } from '@/components/Callout'
import { FlameIcon, GoogleMark } from '@/components/Icons'
import { store } from '@/services/db'
import { cn } from '@/lib/cn'
import { kcal } from '@/lib/format'

type Mode = 'sign-in' | 'sign-up'

/** A sample day, so the first thing you see is what the app actually shows you. */
const SAMPLE = [
  { meal_type: 'breakfast' as const, calories_kcal: 420 },
  { meal_type: 'lunch' as const, calories_kcal: 610 },
  { meal_type: 'snack' as const, calories_kcal: 180 },
]

export function SignIn() {
  const navigate = useNavigate()
  const local = store.kind === 'local'

  const [mode, setMode] = useState<Mode>('sign-up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Which button is working, so only that one shows a spinner. */
  const [pending, setPending] = useState<'form' | 'google' | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!local) {
      if (!email.includes('@')) return setError('Enter the email address for your account.')
      if (password.length < 8) return setError('Passwords need at least 8 characters.')
    }

    setPending('form')
    try {
      // Creating an account signs you straight in — there is no inbox step.
      if (mode === 'sign-up') await store.signUp(email, password)
      else await store.signIn(email, password)
      navigate('/today', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.')
    } finally {
      setPending(null)
    }
  }

  async function handleGoogle() {
    setError(null)
    setPending('google')
    try {
      // This navigates away to Google and comes back to the front door, so
      // there is nothing to do afterwards — the router takes it from there.
      await store.signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in did not work. Try again.')
      setPending(null)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col justify-center px-5 py-10 pt-safe">
      <div className="pop-in flex flex-col items-center text-center">
        <span className="grid h-[64px] w-[64px] place-items-center rounded-[19px] bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-lift)]">
          <FlameIcon size={31} strokeWidth={1.7} />
        </span>
        <h1 className="mt-5 text-[2.5rem] leading-none tracking-[-0.03em]">My Cal</h1>
        <p className="mt-2.5 max-w-[30ch] text-[1rem] leading-relaxed text-[var(--color-ink-2)]">
          Photograph a meal, check the estimate, keep an honest ledger of the day.
        </p>
      </div>

      {/* What the app actually looks like once you are in. */}
      <div className="card rise mt-7 p-4" style={{ animationDelay: '90ms' }}>
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[0.8rem] font-medium uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
            Remaining
          </p>
          <p className="tnum text-[0.84rem] text-[var(--color-ink-3)]">
            {kcal(1210)} / {kcal(2210)} kcal
          </p>
        </div>
        <p className="tnum -mt-1 mb-3 text-[2.6rem] font-bold leading-none tracking-[-0.035em]">
          {kcal(1000)}
        </p>
        <DayMeter segments={SAMPLE} consumed={1210} target={2210} />
      </div>

      {!local && (
        <div className="rise mt-7 flex flex-col gap-4" style={{ animationDelay: '150ms' }}>
          <Button
            variant="secondary" size="lg" full
            onClick={handleGoogle}
            loading={pending === 'google'}
            disabled={pending === 'form'}
            icon={<GoogleMark />}
          >
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-[0.78rem] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn('rise flex flex-col gap-4', local ? 'mt-7' : 'mt-4')}
        style={{ animationDelay: '190ms' }}
      >
        {local ? (
          <Callout tone="note" title="No account needed here">
            Supabase isn’t connected, so everything you log stays in this browser.
          </Callout>
        ) : (
          <>
            <SegmentedControl<Mode>
              label="Account"
              value={mode}
              onChange={(value) => { setMode(value); setError(null) }}
              options={[
                { value: 'sign-up', label: 'Create account' },
                { value: 'sign-in', label: 'Sign in' },
              ]}
            />
            <div className="card flex flex-col gap-3.5 p-4">
              <TextField
                label="Email" type="email" autoComplete="email" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                enterKeyHint="next"
              />
              <TextField
                label="Password" type="password"
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
                enterKeyHint="go"
              />
            </div>
          </>
        )}

        {error && <Callout tone="problem">{error}</Callout>}

        <Button
          type="submit" variant="primary" size="lg" full
          loading={pending === 'form'}
          disabled={pending === 'google'}
        >
          {local ? 'Start tracking' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="mx-auto mt-8 max-w-[38ch] text-center text-[0.78rem] leading-relaxed text-[var(--color-ink-3)]">
        My Cal estimates. It is a tracking aid, not medical advice, and every number it
        produces stays yours to correct.
      </p>
    </div>
  )
}
