import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent } from 'react'
import { Icon } from '../components/Icon'
import { languageName, useI18n, type MessageKey } from '../i18n'
import { db, type Collection } from '../lib/db'
import { createCollection } from '../lib/importer'
import { useInstallPrompt } from '../lib/install'
import { parseCollection } from '../lib/parse'
import { loadCollectionData } from '../lib/queries'
import { href, navigate } from '../lib/route'
import { queueStats, type QueueStats } from '../lib/scheduler'
import { useSettings } from '../settings'
import { ImportDialog } from './ImportDialog'

const SAMPLES: { file: string; label: MessageKey }[] = [
  { file: 'capitals.txt', label: 'sampleCapitals' },
  { file: 'spanish.txt', label: 'sampleSpanish' },
]

async function loadOverview(): Promise<{ collection: Collection; stats: QueueStats }[]> {
  const collections = await db.collections.orderBy('name').toArray()
  const all = await Promise.all(collections.map((c) => loadCollectionData(c.id)))
  return all
    .filter((d) => d !== null)
    .map((d) => ({ collection: d.collection, stats: queueStats(d.collection, d.cards, d.reviewsToday, d.noteOrder) }))
}

export function Home() {
  const { t, lang } = useI18n()
  const settings = useSettings()
  const overview = useLiveQuery(loadOverview)
  const { canInstall, install } = useInstallPrompt()
  const [importing, setImporting] = useState<{ file?: File } | null>(null)
  const [dragging, setDragging] = useState(false)

  const addSample = async (file: string, label: MessageKey) => {
    const text = await (await fetch(`${import.meta.env.BASE_URL}samples/${file}`)).text()
    await createCollection(t(label), parseCollection(text), settings)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setImporting({ file })
  }

  if (!overview) return null

  return (
    <main
      className={`page home${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        if (importing) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width={32} height={32} />
          <div>
            <h1>Memorize</h1>
            <p className="muted">{t('appTagline')}</p>
          </div>
        </div>
        {canInstall && (
          <button className="button install-button" onClick={() => void install()} title={t('installTitle')}>
            <Icon name="download" size={18} /> {t('install')}
          </button>
        )}
        <a className="icon-button" href={href.settings} aria-label={t('settings')} title={t('settings')}>
          <Icon name="settings" />
        </a>
      </header>

      {overview.length === 0 ? (
        <section className="empty">
          <div className="empty-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2>{t('emptyTitle')}</h2>
          <p className="muted">{t('emptyText')}</p>
          <button className="button primary large" onClick={() => setImporting({})}>
            <Icon name="plus" /> {t('newCollection')}
          </button>
          <p className="muted samples">
            {t('trySample')}{' '}
            {SAMPLES.map((s) => (
              <button key={s.file} className="link" onClick={() => void addSample(s.file, s.label)}>
                {t(s.label)}
              </button>
            ))}
          </p>
        </section>
      ) : (
        <>
          <div className="section-header">
            <h2>{t('collections')}</h2>
            <button className="button" onClick={() => setImporting({})}>
              <Icon name="plus" size={18} /> {t('newCollection')}
            </button>
          </div>
          <ul className="collection-list">
            {overview.map(({ collection: c, stats }) => {
              const todo = stats.due + stats.newAvailable
              const left = languageName(c.leftLang, lang)
              const right = languageName(c.rightLang, lang)
              return (
                <li key={c.id} className="collection-card">
                  <a className="collection-main" href={href.collection(c.id)}>
                    <h3>{c.name}</h3>
                    {left && right && <p className="langs">{left} · {right}</p>}
                    <p className="counts">
                      {stats.due > 0 && <span className="count due">{t('dueCount', { n: stats.due })}</span>}
                      {stats.newAvailable > 0 && <span className="count new">{t('newCount', { n: stats.newAvailable })}</span>}
                      {todo === 0 && <span className="count done">{t('nothingToday')}</span>}
                      <span className="count total">{t('totalCount', { n: stats.total })}</span>
                    </p>
                  </a>
                  <button className="button primary study-button" disabled={todo === 0} onClick={() => navigate(href.study(c.id))}>
                    <Icon name="play" size={16} /> {t('study')}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="hint center desktop-only">{t('dropHint')}</p>
        </>
      )}

      {importing && (
        <ImportDialog
          initialFile={importing.file}
          onClose={() => setImporting(null)}
          onDone={() => setImporting(null)}
        />
      )}
    </main>
  )
}
