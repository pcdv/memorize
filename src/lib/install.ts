import { useSyncExternalStore } from 'react'

/** Chromium's install prompt event (Chrome, Edge, Samsung Internet); not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Registered on import, from main.tsx, as the event can fire before React renders.
window.addEventListener('beforeinstallprompt', (e) => {
  // Our own button replaces the browser's mini info bar.
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the browser offers to install the app now, and how to ask it. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const event = useSyncExternalStore(subscribe, () => deferred)
  return {
    canInstall: event !== null,
    install: async () => {
      if (!event) return
      await event.prompt()
      // A prompt can only be used once; the browser sends a new event if needed.
      await event.userChoice
      deferred = null
      notify()
    },
  }
}

/** Running as an installed app rather than in a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Browsers without an install prompt, for which the app explains the menu steps. */
export function installPlatform(): 'firefox-android' | 'ios' | 'other' {
  const ua = navigator.userAgent
  if (/Android/i.test(ua) && /Firefox/i.test(ua)) return 'firefox-android'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return 'other'
}
