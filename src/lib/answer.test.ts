import { Rating } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { acceptedAnswers, checkAnswer, levenshtein, normalize } from './answer'

describe('normalize', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(normalize('  Très   Bien ! ')).toBe('tres bien')
    expect(normalize('L’été')).toBe('l ete')
  })
})

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })
})

describe('checkAnswer', () => {
  it('accepts exact answers regardless of case and accents', () => {
    expect(checkAnswer('etre', 'Être')).toEqual({ verdict: 'correct', suggested: Rating.Good })
  })

  it('accepts any listed alternative', () => {
    expect(checkAnswer('automobile', 'car / automobile').verdict).toBe('correct')
    expect(checkAnswer('car', 'car; automobile').verdict).toBe('correct')
  })

  it('accepts comma-separated alternatives', () => {
    expect(checkAnswer('smell', 'kiss, smell').verdict).toBe('correct')
    expect(checkAnswer('in a minute', 'soon, in a minute, asap').verdict).toBe('correct')
  })

  it('treats parentheses as optional notes', () => {
    expect(checkAnswer('back', 'back (dos)').verdict).toBe('correct')
    expect(checkAnswer('called', '(be) called').verdict).toBe('correct')
    expect(checkAnswer('be called', '(be) called').verdict).toBe('correct')
    expect(checkAnswer('again and again', 'again (and again)').verdict).toBe('correct')
  })

  it('does not split inside parentheses', () => {
    expect(acceptedAnswers('possible, maybe (tidak mungkin: no way, impossible)')).not.toContain('impossible')
    expect(checkAnswer('maybe', 'possible, maybe (tidak mungkin: no way, impossible)').verdict).toBe('correct')
  })

  it('accepts the answer of another card with the same question', () => {
    expect(checkAnswer('jurnalis', ['Wartawan', 'Jurnalis']).verdict).toBe('correct')
  })

  it('treats a small typo as almost', () => {
    expect(checkAnswer('elephnt', 'elephant')).toEqual({ verdict: 'almost', suggested: Rating.Hard })
  })

  it('requires short answers to be exact', () => {
    expect(checkAnswer('cap', 'cat').verdict).toBe('wrong')
  })

  it('rejects wrong and empty answers', () => {
    expect(checkAnswer('dog', 'elephant')).toEqual({ verdict: 'wrong', suggested: Rating.Again })
    expect(checkAnswer('  ', 'elephant').verdict).toBe('wrong')
  })
})
