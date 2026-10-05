import { describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import type { Collection, StoredCard } from './db'
import { buildQueue, emptyCard, formatInterval, previewIntervals } from './scheduler'

const now = new Date('2026-10-05T10:00:00')
const collection: Collection = { id: 1, name: 'c', createdAt: 0, direction: 'both', newPerDay: 2 }

let nextId = 1
function card(noteId: number, dir: 'forward' | 'reverse', review?: { dueInDays: number }): StoredCard {
  const base = { ...emptyCard(now), id: nextId++, noteId, collectionId: 1, dir }
  if (!review) return base
  return { ...base, state: State.Review, due: new Date(now.getTime() + review.dueInDays * 86_400_000), reps: 3 }
}
const order = new Map([1, 2, 3, 4, 5].map((n) => [n, n]))

describe('buildQueue', () => {
  it('takes due cards first, oldest first, and skips future ones', () => {
    const cards = [card(1, 'forward', { dueInDays: -1 }), card(2, 'forward', { dueInDays: -3 }), card(3, 'forward', { dueInDays: 2 })]
    const queue = buildQueue({ ...collection, newPerDay: 0 }, cards, [], order, now)
    expect(queue.map((c) => c.noteId)).toEqual([2, 1])
  })

  it('limits new cards per day, counting those already introduced today', () => {
    const cards = [1, 2, 3, 4].map((n) => card(n, 'forward'))
    expect(buildQueue(collection, cards, [], order, now)).toHaveLength(2)
    expect(buildQueue(collection, cards, [{ wasNew: true }], order, now)).toHaveLength(1)
    expect(buildQueue(collection, cards, [{ wasNew: false }], order, now)).toHaveLength(2)
  })

  it('introduces new cards in file order and one direction per note', () => {
    const cards = [card(2, 'forward'), card(1, 'reverse'), card(1, 'forward'), card(2, 'reverse')]
    const queue = buildQueue({ ...collection, newPerDay: 10 }, cards, [], order, now)
    expect(queue.map((c) => [c.noteId, c.dir])).toEqual([
      [1, 'forward'],
      [2, 'forward'],
    ])
  })

  it('only uses the cards of the chosen direction', () => {
    const cards = [card(1, 'forward', { dueInDays: -1 }), card(1, 'reverse', { dueInDays: -1 })]
    const queue = buildQueue({ ...collection, direction: 'reverse' }, cards, [], order, now)
    expect(queue.map((c) => c.dir)).toEqual(['reverse'])
  })

  it('can practice one direction now, starting with words known the other way', () => {
    const cards = [
      card(1, 'forward', { dueInDays: 1 }),
      card(1, 'reverse'),
      card(2, 'forward'),
      card(2, 'reverse'),
      card(3, 'forward', { dueInDays: 2 }),
      card(3, 'reverse'),
    ]
    const today = [{ wasNew: true }, { wasNew: true }]
    // The daily limit is used up and forward cards are not due: nothing left today.
    expect(buildQueue(collection, cards, today, order, now)).toEqual([])
    const practice = buildQueue(collection, cards, today, order, now, { dir: 'reverse', extra: true })
    expect(practice.map((c) => [c.noteId, c.dir])).toEqual([
      [1, 'reverse'],
      [3, 'reverse'],
    ])
  })

  it('learns an extra batch of new cards beyond the daily limit', () => {
    const cards = [1, 2, 3, 4].map((n) => card(n, 'forward'))
    const today = [{ wasNew: true }, { wasNew: true }]
    expect(buildQueue(collection, cards, today, order, now)).toEqual([])
    expect(buildQueue(collection, cards, today, order, now, { extra: true })).toHaveLength(2)
  })

  it('can introduce new cards in a random order, fixed for the day', () => {
    const notes = Array.from({ length: 40 }, (_, i) => i + 1)
    const cards = notes.map((n) => card(n, 'forward'))
    const fileOrder = new Map(notes.map((n) => [n, n]))
    const random = { ...collection, newPerDay: 10, newOrder: 'random' as const }
    const pick = (at: Date) => buildQueue(random, cards, [], fileOrder, at).map((c) => c.noteId)

    const morning = pick(new Date('2026-10-05T08:00:00'))
    expect(morning).toHaveLength(10)
    expect(morning).not.toEqual(notes.slice(0, 10))
    expect(pick(new Date('2026-10-05T21:00:00'))).toEqual(morning)
    expect(pick(new Date('2026-10-06T08:00:00'))).not.toEqual(morning)
  })

  it('keeps words known the other way first in random order', () => {
    const cards = [card(1, 'forward', { dueInDays: 3 }), card(1, 'reverse'), ...[2, 3, 4, 5].map((n) => card(n, 'reverse'))]
    const random = { ...collection, direction: 'reverse' as const, newPerDay: 2, newOrder: 'random' as const }
    expect(buildQueue(random, cards, [], order, now)[0]!.noteId).toBe(1)
  })

  it('spreads new cards among reviews', () => {
    const cards = [1, 2, 3, 4].map((n) => card(n, 'forward', { dueInDays: -1 })).concat([card(5, 'forward')])
    const queue = buildQueue(collection, cards, [], order, now)
    expect(queue).toHaveLength(5)
    expect(queue.at(-1)!.state).not.toBe(State.New)
  })
})

describe('intervals', () => {
  it('formats durations', () => {
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
    expect(formatInterval(now, at(10))).toBe('10m')
    expect(formatInterval(now, at(180))).toBe('3h')
    expect(formatInterval(now, at(4 * 1440))).toBe('4d')
    expect(formatInterval(now, at(60 * 1440))).toBe('2mo')
    expect(formatInterval(now, at(548 * 1440))).toBe('1.5y')
  })

  it('gives longer intervals to easier grades', () => {
    const preview = previewIntervals(card(1, 'forward'), undefined, now)
    expect(preview[Rating.Again]).toMatch(/m$/)
    expect(preview[Rating.Easy]).toMatch(/d$/)
  })
})
