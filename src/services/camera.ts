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

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'That file is not an image.'
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && file.type !== 'image/jpg') {
    return 'Use a JPEG, PNG or WebP photo.'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'That photo is larger than 6 MB. Try a smaller one.'
  return null
}

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.82

/**
 * Re-encodes to a bounded JPEG. Drawing through a canvas also drops the
 * original EXIF block, so location and device metadata never leave the phone.
 */
export async function prepareImage(source: Blob): Promise<{ blob: Blob; mimeType: string }> {
  const bitmap = await createImageBitmap(source).catch(() => null)
  if (!bitmap) return { blob: source, mimeType: source.type || 'image/jpeg' }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return { blob: source, mimeType: source.type || 'image/jpeg' }
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  return blob
    ? { blob, mimeType: 'image/jpeg' }
    : { blob: source, mimeType: source.type || 'image/jpeg' }
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
