/**
 * What arrives at analyze-food-voice, checked before anything is spent on it:
 * a recording as multipart form data, or a typed description as JSON.
 */

/** Three minutes of Opus is well under a megabyte; this leaves room for AAC and then some. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
/** Smaller than this, a container has no room for any speech in it. */
const MIN_AUDIO_BYTES = 1024
export const MAX_TEXT_CHARS = 4000

/**
 * What a browser's recorder produces, mapped to the extension the provider
 * decodes by. Safari records MP4/AAC, Chrome and Firefox WebM or Ogg Opus.
 */
const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
}

export type Input =
  | { kind: 'voice'; audio: ArrayBuffer; mimeType: string; extension: string }
  /** `transcribed`: the words of an earlier recording, sent back for a retry. */
  | { kind: 'text'; text: string; transcribed: boolean }

export interface VoiceRequest {
  input: Input
  idempotencyKey: string | null
  timezone: string | null
  units: 'metric' | 'imperial'
}

/** Strips codec parameters: "audio/webm;codecs=opus" is "audio/webm". */
function baseType(value: string): string {
  return value.split(';')[0].trim().toLowerCase()
}

function shortField(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : null
}

function validTimezone(value: unknown): string | null {
  const zone = shortField(value, 64)
  if (!zone) return null
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return zone
  } catch {
    return null
  }
}

/** Typed text keeps its line breaks — a list is easier to read as a list. */
function tidyText(value: string): string {
  return value.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Reads either shape of request. Failures come back as the code to answer
 * with, so a bad upload gets the same kind of reply as a bad model answer.
 */
export async function readRequest(request: Request): Promise<VoiceRequest | { error: string; status?: number }> {
  // A declared length turns an oversized upload away before it is read.
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 64 * 1024) {
    return { error: 'audio_too_large' }
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return { error: 'bad_request', status: 400 }
    }
    const file = form.get('audio')
    if (!(file instanceof File)) return { error: 'bad_request', status: 400 }
    if (file.size > MAX_AUDIO_BYTES) return { error: 'audio_too_large' }
    if (file.size < MIN_AUDIO_BYTES) return { error: 'no_speech' }

    // A part sent without a type arrives as application/octet-stream, not as
    // nothing — so the type the client sends beside it is tried as well.
    const mimeType = [file.type, String(form.get('mime_type') ?? '')]
      .map(baseType)
      .find((type) => type in AUDIO_TYPES)
    if (!mimeType) return { error: 'unsupported_audio' }
    const extension = AUDIO_TYPES[mimeType]

    return {
      input: { kind: 'voice', audio: await file.arrayBuffer(), mimeType, extension },
      idempotencyKey: shortField(form.get('idempotency_key'), 128),
      timezone: validTimezone(form.get('timezone')),
      units: form.get('units') === 'imperial' ? 'imperial' : 'metric',
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return { error: 'bad_request', status: 400 }
  }
  const text = typeof body?.text === 'string' ? tidyText(body.text) : ''
  if (!text) return { error: 'bad_request', status: 400 }
  if (text.length > MAX_TEXT_CHARS) return { error: 'text_too_long' }

  return {
    input: { kind: 'text', text, transcribed: body.transcribed === true },
    idempotencyKey: shortField(body.idempotency_key, 128),
    timezone: validTimezone(body.timezone),
    units: body.units === 'imperial' ? 'imperial' : 'metric',
  }
}

