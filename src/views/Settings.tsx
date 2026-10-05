import { useRef } from 'react'
import { Icon } from '../components/Icon'
import { NumberField } from '../components/NumberField'
import { useT } from '../i18n'
import { download, exportBackup, readBackup, restoreBackup } from '../lib/backup'
import { saveSettings, type AnswerMode, type Direction, type UiLang } from '../lib/db'
import { installPlatform, isInstalled, useInstallPrompt } from '../lib/install'
import { href, navigate } from '../lib/route'
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

const INSTALL_STEPS = { 'firefox-android': 'installFirefox', ios: 'installIos', other: 'installOther' } as const

function InstallSection() {
  const t = useT()
  const { canInstall, install } = useInstallPrompt()
  return (
    <section className="panel">
      <h2>{t('installTitle')}</h2>
      {isInstalled() ? (
        <p className="hint">{t('installed')}</p>
      ) : (
        <>
          <p className="hint">{t('installHelp')}</p>
          {canInstall ? (
            <button className="button primary" onClick={() => void install()}>
              <Icon name="download" size={18} /> {t('install')}
            </button>
          ) : (
            <p>{t(INSTALL_STEPS[installPlatform()])}</p>
          )}
        </>
      )}
    </section>
  )
}

export function Settings() {
  const t = useT()
  const settings = useSettings()
  const restoreInput = useRef<HTMLInputElement>(null)

  const restore = async (file: File) => {
    const backup = readBackup(await file.text())
    if (!backup) return alert(t('restoreFailed'))
    const restored = await restoreBackup(backup, t)
    if (typeof restored === 'number') navigate(href.collection(restored))
    else if (restored === 'all') alert(t('restoreDone'))
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
        <NumberField
          label={t('newPerDay')}
          value={settings.defaultNewPerDay}
          onSave={(defaultNewPerDay) => void saveSettings({ defaultNewPerDay })}
        />
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

      <InstallSection />

      <p className="hint center">Memorize {__APP_VERSION__}</p>
    </main>
  )
}
