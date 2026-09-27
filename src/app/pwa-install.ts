import { useSyncExternalStore } from 'react'

/** Chromium's install offer. It is not in the DOM typings because only Chromium sends it. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
  interface Navigator {
    /** iOS Safari's non-standard flag for a launch from the home screen. */
    standalone?: boolean
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * The browser makes its install offer once, early, usually before the front
 * door has mounted. `listenForInstallPrompt` runs from `main.tsx` before React
 * renders, so the offer is held here until someone taps Install.
 */
let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Hold the offer for our own button instead of the browser's mini-infobar.
    event.preventDefault()
    deferred = event
    notify()
  })

  // Fires however the install happened, including from the browser's own menu.
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

async function install(): Promise<InstallOutcome> {
  const offer = deferred
  if (!offer) return 'unavailable'

  // Each offer can be shown only once. If it is dismissed, Chromium sends a
  // fresh one later and the listener above picks it up.
  deferred = null
  notify()

  try {
    await offer.prompt()
    const { outcome } = await offer.userChoice
    if (outcome === 'accepted') {
      installed = true
      notify()
    }
    return outcome
  } catch {
    return 'unavailable'
  }
}

export function usePwaInstall() {
  const offerReady = useSyncExternalStore(subscribe, () => deferred !== null)
  const isInstalled = useSyncExternalStore(subscribe, () => installed || isStandalone())

  return {
    /** The browser can install in one tap (Chromium on Android and desktop). */
    canInstall: offerReady && !isInstalled,
    /** Already running from the home screen, or installed during this visit. */
    isInstalled,
    /** Shows the browser's own install prompt. */
    install,
  }
}
