import { db, type Collection, type Note, type Review, type StoredCard } from './db'
import { startOfDay } from './scheduler'

export interface CollectionData {
  collection: Collection
  notes: Map<number, Note>
  noteOrder: Map<number, number>
  cards: StoredCard[]
  reviewsToday: Review[]
}

/** Everything needed to build a collection's queue or stats (collections are small). */
export async function loadCollectionData(id: number): Promise<CollectionData | null> {
  const collection = await db.collections.get(id)
  if (!collection) return null
  const [notes, cards, reviewsToday] = await Promise.all([
    db.notes.where('collectionId').equals(id).toArray(),
    db.cards.where('collectionId').equals(id).toArray(),
    db.reviews
      .where('collectionId')
      .equals(id)
      .filter((r) => r.ts >= startOfDay(new Date()).getTime())
      .toArray(),
  ])
  return {
    collection,
    notes: new Map(notes.map((n) => [n.id, n])),
    noteOrder: new Map(notes.map((n) => [n.id, n.order])),
    cards,
    reviewsToday,
  }
}
