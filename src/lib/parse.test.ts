import { describe, expect, it } from 'vitest'
import { formatCollection, parseCollection } from './parse'

describe('parseCollection', () => {
  it('splits each line on the first colon and trims', () => {
    const r = parseCollection('bonjour : hello\n  merci:thank   you  \n')
    expect(r.pairs.map(({ left, right }) => [left, right])).toEqual([
      ['bonjour', 'hello'],
      ['merci', 'thank you'],
    ])
    expect(r.errors).toEqual([])
  })

  it('keeps later colons in the answer and honours \\: in the question', () => {
    const r = parseCollection('lunch time : 12:30\nratio 1\\:2 : one to two')
    expect(r.pairs.map(({ left, right }) => [left, right])).toEqual([
      ['lunch time', '12:30'],
      ['ratio 1:2', 'one to two'],
    ])
  })

  it('ignores blank lines and comments, reports malformed lines with their number', () => {
    const r = parseCollection('﻿# a comment\n\nno separator\n : missing left\nok : fine\r\nmissing right :')
    expect(r.pairs).toEqual([{ left: 'ok', right: 'fine', line: 5 }])
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 6])
  })

  it('reads the language header', () => {
    const r = parseCollection('#lang: FR : en-GB\nchat : cat')
    expect([r.leftLang, r.rightLang]).toEqual(['fr', 'en-gb'])
    expect(r.pairs).toHaveLength(1)
  })

  it('round-trips through formatCollection', () => {
    const pairs = [
      { left: 'a:b', right: 'c:d' },
      { left: 'x', right: 'y' },
    ]
    const r = parseCollection(formatCollection(pairs, 'fr', 'en'))
    expect(r.pairs.map(({ left, right }) => ({ left, right }))).toEqual(pairs)
    expect(r.leftLang).toBe('fr')
  })
})
