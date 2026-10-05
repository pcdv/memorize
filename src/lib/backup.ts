import { db, type Collection, type Note, type Review, type Settings, type StoredCard } from './db'
import { formatCollection } from './parse'

interface Backup {
  app: 'memorize'
  version: 1
  exportedAt: string
  collections: Collection[]
  notes: Note[]
  cards: StoredCard[]
  reviews: Review[]
  settings: Settings[]
}

export async function exportBackup(): Promise<Blob> {
  const backup: Backup = {
    app: 'memorize',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: await db.collections.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    reviews: await db.reviews.toArray(),
    settings: await db.settings.toArray(),
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

/** Replaces all data with the content of a backup file. */
export async function importBackup(text: string): Promise<void> {
  const backup = JSON.parse(text) as Backup
  if (backup.app !== 'memorize' || backup.version !== 1) throw new Error('Not a Memorize backup')
  // JSON turned the card dates into strings.
  const cards = backup.cards.map((c) => ({
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  }))
  await db.transaction('rw', [db.collections, db.notes, db.cards, db.reviews, db.settings], async () => {
    await Promise.all([db.collections.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.settings.clear()])
    await db.collections.bulkAdd(backup.collections)
    await db.notes.bulkAdd(backup.notes)
    await db.cards.bulkAdd(cards)
    await db.reviews.bulkAdd(backup.reviews)
    await db.settings.bulkAdd(backup.settings)
  })
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
