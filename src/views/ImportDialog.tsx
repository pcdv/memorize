import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { languageName, useI18n } from '../i18n'
import { readBackup, restoreBackup } from '../lib/backup'
import { db, type Collection } from '../lib/db'
import { applyMerge, createCollection, findDuplicates, nameFromFile, planMerge } from '../lib/importer'
import { parseCollection } from '../lib/parse'
import { useSettings } from '../settings'

const canReadClipboard = typeof navigator.clipboard?.readText === 'function'

/**
 * Imports a `left : right` file as a new collection or, given `collection`,
 * as a new version of that collection.
 */
export function ImportDialog({
  collection,
  initialFile,
  onClose,
  onDone,
}: {
  collection?: Collection
  initialFile?: File
  onClose: () => void
  onDone: (collectionId: number) => void
}) {
  const { t, lang } = useI18n()
  const settings = useSettings()
  const [tab, setTab] = useState<'file' | 'text'>('file')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string>()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const readFile = async (file: File) => {
    const content = await file.text()
    // A backup (exported with progress) is restored, not read as "left : right" lines.
    const backup = readBackup(content)
    if (backup) {
      const restored = await restoreBackup(backup, t)
      if (typeof restored === 'number') onDone(restored)
      else if (restored === 'all') onClose()
      return
    }
    setText(content)
    setFileName(file.name)
    if (!name) setName(nameFromFile(file.name))
  }

  const pasteFromClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText())
    } catch {
      // Permission refused: the text box still accepts a regular paste.
    }
  }

  useEffect(() => {
    if (initialFile) void readFile(initialFile)
  }, [initialFile])

  const parsed = useMemo(() => parseCollection(text), [text])
  const existing = useLiveQuery(
    () => (collection ? db.notes.where('collectionId').equals(collection.id).toArray() : []),
    [collection?.id],
  )
  const plan = useMemo(
    () => (collection && existing ? planMerge(existing, parsed.pairs) : undefined),
    [collection, existing, parsed],
  )
  const duplicates = useMemo(() => findDuplicates(parsed.pairs), [parsed])
  const count = parsed.pairs.length - duplicates.repeated.length
  const hasContent = text.trim() !== ''

  const submit = async () => {
    setBusy(true)
    try {
      if (collection && plan) {
        await applyMerge(collection, plan, parsed)
        onDone(collection.id)
      } else {
        onDone(await createCollection(name.trim() || t('newCollection'), parsed, settings))
      }
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  return (
    <Modal title={collection ? t('updateTitle', { name: collection.name }) : t('importTitle')} onClose={onClose}>
      <div className="tabs" role="tablist">
        {(['file', 'text'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(k === 'file' ? 'fromFile' : 'fromText')}
          </button>
        ))}
      </div>

      {tab === 'file' ? (
        <label
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".txt,.text,.csv,.tsv,.md,.json,text/plain,application/json"
            onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
          />
          <Icon name="upload" size={28} />
          <strong>{fileName ?? t('chooseFile')}</strong>
          {!fileName && <span className="muted">{t('orDrop')}</span>}
        </label>
      ) : (
        <>
          {canReadClipboard && (
            <button className="button clipboard" onClick={() => void pasteFromClipboard()}>
              <Icon name="clipboard" size={18} /> {t('pasteClipboard')}
            </button>
          )}
          <textarea
            className="paste"
            rows={8}
            value={text}
            placeholder={t('pastePlaceholder')}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        </>
      )}
      <p className="hint">{t('formatHelp')}</p>

      {hasContent && (
        <div className="import-summary">
          {count === 0 ? (
            <p className="error">{t('nothingToImport')}</p>
          ) : (
            <p>
              <Icon name="check" size={16} /> {t('pairsFound', { n: count })}
              {parsed.leftLang && parsed.rightLang && (
                <span className="muted">
                  {' · '}
                  {t('langsDetected', {
                    left: languageName(parsed.leftLang, lang)!,
                    right: languageName(parsed.rightLang, lang)!,
                  })}
                </span>
              )}
            </p>
          )}
          {parsed.errors.length > 0 && (
            <details className="ignored" open={parsed.errors.length <= 5}>
              <summary>{t('linesIgnored', { n: parsed.errors.length })}</summary>
              <ul>
                {parsed.errors.slice(0, 20).map((e) => (
                  <li key={e.line}>
                    <span className="muted">{t('lineN', { n: e.line })}</span> {e.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {duplicates.repeated.length > 0 && (
            <details className="ignored" open={duplicates.repeated.length <= 5}>
              <summary>{t('repeatedLines', { n: duplicates.repeated.length })}</summary>
              <ul>
                {duplicates.repeated.slice(0, 20).map(({ pair, firstLine }) => (
                  <li key={pair.line}>
                    <span className="muted">{t('lineN', { n: pair.line })}</span> {pair.left} : {pair.right}{' '}
                    <span className="muted">({t('sameAsLine', { n: firstLine })})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {duplicates.sameLeft.length > 0 && (
            <details className="ignored" open={duplicates.sameLeft.length <= 5}>
              <summary>{t('severalAnswers', { n: duplicates.sameLeft.length })}</summary>
              <ul>
                {duplicates.sameLeft.slice(0, 20).map((group) => (
                  <li key={group[0]!.line}>
                    <strong>{group[0]!.left}</strong>
                    {group.map((p) => (
                      <span key={p.line}>
                        {' · '}
                        <span className="muted">{t('lineN', { n: p.line })}</span> {p.right}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {plan && count > 0 && (
            <>
              <div className="merge">
                <span className="pill pill-new">+ {t('mergeAdded', { n: plan.added.length })}</span>
                <span className="pill pill-changed">~ {t('mergeChanged', { n: plan.changed.length })}</span>
                <span className="pill pill-removed">− {t('mergeRemoved', { n: plan.removed.length })}</span>
                <span className="pill">{t('mergeUnchanged', { n: plan.unchanged.length })}</span>
              </div>
              <p className="hint">{t('mergeHelp')}</p>
            </>
          )}
        </div>
      )}

      {!collection && (
        <label className="field">
          <span className="field-label">{t('collectionName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newCollection')} />
        </label>
      )}

      <div className="modal-actions">
        <button className="button ghost" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="button primary" disabled={busy || count === 0} onClick={submit}>
          {t(collection ? 'update' : 'create')}
        </button>
      </div>
    </Modal>
  )
}
