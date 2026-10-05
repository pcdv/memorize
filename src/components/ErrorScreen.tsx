import { Component, useEffect, useState, type ReactNode } from 'react'
import { makeTranslate, resolveLang, useT } from '../i18n'

/** Activates a waiting service worker (a newer version of the app), then reloads. */
export async function updateAndReload(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration()
  if (registration?.waiting) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}

function ErrorDetails({ error }: { error: unknown }) {
  // Outside the providers: the UI language is picked from the browser.
  const t = makeTranslate(resolveLang('auto'))
  const text = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
  return (
    <main className="page error-screen">
      <h1>{t('errorTitle')}</h1>
      <p className="muted">{t('errorHelp')}</p>
      <pre>{text}</pre>
      <div className="actions">
        <button className="button primary" onClick={() => void updateAndReload()}>
          {t('reload')}
        </button>
        <button className="button" onClick={() => void navigator.clipboard?.writeText(text)}>
          {t('copyError')}
        </button>
        <a className="button" href={import.meta.env.BASE_URL}>
          {t('backHome')}
        </a>
      </div>
    </main>
  )
}

/** Shows the error instead of an empty page when rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    return this.state.error !== null ? <ErrorDetails error={this.state.error} /> : this.props.children
  }
}

/**
 * Shown while a view waits for its data: nothing at first, to avoid a flash, then a
 * message, and after a while a hint that the browser's database does not answer.
 */
export function Loading() {
  const t = useT()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timers = [setTimeout(() => setElapsed(1), 800), setTimeout(() => setElapsed(2), 8000)]
    return () => timers.forEach(clearTimeout)
  }, [])
  if (elapsed === 0) return null
  return (
    <main className="page loading">
      <p className="muted">{t('loading')}</p>
      {elapsed === 2 && (
        <>
          <p className="muted">{t('loadingSlow')}</p>
          <button className="button" onClick={() => void updateAndReload()}>
            {t('reload')}
          </button>
        </>
      )}
    </main>
  )
}
