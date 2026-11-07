// The service worker: offline cache (workbox) and the daily reminder.
// Typed by hand: the project compiles with the DOM library, which clashes with the worker one.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { pendingReminder, REMINDER_SYNC_TAG } from './lib/reminder'

interface WorkerEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}
interface WorkerClient {
  url: string
  focus(): Promise<unknown>
}
interface Worker {
  __WB_MANIFEST: (string | PrecacheEntry)[]
  registration: {
    scope: string
    showNotification(title: string, options: Record<string, unknown>): Promise<void>
    getNotifications(options: { tag: string }): Promise<{ close(): void }[]>
  }
  clients: {
    matchAll(options: { type: 'window' }): Promise<WorkerClient[]>
    openWindow(url: string): Promise<unknown>
  }
  addEventListener(type: string, listener: (event: never) => void): void
}
const worker = self as unknown as Worker

cleanupOutdatedCaches()
// The build replaces the literal `self.__WB_MANIFEST`: keep it spelled this way.
precacheAndRoute((self as unknown as Worker).__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Updates wait until the user accepts them (see the update prompt in the app).
worker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'SKIP_WAITING') (self as unknown as { skipWaiting(): void }).skipWaiting()
})

async function remind(): Promise<void> {
  const reminder = await pendingReminder()
  if (!reminder) return
  const icon = new URL('icons/icon-192.png', worker.registration.scope).href
  await worker.registration.showNotification(reminder.title, { body: reminder.body, tag: REMINDER_SYNC_TAG, icon, badge: icon })
}

worker.addEventListener('periodicsync', (event: WorkerEvent & { tag: string }) => {
  // Without the notification permission, showing fails: nothing else to do.
  if (event.tag === REMINDER_SYNC_TAG) event.waitUntil(remind().catch(() => undefined))
})

worker.addEventListener('notificationclick', (event: WorkerEvent & { notification: { close(): void } }) => {
  event.notification.close()
  event.waitUntil(
    worker.clients.matchAll({ type: 'window' }).then((open) => {
      const app = open.find((c) => c.url.startsWith(worker.registration.scope))
      return app ? app.focus() : worker.clients.openWindow(worker.registration.scope)
    }),
  )
})
