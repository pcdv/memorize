import { Rating, State } from 'ts-fsrs'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, DEFAULT_SETTINGS } from './db'
import { applyMerge, createCollection, planMerge } from './importer'
import { parseCollection } from './parse'
import { gradeCard } from './scheduler'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('re-importing a collection', () => {
  it('keeps the progress of kept and edited cards', async () => {
    const id = await createCollection('animals', parseCollection('#lang: fr : en\nchat : cat\nchien : dog\noiseau : bird'), DEFAULT_SETTINGS)
    const collection = (await db.collections.get(id))!
    expect(collection.leftLang).toBe('fr')
    expect(await db.cards.count()).toBe(6)

    const notes = await db.notes.where('collectionId').equals(id).toArray()
    const chien = notes.find((n) => n.left === 'chien')!
    const chienCard = (await db.cards.where('noteId').equals(chien.id).first())!
    await gradeCard(chienCard, Rating.Good)

    const parsed = parseCollection('chien : hound\nchat : cat\ncheval : horse')
    const plan = planMerge(notes, parsed.pairs)
    await applyMerge(collection, plan, parsed)

    const after = await db.notes.where('collectionId').equals(id).sortBy('order')
    expect(after.map((n) => `${n.left}:${n.right}`)).toEqual(['chien:hound', 'chat:cat', 'cheval:horse'])
    expect((await db.cards.get(chienCard.id))!.state).not.toBe(State.New)
    expect(await db.cards.count()).toBe(6)
    expect(await db.reviews.count()).toBe(1)
  })
})
