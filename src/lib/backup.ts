import type { Translate } from '../i18n'
import { db, deleteCollection, type Collection, type Note, type Review, type Settings, type StoredCard } from './db'
import { formatCollection } from './parse'

/** Everything: all collections, their progress and the settings. */
interface FullBackup {
  app: 'memorize'
  version: 1
  /** Absent in the first backups, which were all full ones. */
  kind?: 'full'
  exportedAt: string
  collections: Collection[]
  notes: Note[]
  cards: StoredCard[]
  reviews: Review[]
  settings: Settings[]
}

/** One collection with its progress. */
export interface CollectionBackup {
  app: 'memorize'
  version: 1
  kind: 'collection'
  exportedAt: string
  collection: Collection
  notes: Note[]
  cards: StoredCard[]
  reviews: Review[]
}

export type Backup = FullBackup | CollectionBackup

export async function exportBackup(): Promise<Blob> {
  const backup: FullBackup = {
    app: 'memorize',
    version: 1,
    kind: 'full',
    exportedAt: new Date().toISOString(),
    collections: await db.collections.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    reviews: await db.reviews.toArray(),
    settings: await db.settings.toArray(),
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function collectionBackup(collection: Collection): Promise<CollectionBackup> {
  const byCollection = { collectionId: collection.id }
  return {
    app: 'memorize',
    version: 1,
    kind: 'collection',
    exportedAt: new Date().toISOString(),
    collection,
    notes: await db.notes.where(byCollection).toArray(),
    cards: await db.cards.where(byCollection).toArray(),
    reviews: await db.reviews.where(byCollection).toArray(),
  }
}

export async function exportCollectionBackup(collection: Collection): Promise<Blob> {
  return new Blob([JSON.stringify(await collectionBackup(collection))], { type: 'application/json' })
}

/** The backup in a file's text, or null when it is not a Memorize backup. */
export function readBackup(text: string): Backup | null {
  try {
    const backup = JSON.parse(text) as Backup
    return backup?.app === 'memorize' && backup.version === 1 ? backup : null
  } catch {
    return null
  }
}

// JSON turned the card dates into strings.
const reviveCard = (c: StoredCard): StoredCard => ({
  ...c,
  due: new Date(c.due),
  last_review: c.last_review ? new Date(c.last_review) : undefined,
})

/** Replaces all data with the content of a full backup. */
export async function importBackup(backup: FullBackup): Promise<void> {
  await db.transaction('rw', [db.collections, db.notes, db.cards, db.reviews, db.settings], async () => {
    await Promise.all([db.collections.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.settings.clear()])
    await db.collections.bulkAdd(backup.collections)
    await db.notes.bulkAdd(backup.notes)
    await db.cards.bulkAdd(backup.cards.map(reviveCard))
    await db.reviews.bulkAdd(backup.reviews)
    await db.settings.bulkAdd(backup.settings)
  })
}

/**
 * Adds the collection of a backup, with new ids so it cannot clash with existing data,
 * replacing the collection `replaceId` if given. Returns the new collection's id.
 */
export async function importCollectionBackup(backup: CollectionBackup, replaceId?: number): Promise<number> {
  return db.transaction('rw', [db.collections, db.notes, db.cards, db.reviews], async () => {
    if (replaceId !== undefined) await deleteCollection(replaceId)
    const { id: _, ...collection } = backup.collection
    const collectionId = await db.collections.add(collection)

    const noteIds = new Map<number, number>()
    for (const { id, ...note } of backup.notes) noteIds.set(id, await db.notes.add({ ...note, collectionId }))

    const cardIds = new Map<number, number>()
    for (const { id, ...card } of backup.cards.map(reviveCard)) {
      const noteId = noteIds.get(card.noteId)
      if (noteId !== undefined) cardIds.set(id, await db.cards.add({ ...card, noteId, collectionId }))
    }

    await db.reviews.bulkAdd(
      backup.reviews.flatMap(({ id: _, ...review }) => {
        const cardId = cardIds.get(review.cardId)
        return cardId === undefined ? [] : [{ ...review, cardId, collectionId }]
      }),
    )
    return collectionId
  })
}

/**
 * Restores a backup file after asking the user to confirm what it replaces.
 * Returns the restored collection's id for a collection backup, null if nothing changed.
 */
export async function restoreBackup(backup: Backup, t: Translate): Promise<number | 'all' | null> {
  if (backup.kind === 'collection') {
    const name = backup.collection.name
    const existing = await db.collections.where({ name }).first()
    if (existing && !confirm(t('replaceCollectionConfirm', { name }))) return null
    return importCollectionBackup(backup, existing?.id)
  }
  if (!confirm(t('restoreConfirm'))) return null
  await importBackup(backup)
  return 'all'
}

/** The collection as an editable `left : right` text file. */
export async function exportCollectionText(collection: Collection): Promise<Blob> {
  const notes = await db.notes.where('collectionId').equals(collection.id).sortBy('order')
  return new Blob([formatCollection(notes, collection.leftLang, collection.rightLang)], { type: 'text/plain' })
}

export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
