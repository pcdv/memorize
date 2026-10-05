import { normalize } from './answer'
import { db, type CardDir, type Collection, type Note, type Settings, type StoredCard } from './db'
import type { ParsedPair, ParseResult } from './parse'
import { emptyCard } from './scheduler'

export interface MergePlan {
  added: ParsedPair[]
  /** Existing notes whose text changed; they keep their review history. */
  changed: { note: Note; pair: ParsedPair }[]
  removed: Note[]
  /** Existing notes found unchanged, with their new position in the file. */
  unchanged: { note: Note; pair: ParsedPair }[]
}

const keyOf = (s: string) => normalize(s)

/** Drops lines that repeat an earlier pair (same normalized left and right). */
export function dedupe(pairs: ParsedPair[]): ParsedPair[] {
  const seen = new Set<string>()
  return pairs.filter((p) => {
    const k = `${keyOf(p.left)}\u0000${keyOf(p.right)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface Duplicates {
  /** Lines repeating an earlier pair; they are dropped on import. */
  repeated: { pair: ParsedPair; firstLine: number }[]
  /** Questions found on several lines with different answers; each line becomes a card. */
  sameLeft: ParsedPair[][]
}

/** Probable mistakes in a file, reported so they can be fixed at the source. */
export function findDuplicates(pairs: ParsedPair[]): Duplicates {
  const firstLine = new Map<string, number>()
  const byLeft = new Map<string, ParsedPair[]>()
  const repeated: Duplicates['repeated'] = []
  for (const p of pairs) {
    const k = `${keyOf(p.left)}\u0000${keyOf(p.right)}`
    const first = firstLine.get(k)
    if (first !== undefined) {
      repeated.push({ pair: p, firstLine: first })
      continue
    }
    firstLine.set(k, p.line)
    byLeft.set(keyOf(p.left), [...(byLeft.get(keyOf(p.left)) ?? []), p])
  }
  return { repeated, sameLeft: [...byLeft.values()].filter((group) => group.length > 1) }
}

/**
 * Matches the lines of a new version of a file against the existing notes:
 * same pair first, then same left side (answer edited), then same right side
 * (question edited). Whatever is left is added or removed.
 */
export function planMerge(existing: Note[], incoming: ParsedPair[]): MergePlan {
  const plan: MergePlan = { added: [], changed: [], removed: [], unchanged: [] }
  let pending = dedupe(incoming)
  const available = new Set(existing)

  const matchBy = (key: (x: { left: string; right: string }) => string, exact: boolean) => {
    const index = new Map<string, Note[]>()
    for (const n of available) {
      const k = key(n)
      index.set(k, [...(index.get(k) ?? []), n])
    }
    pending = pending.filter((pair) => {
      const note = index.get(key(pair))?.shift()
      if (!note) return true
      available.delete(note)
      ;(exact && note.left === pair.left && note.right === pair.right ? plan.unchanged : plan.changed).push({ note, pair })
      return false
    })
  }

  matchBy((x) => `${keyOf(x.left)}\u0000${keyOf(x.right)}`, true)
  matchBy((x) => keyOf(x.left), false)
  matchBy((x) => keyOf(x.right), false)

  plan.added = pending
  plan.removed = [...available]
  return plan
}

function newCards(noteId: number, collectionId: number, now: Date): Omit<StoredCard, 'id'>[] {
  return (['forward', 'reverse'] as CardDir[]).map((dir) => ({ ...emptyCard(now), noteId, collectionId, dir }))
}

async function addNotes(collectionId: number, pairs: ParsedPair[], orderOf: (p: ParsedPair) => number) {
  const now = new Date()
  for (const pair of pairs) {
    const noteId = await db.notes.add({ collectionId, order: orderOf(pair), left: pair.left, right: pair.right })
    await db.cards.bulkAdd(newCards(noteId, collectionId, now))
  }
}

export async function createCollection(name: string, parsed: ParseResult, settings: Settings): Promise<number> {
  const pairs = dedupe(parsed.pairs)
  return db.transaction('rw', [db.collections, db.notes, db.cards], async () => {
    const collectionId = await db.collections.add({
      name,
      createdAt: Date.now(),
      direction: settings.defaultDirection,
      newPerDay: settings.defaultNewPerDay,
      leftLang: parsed.leftLang,
      rightLang: parsed.rightLang,
    })
    await addNotes(collectionId, pairs, (p) => p.line)
    return collectionId
  })
}

export async function applyMerge(collection: Collection, plan: MergePlan, parsed: ParseResult): Promise<void> {
  await db.transaction('rw', [db.collections, db.notes, db.cards, db.reviews], async () => {
    for (const { note, pair } of [...plan.changed, ...plan.unchanged]) {
      await db.notes.update(note.id, { left: pair.left, right: pair.right, order: pair.line })
    }
    const removedIds = plan.removed.map((n) => n.id)
    const removedCards = await db.cards.where('noteId').anyOf(removedIds).primaryKeys()
    await db.reviews.where('cardId').anyOf(removedCards).delete()
    await db.cards.bulkDelete(removedCards)
    await db.notes.bulkDelete(removedIds)
    await addNotes(collection.id, plan.added, (p) => p.line)
    if (parsed.leftLang && parsed.rightLang) {
      await db.collections.update(collection.id, { leftLang: parsed.leftLang, rightLang: parsed.rightLang })
    }
  })
}

/** Default collection name from a file name: "spanish-verbs.txt" -> "spanish verbs". */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fileName
}
