import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { db, type CardDir, type Collection, type Review, type StoredCard } from './db'

const engine = fsrs({ enable_fuzz: true })

export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

export function emptyCard(now = new Date()): FsrsCard {
  return createEmptyCard(now)
}

export function startOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}

export function dirsFor(collection: Pick<Collection, 'direction'>): CardDir[] {
  return collection.direction === 'both' ? ['forward', 'reverse'] : [collection.direction]
}

export interface QueueStats {
  due: number
  newAvailable: number
  total: number
}

/** Extra study beyond the regular daily queue. */
export interface QueueOptions {
  /** Only this direction, whatever the collection's setting. */
  dir?: CardDir
  /** A new batch of new cards, ignoring how many were introduced today. */
  extra?: boolean
}

/**
 * Today's study queue: due cards (most overdue first), then new cards up to what is left
 * of the daily new-card limit. New cards whose other direction is already known come
 * first, then file order. New cards are spread among the reviews, and only one direction
 * of a given note is shown per session.
 */
export function buildQueue(
  collection: Collection,
  cards: StoredCard[],
  reviewsToday: Pick<Review, 'wasNew'>[],
  noteOrder: Map<number, number>,
  now = new Date(),
  options: QueueOptions = {},
): StoredCard[] {
  const dirs = new Set(options.dir ? [options.dir] : dirsFor(collection))
  const active = cards.filter((c) => dirs.has(c.dir))
  const horizon = endOfDay(now)

  const due = active
    .filter((c) => c.state !== State.New && c.due <= horizon)
    .sort((a, b) => a.due.getTime() - b.due.getTime())

  const seenNotes = new Set(due.map((c) => c.noteId))
  const newLeft = options.extra
    ? collection.newPerDay || 10
    : Math.max(0, collection.newPerDay - reviewsToday.filter((r) => r.wasNew).length)
  const known = new Set(cards.filter((c) => c.state !== State.New).map((c) => c.noteId))
  const rank = (c: StoredCard) => (known.has(c.noteId) ? 0 : 1)
  const fresh: StoredCard[] = []
  const candidates = active
    .filter((c) => c.state === State.New)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (noteOrder.get(a.noteId) ?? 0) - (noteOrder.get(b.noteId) ?? 0) ||
        a.dir.localeCompare(b.dir),
    )
  for (const c of candidates) {
    if (fresh.length >= newLeft) break
    if (seenNotes.has(c.noteId)) continue
    seenNotes.add(c.noteId)
    fresh.push(c)
  }

  // Spread the new cards evenly among the reviews.
  const queue: StoredCard[] = []
  let n = 0
  due.forEach((c, i) => {
    queue.push(c)
    while (n < fresh.length && ((n + 1) * due.length) / (fresh.length + 1) <= i + 1) queue.push(fresh[n++]!)
  })
  return queue.concat(fresh.slice(n))
}

export function queueStats(
  collection: Collection,
  cards: StoredCard[],
  reviewsToday: Pick<Review, 'wasNew'>[],
  noteOrder: Map<number, number>,
  now = new Date(),
): QueueStats {
  const queue = buildQueue(collection, cards, reviewsToday, noteOrder, now)
  const dirs = new Set(dirsFor(collection))
  return {
    due: queue.filter((c) => c.state !== State.New).length,
    newAvailable: queue.filter((c) => c.state === State.New).length,
    total: cards.filter((c) => dirs.has(c.dir)).length,
  }
}

/** Suffixes for minutes, hours, days, months and years. */
export type IntervalUnits = readonly [string, string, string, string, string]

/** Short human interval until `due`: 1m, 10m, 3h, 4d, 2mo, 1.5y. */
export function formatInterval(from: Date, due: Date, units: IntervalUnits = ['m', 'h', 'd', 'mo', 'y']): string {
  const [m, h, d, mo, y] = units
  const minutes = Math.max(1, Math.round((due.getTime() - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes}${m}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}${h}`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}${d}`
  const months = days / 30.4
  if (months < 12) return `${Math.round(months)}${mo}`
  return `${Math.round((days / 365) * 10) / 10}${y}`
}

/** The interval each grade would give, for the labels on the grade buttons. */
export function previewIntervals(card: StoredCard, units?: IntervalUnits, now = new Date()): Record<Grade, string> {
  const preview = engine.repeat(card, now)
  return Object.fromEntries(GRADES.map((g) => [g, formatInterval(now, preview[g].card.due, units)])) as Record<Grade, string>
}

/** Applies a grade, persists the card and the review, and returns the updated card. */
export async function gradeCard(card: StoredCard, grade: Grade, now = new Date()): Promise<StoredCard> {
  const { card: next } = engine.next(card, now, grade)
  const updated: StoredCard = { ...card, ...next }
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    await db.cards.put(updated)
    await db.reviews.add({
      cardId: card.id,
      collectionId: card.collectionId,
      ts: now.getTime(),
      rating: grade,
      wasNew: card.state === State.New,
    })
  })
  return updated
}

export async function resetCollectionProgress(collectionId: number): Promise<void> {
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    const now = new Date()
    await db.cards
      .where('collectionId')
      .equals(collectionId)
      .modify((c) => {
        Object.assign(c, emptyCard(now))
        delete c.last_review
      })
    await db.reviews.where('collectionId').equals(collectionId).delete()
  })
}
