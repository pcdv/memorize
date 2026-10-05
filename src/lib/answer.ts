import { Rating, type Grade } from 'ts-fsrs'

/** Case, accents, punctuation and spacing do not count when comparing typed answers. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = cur
  }
  return prev[y.length]!
}

export type Verdict = 'correct' | 'almost' | 'wrong'

export interface Check {
  verdict: Verdict
  suggested: Grade
}

/** Splits on `,` `;` `/` `|`, except inside parentheses. */
function splitAlternatives(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (c === ',' || c === ';' || c === '/' || c === '|')) {
      parts.push(s.slice(start, i))
      start = i + 1
    }
  }
  return [...parts, s.slice(start)]
}

const withoutNotes = (s: string) => s.replace(/\([^)]*\)/g, ' ')

/**
 * Every accepted form of an expected answer. Alternatives are separated by `,` `;` `/`
 * or `|` ("kiss, smell"), and parentheses hold optional notes: "(be) called" accepts
 * "called" and "be called".
 */
export function acceptedAnswers(expected: string): string[] {
  const forms = [expected, ...splitAlternatives(expected)].flatMap((s) => [s, withoutNotes(s)])
  return [...new Set(forms.map(normalize).filter(Boolean))]
}

/**
 * Compares a typed answer with the expected one(s): several are given when other cards
 * ask the same question ("reporter" -> Wartawan, Jurnalis).
 */
export function checkAnswer(typed: string, expected: string | string[]): Check {
  const t = normalize(typed)
  if (t === '') return { verdict: 'wrong', suggested: Rating.Again }

  const candidates = [expected].flat().flatMap(acceptedAnswers)
  let best: Verdict = 'wrong'
  for (const c of candidates) {
    if (c === t) return { verdict: 'correct', suggested: Rating.Good }
    // One typo per ~5 characters counts as "almost"; very short answers must be exact.
    const length = [...c].length
    const tolerance = length <= 3 ? 0 : Math.max(1, Math.floor(length / 5))
    if (levenshtein(t, c) <= tolerance) best = 'almost'
  }
  return best === 'almost'
    ? { verdict: 'almost', suggested: Rating.Hard }
    : { verdict: 'wrong', suggested: Rating.Again }
}
