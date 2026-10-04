import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AUDIO_BITS_PER_SECOND, MAX_RECORDING_MS, MIC_MESSAGES, MIN_SPEECH_MS, MicError, SPEECH_RMS,
  closeMicrophone, openMicrophone, pickRecordingType, rmsLevel, type MicFailure,
} from '@/services/voice'

export type RecorderPhase = 'idle' | 'starting' | 'recording'

/** Why a recording ended — the screen treats each one differently. */
export type StopReason = 'stopped' | 'limit' | 'interrupted'

export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
  /**
   * Whether the level meter heard anyone talking. Null when there was no meter
   * to ask — then nobody knows, and the recording is not second-guessed.
   */
  heardSpeech: boolean | null
  reason: StopReason
}

interface WakeLockHandle { release(): Promise<void> }

type AudioContextClass = typeof AudioContext

/**
 * One recording at a time, from a tap to a blob.
 *
 * Everything that can end a recording ends it the same way — through the
 * recorder's own stop, which delivers the audio — so the person's words are
 * never thrown away by an interruption. Only `cancel` discards.
 */
export function useVoiceRecorder(onFinish: (recording: Recording) => void) {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  /** 0–1, smoothed, for the meter. */
  const [level, setLevel] = useState(0)
  const [failure, setFailure] = useState<{ reason: MicFailure; message: string } | null>(null)

  const finishRef = useRef(onFinish)
  finishRef.current = onFinish

  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const meter = useRef<number | null>(null)
  const ticker = useRef<number | null>(null)
  const wakeLock = useRef<WakeLockHandle | null>(null)
  const startedAt = useRef(0)
  const speechMs = useRef(0)
  const reason = useRef<StopReason>('stopped')
  /** Set by cancel and unmount: the audio that arrives afterwards is not wanted. */
  const discarding = useRef(false)
  const mounted = useRef(true)

  const teardown = useCallback(() => {
    if (meter.current !== null) window.clearInterval(meter.current)
    meter.current = null
    if (ticker.current !== null) window.clearInterval(ticker.current)
    ticker.current = null
    closeMicrophone(stream.current)
    stream.current = null
    analyser.current = null
    void audioContext.current?.close().catch(() => undefined)
    audioContext.current = null
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
    recorder.current = null
  }, [])

  /** Ends the recording, keeping what was said. Safe to call more than once. */
  const finishWith = useCallback((why: StopReason) => {
    const active = recorder.current
    if (!active || active.state === 'inactive') return
    reason.current = why
    try {
      active.stop()
    } catch {
      // A recorder that will not stop has nothing left to give; let it go.
      teardown()
      if (mounted.current) setPhase('idle')
    }
  }, [teardown])

  const stop = useCallback(() => finishWith('stopped'), [finishWith])

  const cancel = useCallback(() => {
    discarding.current = true
    const active = recorder.current
    if (active && active.state !== 'inactive') {
      try { active.stop() } catch { /* torn down below either way */ }
    }
    teardown()
    chunks.current = []
    setPhase('idle')
    setElapsedMs(0)
    setLevel(0)
  }, [teardown])

  /**
   * Reads the meter: how loud, and whether it has been loud long enough to be
   * talk. A timer rather than animation frames, on purpose — frames stop
   * whenever the browser is not painting, and the silence check must not
   * mistake a paused screen for a quiet person.
   */
  const listen = useCallback(() => {
    const node = analyser.current
    if (!node) return
    const samples = new Uint8Array(node.fftSize)
    let last = performance.now()
    let shown = 0

    meter.current = window.setInterval(() => {
      if (!analyser.current) return
      const now = performance.now()
      node.getByteTimeDomainData(samples)
      const rms = rmsLevel(samples)
      if (rms > SPEECH_RMS) speechMs.current += now - last
      last = now
      // Quick to rise, slow to fall: it reads as a voice rather than a flicker.
      shown = Math.max(Math.min(1, rms * 4.5), shown * 0.7)
      setLevel(shown)
    }, 100)
  }, [])

  const start = useCallback(async () => {
    if (recorder.current || phase !== 'idle') return
    setFailure(null)
    discarding.current = false
    chunks.current = []
    speechMs.current = 0
    reason.current = 'stopped'

    // Created here, inside the tap, before anything is awaited: iOS will only
    // let an AudioContext run if it was started by a gesture, and the meter
    // is what tells a silent recording from a real one.
    let context: AudioContext | null = null
    try {
      const Context = (window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext)
      if (Context) {
        context = new Context()
        void context.resume().catch(() => undefined)
      }
    } catch {
      context = null
    }

    setPhase('starting')
    let media: MediaStream
    try {
      media = await openMicrophone()
    } catch (error) {
      void context?.close().catch(() => undefined)
      const failed = error instanceof MicError ? error.reason : 'unknown'
      if (mounted.current) {
        setFailure({ reason: failed, message: MIC_MESSAGES[failed] })
        setPhase('idle')
      }
      return
    }

    // Left the screen while the permission prompt was up.
    if (!mounted.current || discarding.current) {
      closeMicrophone(media)
      void context?.close().catch(() => undefined)
      return
    }

    let active: MediaRecorder
    try {
      const type = pickRecordingType()
      active = new MediaRecorder(media, {
        ...(type ? { mimeType: type } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
    } catch {
      try {
        // Options a browser dislikes are not worth failing over; its own
        // defaults record speech perfectly well.
        active = new MediaRecorder(media)
      } catch {
        closeMicrophone(media)
        void context?.close().catch(() => undefined)
        setFailure({ reason: 'unsupported', message: MIC_MESSAGES.unsupported })
        setPhase('idle')
        return
      }
    }

    stream.current = media
    recorder.current = active
    audioContext.current = context

    if (context) {
      try {
        const node = context.createAnalyser()
        node.fftSize = 1024
        context.createMediaStreamSource(media).connect(node)
        analyser.current = node
      } catch {
        analyser.current = null
      }
    }

    active.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.current.push(event.data)
    }
    active.onerror = () => finishWith('interrupted')
    active.onstop = () => {
      const durationMs = Date.now() - startedAt.current
      const mimeType = active.mimeType || chunks.current[0]?.type || ''
      const blob = new Blob(chunks.current, mimeType ? { type: mimeType } : undefined)
      // A context that never ran heard nothing, which is different from
      // hearing silence — that recording is not second-guessed.
      const metered = analyser.current !== null && audioContext.current?.state === 'running'
      const heardSpeech = metered ? speechMs.current >= MIN_SPEECH_MS : null
      chunks.current = []
      teardown()
      if (!mounted.current) return
      setPhase('idle')
      setLevel(0)
      if (discarding.current) return
      finishRef.current({ blob, mimeType, durationMs, heardSpeech, reason: reason.current })
    }
    // A microphone unplugged, or taken by a call, ends the track. What was
    // said up to then is still worth keeping.
    for (const track of media.getAudioTracks()) {
      track.addEventListener('ended', () => finishWith('interrupted'))
    }

    try {
      // No timeslice: one blob at the end. Safari's sliced MP4 has been
      // unreliable, and nothing here needs the audio before it is finished.
      active.start()
    } catch {
      teardown()
      setFailure({ reason: 'unknown', message: MIC_MESSAGES.unknown })
      setPhase('idle')
      return
    }

    startedAt.current = Date.now()
    setElapsedMs(0)
    setPhase('recording')
    listen()

    ticker.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      setElapsedMs(elapsed)
      if (elapsed >= MAX_RECORDING_MS) finishWith('limit')
    }, 200)

    // A phone that dims and locks mid-sentence suspends the page, and the
    // recording with it. Keeping the screen on for those minutes avoids that.
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockHandle> } }
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null
    } catch {
      wakeLock.current = null
    }
  }, [finishWith, listen, phase, teardown])

  // Leaving the app mid-recording: iOS silences the microphone in the
  // background, so carrying on would record nothing. It is ended here instead,
  // keeping everything said so far for the person to send or redo.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finishWith('interrupted')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [finishWith])

  // Navigating away mid-recording discards it and, above all, turns the
  // microphone off — a recording indicator left lit is a broken promise.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      discarding.current = true
      const active = recorder.current
      if (active && active.state !== 'inactive') {
        try { active.stop() } catch { /* torn down below */ }
      }
      teardown()
    }
  }, [teardown])

  return { phase, elapsedMs, level, failure, start, stop, cancel, clearFailure: () => setFailure(null) }
}
