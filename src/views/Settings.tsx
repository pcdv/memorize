import { useRef } from 'react'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { download, exportBackup, importBackup } from '../lib/backup'
import { saveSettings, type AnswerMode, type Direction, type UiLang } from '../lib/db'
import { href } from '../lib/route'
import { useSettings } from '../settings'

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Settings() {
  const t = useT()
  const settings = useSettings()
  const restoreInput = useRef<HTMLInputElement>(null)

  const restore = async (file: File) => {
    if (!confirm(t('restoreConfirm'))) return
    try {
      await importBackup(await file.text())
      alert(t('restoreDone'))
    } catch {
      alert(t('restoreFailed'))
    }
  }

  return (
    <main className="page settings">
      <header className="topbar">
        <a className="icon-button" href={href.home} aria-label={t('back')}>
          <Icon name="back" />
        </a>
        <h1>{t('settings')}</h1>
      </header>

      <section className="panel">
        <div className="field">
          <span className="field-label">{t('uiLanguage')}</span>
          <Segmented<UiLang>
            value={settings.uiLang}
            onChange={(uiLang) => void saveSettings({ uiLang })}
            options={[
              { value: 'auto', label: t('langAuto') },
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'Français' },
            ]}
          />
        </div>
        <div className="field">
          <span className="field-label">{t('answerMode')}</span>
          <Segmented<AnswerMode>
            value={settings.answerMode}
            onChange={(answerMode) => void saveSettings({ answerMode })}
            options={[
              { value: 'reveal', label: t('modeReveal') },
              { value: 'type', label: t('modeType') },
            ]}
          />
        </div>
      </section>

      <section className="panel">
        <h2>{t('defaults')}</h2>
        <div className="field">
          <span className="field-label">{t('direction')}</span>
          <Segmented<Direction>
            value={settings.defaultDirection}
            onChange={(defaultDirection) => void saveSettings({ defaultDirection })}
            options={[
              { value: 'forward', label: t('dirForward', { left: t('leftSide'), right: t('rightSide') }) },
              { value: 'reverse', label: t('dirReverse', { left: t('leftSide'), right: t('rightSide') }) },
              { value: 'both', label: t('dirBoth') },
            ]}
          />
        </div>
        <label className="field">
          <span className="field-label">{t('newPerDay')}</span>
          <input
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            defaultValue={settings.defaultNewPerDay}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n >= 0) void saveSettings({ defaultNewPerDay: n })
            }}
          />
        </label>
      </section>

      <section className="panel">
        <h2>{t('backup')}</h2>
        <p className="hint">{t('backupHelp')}</p>
        <div className="actions">
          <button className="button" onClick={async () => download(await exportBackup(), `memorize-${new Date().toISOString().slice(0, 10)}.json`)}>
            <Icon name="download" size={18} /> {t('exportBackup')}
          </button>
          <button className="button" onClick={() => restoreInput.current?.click()}>
            <Icon name="upload" size={18} /> {t('importBackup')}
          </button>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void restore(file)
            }}
          />
        </div>
      </section>

      <p className="hint center">Memorize {__APP_VERSION__}</p>
    </main>
  )
}
