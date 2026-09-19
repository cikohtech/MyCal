/**
 * Camera access and image preparation. Nothing here runs until a person taps
 * a button — `getUserMedia` is never called speculatively on page load.
 */

export type CameraFailure =
  | 'denied' | 'unavailable' | 'in_use' | 'insecure_context' | 'unknown'

export class CameraError extends Error {
  constructor(public readonly reason: CameraFailure, message: string) {
    super(message)
    this.name = 'CameraError'
  }
}

export const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  denied: 'Camera access is blocked. Allow it in your browser settings, or choose a photo from your library instead.',
  unavailable: 'This device has no camera available to the browser. Choose a photo from your library instead.',
  in_use: 'Another app is using the camera. Close it and try again.',
  insecure_context: 'The camera needs a secure connection (https). Choose a photo from your library instead.',
  unknown: 'The camera could not be opened. Choose a photo from your library instead.',
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export async function openCamera(
  facingMode: 'environment' | 'user' = 'environment',
): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new CameraError('insecure_context', CAMERA_MESSAGES.insecure_context)
  }
  if (!cameraSupported()) {
    throw new CameraError('unavailable', CAMERA_MESSAGES.unavailable)
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    })
  } catch (error) {
    const name = (error as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', CAMERA_MESSAGES.denied)
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('unavailable', CAMERA_MESSAGES.unavailable)
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new CameraError('in_use', CAMERA_MESSAGES.in_use)
    }
    throw new CameraError('unknown', CAMERA_MESSAGES.unknown)
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * What the picker may hand us, and what storage will actually take. A phone
 * library holds HEIC, AVIF and the odd TIFF; the bucket holds three types. The
 * gap between the two lists is exactly what `prepareImage` exists to close, so
 * validation up front stays generous and the strict check happens after the
 * re-encode, on the bytes that are really uploaded.
 */
export const STORAGE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

export class ImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageError'
  }
}

/**
 * A library picker is allowed to be vague. Android content providers routinely
 * hand over an empty `type`, and a file that only *claims* to be an image is
 * caught by the decode a moment later — so anything that is not plainly a
 * non-image gets through to be decoded.
 */
export function validateImageFile(file: File): string | null {
  const type = (file.type || '').toLowerCase()
  if (type && !type.startsWith('image/')) return 'That file is not an image. Pick a photo.'
  if (!file.size) return 'That photo came through empty. Try picking it again.'
  if (file.size > MAX_SOURCE_BYTES) return 'That photo is enormous. Try a smaller one.'
  return null
}

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.82

interface Decoded {
  width: number
  height: number
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
  release: () => void
}

/**
 * Two ways in, because one is not enough: `createImageBitmap` is fast and
 * handles most things, and `<img>` decoding picks up what it refuses — on
 * Safari that includes the HEIC straight out of the photo library.
 */
async function decode(source: Blob): Promise<Decoded | null> {
  const bitmap = await createImageBitmap(source).catch(() => null)
  if (bitmap) {
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
      release: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('decode failed'))
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return null
    return {
      width,
      height,
      draw: (context, w, h) => context.drawImage(image, 0, 0, w, h),
      release: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * Re-encodes to a bounded JPEG. Drawing through a canvas also drops the
 * original EXIF block, so location and device metadata never leave the phone —
 * and it is what turns a library HEIC into something the bucket accepts.
 */
export async function prepareImage(source: Blob): Promise<{ blob: Blob; mimeType: string }> {
  const decoded = await decode(source)

  if (!decoded) {
    const type = (source.type || '').toLowerCase()
    // Nothing could read it. Passing the original through only works when it
    // is already a type storage takes; otherwise say so plainly rather than
    // failing later with a policy error nobody can act on.
    if ((STORAGE_IMAGE_TYPES as readonly string[]).includes(type) && source.size <= MAX_UPLOAD_BYTES) {
      return { blob: source, mimeType: type }
    }
    throw new ImageError(
      'This browser could not read that photo. Take it with the camera instead, or save it as a JPEG first.',
    )
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageError('This browser could not process that photo.')
    decoded.draw(context, width, height)

    let blob = await toBlob(canvas, JPEG_QUALITY)
    // A very busy 1280px photo can still land above the ceiling; one lower
    // quality pass brings it under without another resize.
    if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await toBlob(canvas, 0.6)
    if (!blob) throw new ImageError('This browser could not process that photo.')
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new ImageError('That photo is too large to send. Try one with less detail.')
    }
    return { blob, mimeType: 'image/jpeg' }
  } finally {
    decoded.release()
  }
}

/** Grabs a still from a live preview at the video's native resolution. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not read a frame from the camera.')
  context.drawImage(video, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Could not read a frame from the camera.')
  return blob
}
