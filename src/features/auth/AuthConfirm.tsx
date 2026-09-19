import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Spinner } from '@/components/Button'
import { CheckIcon, FlameIcon } from '@/components/Icons'
import { arrivalParams, supabase } from '@/lib/supabase'

type Phase = 'working' | 'done' | 'failed'

/**
 * Where a mailed link lands.
 *
 * Supabase can hand the session back three different ways depending on how the
 * project is set up and which mail client mangled the URL, so this accepts all
 * of them: a token hash to verify, a PKCE code to exchange, or a session the
 * client already picked out of the URL on its own. The one thing it never does
 * is leave someone staring at the front door wondering whether it worked.
 */
export function AuthConfirm() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('working')
  const [message, setMessage] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      if (!supabase) return navigate('/', { replace: true })

      // The snapshot first, the live URL second: by now the client may have
      // eaten the parameters, and it may not have.
      const query = new URLSearchParams(arrivalParams.search || window.location.search)
      const hash = new URLSearchParams(
        (arrivalParams.hash || window.location.hash).replace(/^#/, ''),
      )
      const pick = (name: string) => query.get(name) ?? hash.get(name)

      const problem = pick('error_description') ?? pick('error')
      if (problem) {
        setPhase('failed')
        setMessage(
          /expired|invalid/i.test(problem)
            ? 'That link has expired. Links are good for one use — send yourself a fresh one from the sign-in screen.'
            : problem.replace(/\+/g, ' '),
        )
        return
      }

      // The client parses the URL as it is created, so by now the session may
      // already be in place and there is nothing left to redeem.
      const { data: existing } = await supabase.auth.getSession()
      if (existing.session) return settle()

      const tokenHash = pick('token_hash')
      const type = pick('type')
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'signup' | 'email' | 'recovery' | 'email_change' | 'magiclink') ?? 'email',
        })
        if (error) return fail(error.message)
        return settle()
      }

      const code = pick('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) return settle()
        // A code needs the verifier stored by the browser that asked for it.
        // Opening the link on the phone after signing up on a laptop is the
        // ordinary way to end up here, and it deserves saying so.
        setPhase('failed')
        setMessage(
          'This link has to be opened in the same browser you signed up in. Open it there, or send yourself a fresh one from the sign-in screen.',
        )
        return
      }

      // Nothing to act on — somebody opened this address directly.
      navigate('/', { replace: true })

      function settle() {
        setPhase('done')
        // A beat on the confirmation, so the click has a visible result rather
        // than a flash of something on the way past.
        window.setTimeout(() => navigate('/', { replace: true }), 900)
      }

      function fail(reason: string) {
        setPhase('failed')
        setMessage(
          /expired|invalid|already/i.test(reason)
            ? 'That link has already been used or has expired. Send yourself a fresh one from the sign-in screen.'
            : reason,
        )
      }
    })()
  }, [navigate])

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col items-center justify-center px-6 text-center">
      <span
        className="grid h-[62px] w-[62px] place-items-center rounded-[18px] bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-lift)]"
      >
        {phase === 'done' ? <CheckIcon size={30} strokeWidth={2.4} /> : <FlameIcon size={30} strokeWidth={1.7} />}
      </span>

      {phase === 'working' && (
        <>
          <h1 className="mt-6 text-[1.7rem]">Confirming your email</h1>
          <p className="mt-2 text-[0.92rem] text-[var(--color-ink-2)]">One moment.</p>
          <span className="mt-5 text-[var(--color-ink-3)]"><Spinner /></span>
        </>
      )}

      {phase === 'done' && (
        <>
          <h1 className="mt-6 text-[1.7rem]">You’re confirmed</h1>
          <p className="mt-2 max-w-[30ch] text-[0.95rem] leading-relaxed text-[var(--color-ink-2)]">
            Taking you into My Cal now.
          </p>
        </>
      )}

      {phase === 'failed' && (
        <>
          <h1 className="mt-6 text-[1.7rem]">That link didn’t work</h1>
          <p className="mt-2 max-w-[34ch] text-[0.95rem] leading-relaxed text-[var(--color-ink-2)]">
            {message}
          </p>
          <Button
            className="mt-6" variant="primary" size="lg"
            onClick={() => navigate('/', { replace: true })}
          >
            Back to sign in
          </Button>
        </>
      )}
    </div>
  )
}
