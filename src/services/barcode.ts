/**
 * On-device barcode decoding. Frames never leave the browser — only the
 * resulting digits are sent anywhere. Uses the platform `BarcodeDetector`
 * where it exists and falls back to ZXing everywhere else (notably Safari).
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'] as const

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options: { formats: readonly string[] }) => BarcodeDetectorLike

function nativeDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

export function barcodeSupport(): 'native' | 'fallback' {
  return nativeDetector() ? 'native' : 'fallback'
}

/**
 * A single read is not enough — a misread digit silently logs the wrong food.
 * A code is only accepted once the same value comes back `STABLE_READS` times.
 */
const STABLE_READS = 2

export interface ScannerHandle {
  stop(): void
}

export function startScanning(
  video: HTMLVideoElement,
  onResult: (code: string) => void,
  onError?: (message: string) => void,
): ScannerHandle {
  let stopped = false
  let lastValue: string | null = null
  let streak = 0

  const accept = (raw: string) => {
    const code = raw.replace(/\D/g, '')
    if (code.length < 8) return
    if (code === lastValue) {
      streak += 1
    } else {
      lastValue = code
      streak = 1
    }
    if (streak >= STABLE_READS) {
      stopped = true
      onResult(code)
    }
  }

  const Native = nativeDetector()

  if (Native) {
    const detector = new Native({ formats: FORMATS })
    const tick = async () => {
      if (stopped) return
      if (video.readyState >= 2) {
        try {
          const found = await detector.detect(video)
          if (found[0]?.rawValue) accept(found[0].rawValue)
        } catch {
          /* a dropped frame is not worth surfacing */
        }
      }
      if (!stopped) requestAnimationFrame(() => void tick())
    }
    void tick()
    return { stop() { stopped = true } }
  }

  // ZXing is ~700 kB, so it is fetched only on the browsers that need it.
  let stopFallback: (() => void) | null = null

  void (async () => {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ])
    if (stopped) return

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.ITF,
    ])

    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 180 })
    try {
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result && !stopped) accept(result.getText())
      })
      stopFallback = () => controls.stop()
      if (stopped) controls.stop()
    } catch {
      onError?.('The barcode reader could not start. Enter the number by hand.')
    }
  })()

  return {
    stop() {
      stopped = true
      stopFallback?.()
    },
  }
}

/** EAN/UPC check digit. Catches a mistyped hand-entered code before lookup. */
export function isPlausibleBarcode(code: string): boolean {
  const digits = code.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return false
  const values = digits.split('').map(Number)
  const check = values.pop()!
  const sum = values
    .reverse()
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}
