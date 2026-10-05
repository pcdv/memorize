import { useSyncExternalStore } from 'react'
import type { QueueOptions } from './scheduler'

/** Hash-based routes: they work on GitHub Pages without any server-side rewrite. */
export type Route =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'share' }
  | { name: 'collection'; id: number }
  | { name: 'study'; id: number; options: QueueOptions }

export const href = {
  home: '#/',
  settings: '#/settings',
  collection: (id: number) => `#/c/${id}`,
  /** `#/study/3`, or `#/study/3/reverse/more` for extra practice. */
  study: (id: number, options: QueueOptions = {}) =>
    [`#/study/${id}`, options.dir, options.extra && 'more'].filter(Boolean).join('/'),
}

export function parseRoute(hash: string): Route {
  const [, page, id, ...flags] = hash.replace(/^#/, '').split('/')
  const n = Number(id)
  if (page === 'settings') return { name: 'settings' }
  if (page === 'share') return { name: 'share' }
  if (page === 'c' && n > 0) return { name: 'collection', id: n }
  if (page === 'study' && n > 0) {
    const dir = flags.find((f) => f === 'forward' || f === 'reverse')
    return { name: 'study', id: n, options: { dir, extra: flags.includes('more') } }
  }
  return { name: 'home' }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseRoute(hash)
}

export function navigate(to: string): void {
  window.location.hash = to
}
