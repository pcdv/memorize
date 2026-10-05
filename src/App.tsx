import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { I18nContext, makeTranslate, resolveLang, useT } from './i18n'
import { DEFAULT_SETTINGS, loadSettings } from './lib/db'
import { href, useRoute } from './lib/route'
import { SettingsContext } from './settings'
import { CollectionView } from './views/CollectionView'
import { Home } from './views/Home'
import { Settings } from './views/Settings'
import { Study } from './views/Study'

function UpdatePrompt() {
  const t = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="toast" role="status">
      <span>{t('updateAvailable')}</span>
      <button className="button primary" onClick={() => void updateServiceWorker(true)}>
        {t('reload')}
      </button>
      <button className="button ghost" onClick={() => setNeedRefresh(false)}>
        {t('close')}
      </button>
    </div>
  )
}

export function App() {
  const settings = useLiveQuery(loadSettings) ?? DEFAULT_SETTINGS
  const route = useRoute()
  const i18n = useMemo(() => {
    const lang = resolveLang(settings.uiLang)
    return { lang, t: makeTranslate(lang) }
  }, [settings.uiLang])

  useEffect(() => {
    document.documentElement.lang = i18n.lang
  }, [i18n.lang])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.name])

  return (
    <SettingsContext.Provider value={settings}>
      <I18nContext.Provider value={i18n}>
        {route.name === 'home' && <Home />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'collection' && <CollectionView key={route.id} id={route.id} />}
        {route.name === 'study' && <Study key={href.study(route.id, route.options)} id={route.id} options={route.options} />}
        <UpdatePrompt />
      </I18nContext.Provider>
    </SettingsContext.Provider>
  )
}
