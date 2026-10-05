import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { State } from 'ts-fsrs'
import { Loading } from '../components/ErrorScreen'
import { Icon } from '../components/Icon'
import { LangPicker } from '../components/LangPicker'
import { NumberField } from '../components/NumberField'
import { StudyMore } from '../components/StudyMore'
import { languageName, useI18n, useIntervalUnits, type Translate } from '../i18n'
import { download, exportCollectionBackup, exportCollectionText } from '../lib/backup'
import { db, deleteCollection, type Direction, type StoredCard } from '../lib/db'
import { normalize } from '../lib/answer'
import { installPlatform } from '../lib/install'
import { loadCollectionData } from '../lib/queries'
import { href, navigate } from '../lib/route'
import { formatInterval, queueStats, resetCollectionProgress, type IntervalUnits } from '../lib/scheduler'
import { ImportDialog } from './ImportDialog'

const MAX_ROWS = 300

function cardStatus(card: StoredCard | undefined, t: Translate, units: IntervalUnits, now: Date): { text: string; cls: string } {
  if (!card || card.state === State.New) return { text: t('stateNew'), cls: 'new' }
  if (card.due <= now) return { text: t('stateDueNow'), cls: 'due' }
  return { text: t('stateDueIn', { interval: formatInterval(now, card.due, units) }), cls: 'later' }
}

export function CollectionView({ id }: { id: number }) {
  const { t, lang } = useI18n()
  const units = useIntervalUnits()
  const data = useLiveQuery(() => loadCollectionData(id), [id])
  const [updating, setUpdating] = useState(false)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    if (!data) return []
    const byNote = new Map<number, { forward?: StoredCard; reverse?: StoredCard }>()
    for (const c of data.cards) byNote.set(c.noteId, { ...byNote.get(c.noteId), [c.dir]: c })
    const q = normalize(search)
    return [...data.notes.values()]
      .sort((a, b) => a.order - b.order)
      .filter((n) => !q || normalize(`${n.left} ${n.right}`).includes(q))
      .map((n) => ({ note: n, ...byNote.get(n.id) }))
  }, [data, search])

  if (data === undefined) return <Loading />
  if (data === null) {
    navigate(href.home)
    return null
  }

  const c = data.collection
  const stats = queueStats(c, data.cards, data.reviewsToday, data.noteOrder)
  const left = languageName(c.leftLang, lang) ?? t('leftSide')
  const right = languageName(c.rightLang, lang) ?? t('rightSide')
  const now = new Date()
  const update = (patch: Partial<typeof c>) => void db.collections.update(c.id, patch)

  const directions: { value: Direction; label: string }[] = [
    { value: 'forward', label: t('dirForward', { left, right }) },
    { value: 'reverse', label: t('dirReverse', { left, right }) },
    { value: 'both', label: t('dirBoth') },
  ]

  return (
    <main className="page collection">
      <header className="topbar">
        <a className="icon-button" href={href.home} aria-label={t('back')}>
          <Icon name="back" />
        </a>
        <input
          className="title-input"
          defaultValue={c.name}
          key={c.name}
          aria-label={t('collectionName')}
          onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update({ name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </header>

      <section className="panel study-panel">
        <p className="counts">
          <span className="count due">{t('dueCount', { n: stats.due })}</span>
          <span className="count new">{t('newCount', { n: stats.newAvailable })}</span>
          <span className="count total">{t('totalCount', { n: stats.total })}</span>
        </p>
        <button
          className="button primary large"
          disabled={stats.due + stats.newAvailable === 0}
          onClick={() => navigate(href.study(c.id))}
        >
          <Icon name="play" size={18} /> {t('study')}
        </button>
        <StudyMore data={data} />
      </section>

      <section className="panel">
        <div className="field">
          <span className="field-label">{t('direction')}</span>
          <div className="segmented" role="radiogroup">
            {directions.map((d) => (
              <button
                key={d.value}
                role="radio"
                aria-checked={c.direction === d.value}
                className={c.direction === d.value ? 'active' : ''}
                onClick={() => update({ direction: d.value })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <LangPicker label={t('leftSide')} value={c.leftLang} onChange={(v) => update({ leftLang: v })} />
          <LangPicker label={t('rightSide')} value={c.rightLang} onChange={(v) => update({ rightLang: v })} />
        </div>
        <NumberField label={t('newPerDay')} value={c.newPerDay} onSave={(newPerDay) => update({ newPerDay })} />
        <div className="field">
          <span className="field-label">{t('newOrder')}</span>
          <div className="segmented" role="radiogroup">
            {(['file', 'random'] as const).map((order) => (
              <button
                key={order}
                role="radio"
                aria-checked={(c.newOrder ?? 'file') === order}
                className={(c.newOrder ?? 'file') === order ? 'active' : ''}
                onClick={() => update({ newOrder: order })}
              >
                {t(order === 'file' ? 'newOrderFile' : 'newOrderRandom')}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel actions">
        <button className="button" onClick={() => setUpdating(true)}>
          <Icon name="upload" size={18} /> {t('updateFromFile')}
        </button>
        <button className="button" onClick={async () => download(await exportCollectionText(c), `${c.name}.txt`)}>
          <Icon name="download" size={18} /> {t('exportText')}
        </button>
        <button
          className="button"
          onClick={async () => download(await exportCollectionBackup(c), `${c.name}.memorize.json`)}
        >
          <Icon name="download" size={18} /> {t('exportWithProgress')}
        </button>
        <button
          className="button"
          onClick={() => confirm(t('resetConfirm', { name: c.name })) && void resetCollectionProgress(c.id)}
        >
          <Icon name="refresh" size={18} /> {t('resetProgress')}
        </button>
        <button
          className="button danger"
          onClick={async () => {
            if (!confirm(t('deleteConfirm', { name: c.name }))) return
            await deleteCollection(c.id)
            navigate(href.home)
          }}
        >
          <Icon name="trash" size={18} /> {t('delete')}
        </button>
      </section>

      {/* iOS web apps cannot receive shared text. */}
      {installPlatform() !== 'ios' && (
        <details className="panel share-help">
          <summary>{t('shareFeatureTitle')}</summary>
          <p className="hint">{t('shareFeatureHelp', { name: c.name })}</p>
        </details>
      )}

      <section className="panel">
        <div className="section-header">
          <h2>
            {t('cards')} <span className="muted">({data.notes.size})</span>
          </h2>
          <input className="search" type="search" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ul className="card-list">
          {rows.slice(0, MAX_ROWS).map(({ note, forward, reverse }) => (
            <li key={note.id}>
              <span className="pair">
                <span lang={c.leftLang}>{note.left}</span>
                <span className="sep">:</span>
                <span lang={c.rightLang}>{note.right}</span>
              </span>
              <span className="statuses">
                {(c.direction === 'both' ? [forward, reverse] : [c.direction === 'forward' ? forward : reverse]).map((card, i) => {
                  const s = cardStatus(card, t, units, now)
                  return (
                    <span key={i} className={`status status-${s.cls}`}>
                      {c.direction === 'both' && (i === 0 ? '→ ' : '← ')}
                      {s.text}
                    </span>
                  )
                })}
              </span>
            </li>
          ))}
        </ul>
        {rows.length > MAX_ROWS && <p className="hint center">… {rows.length - MAX_ROWS}</p>}
      </section>

      {updating && <ImportDialog collection={c} onClose={() => setUpdating(false)} onDone={() => setUpdating(false)} />}
    </main>
  )
}
