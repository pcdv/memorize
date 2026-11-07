import { makeTranslate, resolveLang } from '../i18n'
import { db, loadSettings, type MemorizeDb } from './db'
import { dirsFor, endOfDay } from './scheduler'
import { State } from 'ts-fsrs'

/** Reminders are shown from this hour (included) until this one (excluded), local time. */
export const REMINDER_FROM_HOUR = 8
export const REMINDER_TO_HOUR = 22

export const REMINDER_SYNC_TAG = 'due-reminder'

export function inReminderHours(now: Date): boolean {
  return now.getHours() >= REMINDER_FROM_HOUR && now.getHours() < REMINDER_TO_HOUR
}

/** The local day as `YYYY-MM-DD`. */
export function dayKey(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export interface ReminderText {
  title: string
  body: string
}

/**
 * The notification to show now, or null: outside the reminder hours, already shown today,
 * or no collection with a reminder has cards due. Marks today as reminded when it returns one.
 */
export async function pendingReminder(now = new Date(), database: MemorizeDb = db): Promise<ReminderText | null> {
  if (!inReminderHours(now)) return null
  const settings = await loadSettings(database)
  const today = dayKey(now)
  if (settings.lastReminderDay === today) return null

  const horizon = endOfDay(now)
  const lines: { name: string; due: number }[] = []
  for (const collection of await database.collections.toArray()) {
    if (collection.reminder !== 'due') continue
    const dirs = new Set(dirsFor(collection))
    const due = await database.cards
      .where('collectionId')
      .equals(collection.id)
      .filter((c) => dirs.has(c.dir) && c.state !== State.New && c.due <= horizon)
      .count()
    if (due > 0) lines.push({ name: collection.name, due })
  }
  if (lines.length === 0) return null

  await database.settings.put({ ...settings, lastReminderDay: today })
  const t = makeTranslate(resolveLang(settings.uiLang))
  return {
    title: t('reminderTitle'),
    body: lines.map((l) => t('reminderLine', { name: l.name, n: l.due })).join('\n'),
  }
}

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> }
}

/** Only Chromium browsers on Android offer periodic background sync, to installed apps. */
export function remindersSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype
}

/** Asks for the notification permission and asks the browser to wake the app about twice a day. */
export async function enableReminders(): Promise<'ok' | 'unsupported' | 'denied' | 'failed'> {
  if (!remindersSupported()) return 'unsupported'
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  try {
    const registration = (await navigator.serviceWorker.ready) as PeriodicSyncRegistration
    await registration.periodicSync?.register(REMINDER_SYNC_TAG, { minInterval: 12 * 3600 * 1000 })
    return 'ok'
  } catch {
    // Chrome refuses it when the app is not installed.
    return 'failed'
  }
}
