import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useAnalysisJobs } from '@/app/analysis-jobs'
import { usePhotoAllowance, voiceLogsLeft } from '@/app/queries'
import { Button, IconButton, Spinner } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { useToast } from '@/components/Toast'
import { BarcodeIcon, CloseIcon, MicIcon, PencilIcon, StopIcon } from '@/components/Icons'
import { useVoiceRecorder, type Recording } from '@/features/voice/useVoiceRecorder'
import {
  LIMIT_WARNING_MS, MAX_AUDIO_BYTES, MAX_RECORDING_MS, MIN_RECORDING_MS, formatDuration,
  recordingSupported,
} from '@/services/voice'
import { cn } from '@/lib/cn'

/** Typed descriptions are capped well under what the function accepts. */
const MAX_TYPED_CHARS = 2000

/**
 * What a recording needs from the person before it is sent: nothing, usually.
 * These are the exceptions, each with a way forward.
 */
type Held =
  | { why: 'silent'; recording: Recording }
  | { why: 'interrupted'; recording: Recording }
  | { why: 'short' }
  | { why: 'too_large' }

const EXAMPLES = [
  'Two rotis with chicken curry and a glass of mango lassi',
  'For breakfast three scrambled eggs in butter, then a flat white with oat milk',
  'About 200 grams of grilled salmon, a cup of rice and some broccoli',
]

/**
 * Say what you ate, the way you would tell a friend.
 *
 * One way only: the person talks, the app listens, and the estimate turns up
 * on their day like a photo's does. Nothing is asked back. Every way this can
 * go wrong — no microphone, a refusal, silence, a phone call, the screen
 * locking — ends with what was said kept, or a way to type it instead.
 */
export function VoiceLog() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, today } = useSession()
  const { startVoice } = useAnalysisJobs()
  const allowance = usePhotoAllowance(user!.id).data
  const left = voiceLogsLeft(allowance)
  const usedUp = left === 0

  const [typing, setTyping] = useState(() => !recordingSupported())
  const [text, setText] = useState('')
  const [held, setHeld] = useState<Held | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  function handOff(input: Parameters<typeof startVoice>[0]) {
    startVoice(input, { consumedOn: today })
    toast.note(
      input.kind === 'audio'
        ? 'Listening back to what you said — it will appear on today.'
        : 'Reading what you wrote — it will appear on today.',
    )
    navigate('/today', { replace: true })
  }

  function send(recording: Recording) {
    handOff({
      kind: 'audio',
      blob: recording.blob,
      mimeType: recording.mimeType,
      durationMs: recording.durationMs,
    })
  }

  const recorder = useVoiceRecorder((recording) => {
    if (recording.blob.size > MAX_AUDIO_BYTES) return setHeld({ why: 'too_large' })
    if (recording.durationMs < MIN_RECORDING_MS || recording.blob.size < 1024) {
      return setHeld({ why: 'short' })
    }
    // Interrupted is asked about before silence: a recording cut off by a call
    // is the person's to judge, whatever the meter made of it.
    if (recording.reason === 'interrupted') return setHeld({ why: 'interrupted', recording })
    if (recording.heardSpeech === false) return setHeld({ why: 'silent', recording })
    if (recording.reason === 'limit') toast.note('Stopped at three minutes — sending what you said.')
    send(recording)
  })

  const recording = recorder.phase === 'recording'
  const starting = recorder.phase === 'starting'
  const remaining = MAX_RECORDING_MS - recorder.elapsedMs

  useEffect(() => {
    if (typing) textRef.current?.focus()
  }, [typing])

  function begin() {
    setHeld(null)
    recorder.clearFailure()
    void recorder.start()
  }

  function close() {
    recorder.cancel()
    navigate('/today')
  }

  function submitText() {
    const trimmed = text.trim()
    if (trimmed.length < 3) return
    handOff({ kind: 'text', text: trimmed })
  }

  /* ------------------------------- used up ------------------------------- */

  if (usedUp) {
    return (
      <Screen onClose={close} title="Say what you ate">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="grid h-[92px] w-[92px] place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink-3)]">
            <MicIcon size={36} />
          </span>
          <p className="text-[1.05rem] font-semibold">
            Your {allowance?.free_voice_limit} free voice logs are used up
          </p>
          <p className="max-w-[32ch] text-[0.88rem] leading-relaxed text-[var(--color-ink-2)]">
            Logging by voice needs a paid plan from here on. Scanning a barcode and
            typing a meal in are still free.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button icon={<BarcodeIcon size={17} />} onClick={() => navigate('/scan', { replace: true })}>
              Scan a barcode
            </Button>
            <Button icon={<PencilIcon size={17} />} onClick={() => navigate('/add?mode=manual', { replace: true })}>
              Add it by hand
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  /* -------------------------------- typing ------------------------------- */

  if (typing) {
    return (
      <Screen onClose={close} title="Type what you ate" subtitle={allowanceLine(left)}>
        <div className="flex flex-1 flex-col px-4 pt-4">
          <p className="mb-3 text-[0.9rem] leading-relaxed text-[var(--color-ink-2)]">
            Write it the way you would say it — amounts if you know them, rough
            sizes if you don’t. The app works out the rest.
          </p>
          <textarea
            ref={textRef}
            value={text}
            maxLength={MAX_TYPED_CHARS}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={EXAMPLES[0]}
            aria-label="What you ate"
            className="w-full resize-none rounded-[var(--radius-card)] bg-[var(--color-paper)] p-4 text-[1rem] leading-relaxed text-[var(--color-ink)] shadow-[var(--shadow-card)] outline-none ring-1 ring-[var(--color-line)] placeholder:text-[var(--color-ink-3)] focus:ring-2 focus:ring-[var(--color-tint)]"
          />
          <p className="tnum mt-1.5 text-right text-[0.74rem] text-[var(--color-ink-3)]">
            {text.length} / {MAX_TYPED_CHARS}
          </p>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-safe pt-3">
          <Button variant="primary" size="lg" full disabled={text.trim().length < 3} onClick={submitText}>
            Read it
          </Button>
          {recordingSupported() && (
            <Button variant="ghost" full icon={<MicIcon size={17} />} onClick={() => setTyping(false)}>
              Say it instead
            </Button>
          )}
        </div>
      </Screen>
    )
  }

  /* ------------------------------- talking ------------------------------- */

  return (
    <Screen
      onClose={close}
      title={recording ? 'Listening…' : 'Say what you ate'}
      subtitle={recording ? undefined : allowanceLine(left)}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {recording ? (
          <>
            <p
              className="tnum text-[3rem] font-semibold leading-none tracking-[-0.02em]"
              aria-live="off"
            >
              {formatDuration(recorder.elapsedMs)}
            </p>
            <LevelBars level={recorder.level} />
            <p className="max-w-[30ch] text-[0.9rem] leading-relaxed text-[var(--color-ink-2)]">
              {remaining <= LIMIT_WARNING_MS
                ? `${Math.ceil(remaining / 1000)} seconds left — it will send itself.`
                : 'Take your time. Mention amounts if you know them. Tap stop when you’re done.'}
            </p>
          </>
        ) : held ? (
          <HeldNotice
            held={held}
            onSend={(r) => send(r)}
            onRetry={begin}
            onType={() => { setHeld(null); setTyping(true) }}
          />
        ) : recorder.failure ? (
          <Callout tone="problem" title="The microphone did not start" className="w-full text-left">
            {recorder.failure.message}
          </Callout>
        ) : (
          <div className="flex w-full max-w-[34ch] flex-col gap-4 text-left">
            <p className="text-center text-[0.95rem] leading-relaxed text-[var(--color-ink-2)]">
              Tap the microphone and talk — however it comes out. For example:
            </p>
            <ul className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <li
                  key={example}
                  className="rounded-[14px] bg-[var(--color-paper)] px-3.5 py-2.5 text-[0.86rem] leading-snug text-[var(--color-ink-2)] ring-1 ring-[var(--color-line)]"
                >
                  “{example}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 px-6 pb-safe pt-4">
        {!held && (
          <button
            type="button"
            onClick={recording ? recorder.stop : begin}
            disabled={starting}
            aria-label={recording ? 'Stop and send' : 'Start recording'}
            className={cn(
              'press relative grid h-[84px] w-[84px] place-items-center rounded-full shadow-[var(--shadow-float)] transition-colors',
              recording
                ? 'bg-[var(--color-critical)] text-white'
                : 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]',
            )}
          >
            {recording && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[var(--color-critical)] opacity-30 transition-transform duration-100"
                style={{ transform: `scale(${1 + recorder.level * 0.45})` }}
              />
            )}
            <span className="relative">
              {starting ? <Spinner /> : recording ? <StopIcon size={30} /> : <MicIcon size={32} strokeWidth={1.8} />}
            </span>
          </button>
        )}
        <p className="text-[0.8rem] text-[var(--color-ink-3)]" aria-live="polite">
          {starting
            ? 'Waiting for the microphone…'
            : recording
              ? 'Tap to stop and send'
              : held ? '' : 'Up to three minutes'}
        </p>
        {/* A held recording offers its own way to type, right beside the choice. */}
        {!recording && !starting && !held && (
          <Button variant="ghost" size="sm" icon={<PencilIcon size={16} />} onClick={() => setTyping(true)}>
            Type it instead
          </Button>
        )}
      </div>
    </Screen>
  )
}

function allowanceLine(left: number | null): string | undefined {
  if (left === null || left <= 0) return undefined
  return left === 1 ? '1 free voice log left' : `${left} free voice logs left`
}

function Screen({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-canvas)]">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pt-safe">
          <IconButton label="Cancel" tone="filled" onClick={onClose}>
            <CloseIcon size={18} strokeWidth={2.2} />
          </IconButton>
          <div className="min-w-0 text-center">
            <p className="truncate text-[0.95rem] font-semibold">{title}</p>
            {subtitle && <p className="tnum text-[0.74rem] text-[var(--color-ink-3)]">{subtitle}</p>}
          </div>
          <span className="w-[36px]" />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Seven bars that move with the voice — proof the microphone is hearing you. */
function LevelBars({ level }: { level: number }) {
  const shape = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45]
  return (
    <div className="flex h-[56px] items-center gap-[6px]" aria-hidden="true">
      {shape.map((weight, index) => (
        <span
          key={index}
          className="w-[6px] rounded-full bg-[var(--color-critical)] transition-[height] duration-100"
          style={{ height: `${Math.max(6, Math.round(56 * Math.min(1, level * weight * 1.4)))}px` }}
        />
      ))}
    </div>
  )
}

function HeldNotice({
  held, onSend, onRetry, onType,
}: {
  held: Held
  onSend: (recording: Recording) => void
  onRetry: () => void
  onType: () => void
}) {
  const copy = {
    silent: {
      title: 'That sounded silent',
      body: 'The microphone did not pick up any talking. Check it is not muted or covered, and try again.',
    },
    interrupted: {
      title: 'The recording stopped early',
      body: 'Leaving the app, or a call, cuts the microphone off. Send what was said so far, or start over.',
    },
    short: {
      title: 'That was too short to hear',
      body: 'Hold on a moment longer — say what you ate, then tap stop.',
    },
    too_large: {
      title: 'That recording is too large to send',
      body: 'Try a shorter one, or split the day into two logs.',
    },
  }[held.why]

  const recording = 'recording' in held ? held.recording : null

  return (
    <div className="flex w-full max-w-[34ch] flex-col gap-4">
      <Callout tone="problem" title={copy.title} className="text-left">{copy.body}</Callout>
      <div className="flex flex-col gap-2">
        <Button variant="primary" icon={<MicIcon size={17} />} onClick={onRetry}>
          Record again
        </Button>
        {recording && (
          <Button onClick={() => onSend(recording)}>
            {held.why === 'interrupted'
              ? `Send what I said (${formatDuration(recording.durationMs)})`
              : 'Send it anyway'}
          </Button>
        )}
        <Button variant="ghost" icon={<PencilIcon size={16} />} onClick={onType}>
          Type it instead
        </Button>
      </div>
    </div>
  )
}
