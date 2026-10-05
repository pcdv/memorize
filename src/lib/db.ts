import { Dexie, type EntityTable } from 'dexie'
import type { Card as FsrsCard } from 'ts-fsrs'

/** Which side is asked: `forward` asks the left side and expects the right one. */
export type CardDir = 'forward' | 'reverse'
export type Direction = CardDir | 'both'
export type AnswerMode = 'reveal' | 'type'
export type UiLang = 'auto' | 'en' | 'fr'

export interface Collection {
  id: number
  name: string
  createdAt: number
  direction: Direction
  newPerDay: number
  leftLang?: string
  rightLang?: string
}

export interface Note {
  id: number
  collectionId: number
  /** Position in the source file, so new cards are introduced in file order. */
  order: number
  left: string
  right: string
}

export interface StoredCard extends FsrsCard {
  id: number
  noteId: number
  collectionId: number
  dir: CardDir
}

export interface Review {
  id: number
  cardId: number
  collectionId: number
  ts: number
  rating: number
  /** The card was new before this review: counts against the daily new-card limit. */
  wasNew: boolean
}

export interface Settings {
  key: 'app'
  uiLang: UiLang
  answerMode: AnswerMode
  defaultDirection: Direction
  defaultNewPerDay: number
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  uiLang: 'auto',
  answerMode: 'reveal',
  defaultDirection: 'both',
  defaultNewPerDay: 20,
}

export class MemorizeDb extends Dexie {
  collections!: EntityTable<Collection, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<StoredCard, 'id'>
  reviews!: EntityTable<Review, 'id'>
  settings!: EntityTable<Settings, 'key'>

  constructor(name = 'memorize') {
    super(name)
    this.version(1).stores({
      collections: '++id, name',
      notes: '++id, collectionId',
      cards: '++id, collectionId, noteId',
      reviews: '++id, collectionId, cardId, ts',
      settings: 'key',
    })
  }
}

export const db = new MemorizeDb()

export async function loadSettings(database: MemorizeDb = db): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await database.settings.get('app')) }
}

export async function saveSettings(patch: Partial<Omit<Settings, 'key'>>): Promise<void> {
  const current = await loadSettings()
  await db.settings.put({ ...current, ...patch })
}

export async function deleteCollection(id: number): Promise<void> {
  await db.transaction('rw', [db.collections, db.notes, db.cards, db.reviews], async () => {
    await db.reviews.where('collectionId').equals(id).delete()
    await db.cards.where('collectionId').equals(id).delete()
    await db.notes.where('collectionId').equals(id).delete()
    await db.collections.delete(id)
  })
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {})
}
