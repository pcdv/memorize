/**
 * Parser for collection files: one `question : answer` pair per line.
 *
 * - The pair is split on the first unescaped `:`; `\:` stands for a literal colon.
 * - Blank lines and lines starting with `#` are ignored, except a `#lang: xx : yy`
 *   header, which gives the language of each side.
 */

export interface ParsedPair {
  left: string
  right: string
  line: number
}

export interface ParseError {
  line: number
  text: string
}

export interface ParseResult {
  pairs: ParsedPair[]
  errors: ParseError[]
  leftLang?: string
  rightLang?: string
}

// "#lang: id : en", also without the colon after "lang" ("#lang id : en").
const LANG_HEADER = /^#\s*lang\s*:?\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\s*:\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\s*$/i

/** Splits on the first unescaped colon; returns null when there is none. */
function splitPair(line: string): [string, string] | null {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === ':') {
      i++
    } else if (line[i] === ':') {
      return [line.slice(0, i), line.slice(i + 1)]
    }
  }
  return null
}

const unescape = (s: string) => s.replace(/\\:/g, ':').trim().replace(/\s+/g, ' ')

export function parseCollection(text: string): ParseResult {
  const result: ParseResult = { pairs: [], errors: [] }
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/)

  lines.forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.trim()
    if (trimmed === '') return
    if (trimmed.startsWith('#')) {
      const lang = LANG_HEADER.exec(trimmed)
      if (lang) {
        result.leftLang = lang[1]!.toLowerCase()
        result.rightLang = lang[2]!.toLowerCase()
      }
      return
    }
    const split = splitPair(trimmed)
    const left = split && unescape(split[0])
    const right = split && unescape(split[1])
    if (!left || !right) {
      result.errors.push({ line, text: trimmed })
      return
    }
    result.pairs.push({ left, right, line })
  })

  return result
}

/** Serializes pairs back to the file format, so a collection can be exported and edited. */
export function formatCollection(
  pairs: { left: string; right: string }[],
  leftLang?: string,
  rightLang?: string,
): string {
  const escape = (s: string) => s.replace(/:/g, '\\:')
  const header = leftLang && rightLang ? [`#lang: ${leftLang} : ${rightLang}`] : []
  return [...header, ...pairs.map((p) => `${escape(p.left)} : ${p.right}`)].join('\n') + '\n'
}
