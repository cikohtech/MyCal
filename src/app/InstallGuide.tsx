import type { ReactNode } from 'react'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/Button'
import { DownloadIcon, MoreIcon, PlusIcon, ShareIcon } from '@/components/Icons'
import { usePwaInstall } from '@/app/pwa-install'

type Platform = 'ios' | 'android' | 'desktop'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'iPhone or iPad',
  android: 'Android',
  desktop: 'this computer',
}

/** A glyph sitting in a line of text, so a step can point at the real button. */
function Glyph({ children }: { children: ReactNode }) {
  return <span className="inline-flex align-[-0.2em] text-[var(--color-ink)]">{children}</span>
}

interface Step {
  title: string
  detail: ReactNode
}

const STEPS: Record<Platform, Step[]> = {
  ios: [
    {
      title: 'Tap Share',
      detail: (
        <>
          The <Glyph><ShareIcon size={15} strokeWidth={1.9} /></Glyph> button in Safari’s toolbar.
          If you can’t see it, tap ••• first.
        </>
      ),
    },
    {
      title: 'Choose “Add to Home Screen”',
      detail: (
        <>
          Scroll the share menu to find it, beside <Glyph><PlusIcon size={15} strokeWidth={1.9} /></Glyph>.
        </>
      ),
    },
    {
      title: 'Tap Add',
      detail: 'MyCal lands on your home screen and opens like any other app.',
    },
  ],
  android: [
    {
      title: 'Open the browser menu',
      detail: (
        <>
          The <Glyph><MoreIcon size={15} /></Glyph> button at the top right of Chrome.
        </>
      ),
    },
    {
      title: 'Tap “Install app”',
      detail: 'Some browsers call it “Add to Home screen”.',
    },
    {
      title: 'Confirm with Install',
      detail: 'MyCal lands on your home screen and opens like any other app.',
    },
  ],
  desktop: [
    {
      title: 'Click the install icon in the address bar',
      detail: (
        <>
          The <Glyph><DownloadIcon size={15} strokeWidth={1.9} /></Glyph> at the right-hand end of
          the address bar in Chrome or Edge.
        </>
      ),
    },
    {
      title: 'Or use the browser menu',
      detail: (
        <>
          Open <Glyph><MoreIcon size={15} /></Glyph> and choose “Install MyCal”. In Safari on a Mac,
          it is File → Add to Dock.
        </>
      ),
    },
    {
      title: 'Click Install',
      detail: 'MyCal opens in its own window, like a native app.',
    },
  ],
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * How to put MyCal on the home screen. Where the browser can install in one
 * tap it offers that; everywhere else (iOS above all, where no page may ask)
 * it walks through the browser's own menu, step by step.
 */
export function InstallGuide({ open, onClose }: Props) {
  const { canInstall, install } = usePwaInstall()
  const platform = detectPlatform()

  async function handleInstall() {
    // A dismissed prompt clears the offer, and the steps take its place.
    if ((await install()) === 'accepted') onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Install MyCal"
      description={
        canInstall
          ? 'Add it to your home screen for one-tap access.'
          : `Three steps on ${PLATFORM_LABEL[platform]}, then it opens like any other app.`
      }
    >
      {canInstall ? (
        <div className="flex flex-col gap-2.5 pt-1">
          <Button
            variant="primary" size="lg" full data-autofocus
            icon={<DownloadIcon size={20} strokeWidth={2} />}
            onClick={handleInstall}
          >
            Install now
          </Button>
          <p className="text-center text-[0.78rem] text-[var(--color-ink-3)]">
            No app store, and nothing to update by hand.
          </p>
        </div>
      ) : (
        <ol className="list-group">
          {STEPS[platform].map((step, index) => (
            <li key={step.title} className="list-row items-start">
              <span className="tnum grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[var(--color-tint-wash)] text-[0.82rem] font-semibold text-[var(--color-tint-ink)]">
                {index + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[0.95rem] font-medium leading-snug">{step.title}</p>
                <p className="mt-1 text-[0.83rem] leading-snug text-[var(--color-ink-2)]">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}
