import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { normalize } from '../lib/answer'
import { db, type Collection } from '../lib/db'
import { dedupe } from '../lib/importer'
import { parseCollection } from '../lib/parse'
import { href, navigate } from '../lib/route'
import { clearSharedText, sharedText } from '../lib/share'
import { ImportDialog } from './ImportDialog'

/** Text shared from another app: choose the collection it updates, or create one. */
export function ShareView() {
  const t = useT()
  const [shared] = useState(sharedText)
  const collections = useLiveQuery(() => db.collections.orderBy('name').toArray())
  const [target, setTarget] = useState<{ collection?: Collection } | null>(null)

  useEffect(() => {
    if (!shared) navigate(href.home)
  }, [shared])
  if (!shared || !collections) return null

  const count = dedupe(parseCollection(shared.text).pairs).length
  // The collection named like the note comes first.
  const key = normalize(shared.title)
  const matches = (c: Collection) => key !== '' && normalize(c.name) === key
  const sorted = [...collections].sort((a, b) => Number(matches(b)) - Number(matches(a)))

  const done = (id: number) => {
    clearSharedText()
    navigate(href.collection(id))
  }

  return (
    <main className="page share">
      <header className="topbar">
        <a className="icon-button" href={href.home} aria-label={t('back')} onClick={clearSharedText}>
          <Icon name="back" />
        </a>
        <div>
          <h1>{t('shareTitle')}</h1>
          <p className="muted">
            {shared.title && <strong>{shared.title} · </strong>}
            {t('pairsFound', { n: count })}
          </p>
        </div>
      </header>

      {sorted.length > 0 && (
        <section className="panel">
          <h2>{t('shareUpdate')}</h2>
          <div className="share-choices">
            {sorted.map((c) => (
              <button key={c.id} className={`button${matches(c) ? ' primary' : ''}`} onClick={() => setTarget({ collection: c })}>
                <Icon name="upload" size={18} /> {c.name}
                {matches(c) && <span className="share-match">{t('shareMatch')}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <button className={`button${sorted.some(matches) ? '' : ' primary'}`} onClick={() => setTarget({})}>
          <Icon name="plus" size={18} /> {t('newCollection')}
        </button>
      </section>

      {target && (
        <ImportDialog
          collection={target.collection}
          initialText={shared.text}
          initialName={shared.title}
          onClose={() => setTarget(null)}
          onDone={done}
        />
      )}
    </main>
  )
}
