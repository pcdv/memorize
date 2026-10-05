import { describe, expect, it } from 'vitest'
import type { Note } from './db'
import { dedupe, findDuplicates, nameFromFile, planMerge } from './importer'
import type { ParsedPair } from './parse'

const note = (id: number, left: string, right: string): Note => ({ id, collectionId: 1, order: id, left, right })
const pair = (line: number, left: string, right: string): ParsedPair => ({ line, left, right })

describe('planMerge', () => {
  const existing = [note(1, 'chat', 'cat'), note(2, 'chien', 'dog'), note(3, 'oiseau', 'bird'), note(4, 'poisson', 'fish')]

  it('keeps unchanged notes, tracks edits on either side, adds and removes the rest', () => {
    const plan = planMerge(existing, [
      pair(1, 'chat', 'cat'),
      pair(2, 'chien', 'hound'), // answer edited
      pair(3, 'un oiseau', 'bird'), // question edited
      pair(4, 'cheval', 'horse'), // new
    ])
    expect(plan.unchanged.map((m) => m.note.id)).toEqual([1])
    expect(plan.changed.map((m) => [m.note.id, m.pair.left, m.pair.right])).toEqual([
      [2, 'chien', 'hound'],
      [3, 'un oiseau', 'bird'],
    ])
    expect(plan.added.map((p) => p.left)).toEqual(['cheval'])
    expect(plan.removed.map((n) => n.id)).toEqual([4])
  })

  it('treats case or accent fixes as changes, not as new cards', () => {
    const plan = planMerge([note(1, 'ete', 'summer')], [pair(1, 'été', 'Summer')])
    expect(plan.changed).toHaveLength(1)
    expect(plan.added).toEqual([])
    expect(plan.removed).toEqual([])
  })

  it('handles several meanings of the same word', () => {
    const plan = planMerge(
      [note(1, 'bank', 'banque'), note(2, 'bank', 'rive')],
      [pair(1, 'bank', 'rive'), pair(2, 'bank', 'banque')],
    )
    expect(plan.unchanged.map((m) => m.note.id).sort()).toEqual([1, 2])
  })
})

describe('dedupe', () => {
  it('drops repeated pairs', () => {
    expect(dedupe([pair(1, 'a', 'b'), pair(2, 'A', 'b'), pair(3, 'a', 'c')]).map((p) => p.line)).toEqual([1, 3])
  })
})

describe('findDuplicates', () => {
  it('reports repeated lines and questions with several answers', () => {
    const d = findDuplicates([
      pair(1, 'Lutut', 'knee'),
      pair(2, 'Mengirim', 'envoyer'),
      pair(3, 'lutut', 'Knee'),
      pair(4, 'Mengirim', 'remplir'),
      pair(5, 'Mata', 'eye'),
    ])
    expect(d.repeated.map((r) => [r.pair.line, r.firstLine])).toEqual([[3, 1]])
    expect(d.sameLeft.map((g) => g.map((p) => p.line))).toEqual([[2, 4]])
  })

  it('does not count a repeated line as a second answer', () => {
    expect(findDuplicates([pair(1, 'a', 'b'), pair(2, 'a', 'b')]).sameLeft).toEqual([])
  })
})

describe('nameFromFile', () => {
  it('derives a readable name', () => {
    expect(nameFromFile('spanish-verbs_2.txt')).toBe('spanish verbs 2')
  })
})
