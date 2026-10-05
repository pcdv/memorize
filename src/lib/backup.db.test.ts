import { Rating, State } from 'ts-fsrs'
import { beforeEach, describe, expect, it } from 'vitest'
import { collectionBackup, importCollectionBackup, readBackup } from './backup'
import { db, DEFAULT_SETTINGS } from './db'
import { createCollection } from './importer'
import { parseCollection } from './parse'
import { gradeCard } from './scheduler'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

/** A collection with one reviewed card, exported and read back as a downloaded file would be. */
async function exportedCollection() {
  const id = await createCollection('indo', parseCollection('#lang: id : en\nmata : eye\ntubuh : body'), DEFAULT_SETTINGS)
  const card = (await db.cards.where({ collectionId: id }).first())!
  await gradeCard(card, Rating.Good)
  const backup = readBackup(JSON.stringify(await collectionBackup((await db.collections.get(id))!)))
  if (backup?.kind !== 'collection') throw new Error('not a collection backup')
  return { id, backup }
}

describe('collection backups', () => {
  it('restore the collection with its progress, next to the others', async () => {
    const { backup } = await exportedCollection()
    await createCollection('other', parseCollection('a : b'), DEFAULT_SETTINGS)
    await db.collections.where({ name: 'indo' }).delete()

    const restoredId = await importCollectionBackup(backup)
    const restored = (await db.collections.get(restoredId))!
    expect([restored.name, restored.leftLang, restored.rightLang]).toEqual(['indo', 'id', 'en'])

    const cards = await db.cards.where({ collectionId: restoredId }).toArray()
    expect(cards).toHaveLength(4)
    const reviewed = cards.filter((c) => c.state !== State.New)
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0]!.due).toBeInstanceOf(Date)
    const notes = new Set((await db.notes.where({ collectionId: restoredId }).toArray()).map((n) => n.id))
    expect(cards.every((c) => notes.has(c.noteId))).toBe(true)
    const reviews = await db.reviews.where({ collectionId: restoredId }).toArray()
    expect(reviews.map((r) => r.cardId)).toEqual([reviewed[0]!.id])

    expect(await db.collections.where({ name: 'other' }).count()).toBe(1)
  })

  it('replace an existing collection', async () => {
    const { id, backup } = await exportedCollection()
    const restoredId = await importCollectionBackup(backup, id)
    expect(await db.collections.get(id)).toBeUndefined()
    expect(await db.collections.count()).toBe(1)
    expect(await db.cards.count()).toBe(4)
    expect(await db.reviews.where({ collectionId: restoredId }).count()).toBe(1)
  })

  it('are told apart from other files', () => {
    expect(readBackup('mata : eye')).toBeNull()
    expect(readBackup('{"app":"other"}')).toBeNull()
  })
})
