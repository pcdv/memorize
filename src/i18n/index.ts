import { createContext, useContext } from 'react'
import type { UiLang } from '../lib/db'
import type { IntervalUnits } from '../lib/scheduler'
import { en } from './en'
import { fr } from './fr'

export type Messages = Record<keyof typeof en, string>
export type MessageKey = keyof Messages
export type Lang = 'en' | 'fr'
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const dictionaries: Record<Lang, Messages> = { en, fr }

export function resolveLang(ui: UiLang): Lang {
  if (ui !== 'auto') return ui
  return navigator.languages?.some((l) => l.toLowerCase().startsWith('fr')) ? 'fr' : 'en'
}

export function makeTranslate(lang: Lang): Translate {
  const messages = dictionaries[lang]
  return (key, vars = {}) => {
    let text = messages[key]
    if (text.includes('|') && typeof vars.n === 'number') {
      const [one, many] = text.split('|') as [string, string]
      // French uses the singular for 0 and 1, English only for 1.
      text = (lang === 'fr' ? vars.n <= 1 : vars.n === 1) ? one : many
    }
    return text.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
  }
}

export const I18nContext = createContext<{ lang: Lang; t: Translate }>({ lang: 'en', t: makeTranslate('en') })

export const useI18n = () => useContext(I18nContext)
export const useT = () => useContext(I18nContext).t

export function useIntervalUnits(): IntervalUnits {
  const t = useT()
  return t('intervalUnits').split(' ') as unknown as IntervalUnits
}

/** Name of a language code in the UI language ("fr" -> "French" / "Français"). */
export function languageName(code: string | undefined, uiLang: Lang): string | undefined {
  if (!code) return undefined
  try {
    const name = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1)
  } catch {
    return code
  }
}

/** Languages offered in the pickers; any BCP 47 code from a file header is kept as is. */
export const COMMON_LANGS = [
  'en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'pl', 'cs', 'ro', 'hu',
  'el', 'ru', 'uk', 'tr', 'ar', 'he', 'fa', 'hi', 'zh', 'ja', 'ko', 'vi', 'th', 'id', 'la',
]
