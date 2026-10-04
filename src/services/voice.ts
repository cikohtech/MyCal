/**
 * Microphone access and recording. Like the camera, nothing here runs until a
 * person taps a button — `getUserMedia` is never called on page load.
 *
 * The recording never touches storage on the server. It is held in memory (and
 * in this browser's IndexedDB, so a reload does not lose it) until the voice
 * log it belongs to is saved or thrown away.
 */

export type MicFailure =
  | 'denied' | 'unavailable' | 'in_use' | 'insecure_context' | 'unsupported' | 'unknown'

export class MicError extends Error {
  constructor(public readonly reason: MicFailure, message: string) {
    super(message)
    this.name = 'MicError'
  }
}

export const MIC_MESSAGES: Record<MicFailure, string> = {
  denied: 'Microphone access is blocked. Allow it for this site in your browser settings, or type what you ate instead.',
  unavailable: 'There is no microphone this browser can use. Type what you ate instead.',
  in_use: 'Another app is using the microphone. Close it and try again.',
  insecure_context: 'The microphone needs a secure connection (https). Type what you ate instead.',
  unsupported: 'This browser cannot record audio. Type what you ate instead, or update the browser.',
  unknown: 'The microphone could not be started. Try again, or type what you ate instead.',
}

/** Shorter than this is a mis-tap, not a meal. */
export const MIN_RECORDING_MS = 1200
/** Room to describe a whole day's eating, while keeping one request quick. */
export const MAX_RECORDING_MS = 180_000
/** When the countdown to the limit starts showing. */
export const LIMIT_WARNING_MS = 20_000
/** The edge function's own ceiling; three minutes of speech is a tenth of it. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
/** Plenty for speech, and it keeps Safari's AAC from ballooning. */
export const AUDIO_BITS_PER_SECOND = 64_000

/**
 * Tried in order. Opus is the smallest for speech; MP4/AAC is what Safari
 * records. The transcription model takes all of them.
 */
export const RECORDING_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
}

/**
 * The first container this browser will record. Null means none of them
 * claimed support — older Safari says no to everything and records MP4
 * anyway — so the recorder is left to choose its own default.
 */
export function pickRecordingType(
  isSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type),
): string | null {
  for (const type of RECORDING_TYPES) {
    try {
      if (isSupported(type)) return type
    } catch {
      // A browser that throws on the question has answered it.
    }
  }
  return null
}

/** "audio/webm;codecs=opus" is "audio/webm". */
export function baseAudioType(type: string | null | undefined): string {
  return (type ?? '').split(';')[0].trim().toLowerCase()
}

/** The provider decodes by extension, so it has to match what was recorded. */
export function audioExtension(type: string | null | undefined): string {
  const base = baseAudioType(type)
  if (base.endsWith('/webm')) return 'webm'
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'm4a'
  if (base.endsWith('/mp4')) return 'mp4'
  if (base.endsWith('/ogg')) return 'ogg'
  if (base === 'audio/mpeg' || base === 'audio/mp3') return 'mp3'
  if (base.includes('wav')) return 'wav'
  if (base.endsWith('/flac')) return 'flac'
  // An unlabelled recording is almost always Safari's MP4.
  return base ? 'webm' : 'mp4'
}

/**
 * Asks for the microphone. Echo cancellation, noise suppression and gain
 * control are the browser's own speech settings — they are what a phone call
 * uses, and they are what turns a noisy kitchen into words.
 */
export async function openMicrophone(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new MicError('insecure_context', MIC_MESSAGES.insecure_context)
  }
  if (!recordingSupported()) {
    throw new MicError('unsupported', MIC_MESSAGES.unsupported)
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    })
  } catch (error) {
    const name = (error as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
      throw new MicError('denied', MIC_MESSAGES.denied)
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
      throw new MicError('unavailable', MIC_MESSAGES.unavailable)
    }
    if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
      throw new MicError('in_use', MIC_MESSAGES.in_use)
    }
    throw new MicError('unknown', MIC_MESSAGES.unknown)
  }
}

/** Every track stopped, so the browser's recording indicator goes out. */
export function closeMicrophone(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Loudness of one buffer of 8-bit time-domain samples, as RMS from 0 to 1.
 * Bytes rather than floats because Safari has had the byte call far longer.
 */
export function rmsLevel(samples: Uint8Array): number {
  if (!samples.length) return 0
  let sum = 0
  for (const sample of samples) {
    const centred = (sample - 128) / 128
    sum += centred * centred
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * Above this, a buffer counts as somebody talking. Speech through a phone's
 * gain control sits around 0.05–0.3; a quiet room under noise suppression sits
 * near 0.01.
 */
export const SPEECH_RMS = 0.02
/** How much talking a recording needs before it is worth sending. */
export const MIN_SPEECH_MS = 350

/** "1:05" — how a recording's length is written everywhere. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
