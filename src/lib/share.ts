/**
 * Text shared to the app from another one (e.g. a Google Keep note, via Android's share
 * sheet). The manifest's `share_target` opens `<base>?title=…&text=…`.
 */
export interface SharedText {
  title: string
  text: string
  /** Where it came from, shown in ?debug mode: the referrer and every URL parameter. */
  source: string
}

let pending: SharedText | null = null

/** Takes shared text out of the URL, once, before the app renders. */
export function takeSharedTextFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('text') && !params.has('title')) return
  const title = (params.get('title') ?? '').trim()
  let text = params.get('text') ?? params.get('url') ?? ''
  // Some apps repeat the title as the first line of the text.
  const [first, ...rest] = text.split(/\r?\n/)
  if (title && first?.trim() === title) text = rest.join('\n')
  const source = [`referrer: ${document.referrer || '(none)'}`, ...[...params].map(([k, v]) => `${k}: ${v.slice(0, 80)}`)].join('\n')
  pending = { title, text, source }
  // A clean URL, so that reloading does not import the text again.
  window.history.replaceState(null, '', `${window.location.pathname}#/share`)
}

export function sharedText(): SharedText | null {
  return pending
}

export function clearSharedText(): void {
  pending = null
}
