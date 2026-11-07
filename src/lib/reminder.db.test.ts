import { State } from 'ts-fsrs'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, DEFAULT_SETTINGS, type Reminder } from './db'
import { createCollection } from './importer'
import { parseCollection } from './parse'
import { dayKey, inReminderHours, pendingReminder } from './reminder'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.settings.put({ ...DEFAULT_SETTINGS, uiLang: 'en' })
})

const at = (iso: string) => new Date(iso)

/** A collection of two cards, one direction each, both due yesterday when `due` is set. */
async function collection(name: string, reminder: Reminder | undefined, due: boolean): Promise<number> {
  const id = await createCollection(name, parseCollection('a : b\nc : d'), { ...DEFAULT_SETTINGS, defaultDirection: 'forward' })
  await db.collections.update(id, { reminder })
  if (due) await db.cards.where({ collectionId: id }).modify({ state: State.Review, due: at('2026-11-06T12:00:00') })
  return id
}

describe('reminder hours', () => {
  it('runs from 8:00 up to, but not including, 22:00', () => {
    expect(inReminderHours(at('2026-11-07T07:59:00'))).toBe(false)
    expect(inReminderHours(at('2026-11-07T08:00:00'))).toBe(true)
    expect(inReminderHours(at('2026-11-07T21:59:00'))).toBe(true)
    expect(inReminderHours(at('2026-11-07T22:00:00'))).toBe(false)
  })

  it('names the local day', () => {
    expect(dayKey(at('2026-03-05T23:30:00'))).toBe('2026-03-05')
  })
})

describe('pendingReminder', () => {
  it('lists the collections with a reminder and cards due, once a day', async () => {
    await collection('indo', 'due', true)
    await collection('quiet', 'never', true)
    await collection('later', 'due', false)

    const reminder = await pendingReminder(at('2026-11-07T09:00:00'))
    expect(reminder?.body).toBe('indo: 2 cards due')
    expect(await pendingReminder(at('2026-11-07T18:00:00'))).toBeNull()
    expect(await pendingReminder(at('2026-11-08T09:00:00'))).not.toBeNull()
  })

  it('waits for the reminder hours without using up the day', async () => {
    await collection('indo', 'due', true)
    expect(await pendingReminder(at('2026-11-07T06:00:00'))).toBeNull()
    expect(await pendingReminder(at('2026-11-07T23:00:00'))).toBeNull()
    expect(await pendingReminder(at('2026-11-07T10:00:00'))).not.toBeNull()
  })

  it('shows nothing when no card is due, and tries again later in the day', async () => {
    const id = await collection('indo', 'due', false)
    expect(await pendingReminder(at('2026-11-07T09:00:00'))).toBeNull()
    await db.cards.where({ collectionId: id }).modify({ state: State.Review, due: at('2026-11-07T12:00:00') })
    expect(await pendingReminder(at('2026-11-07T15:00:00'))).not.toBeNull()
  })
})
