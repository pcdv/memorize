import { COMMON_LANGS, languageName, useI18n } from '../i18n'

export function LangPicker({
  value,
  onChange,
  label,
}: {
  value?: string
  onChange: (lang: string | undefined) => void
  label: string
}) {
  const { t, lang } = useI18n()
  const codes = value && !COMMON_LANGS.includes(value) ? [value, ...COMMON_LANGS] : COMMON_LANGS
  const options = codes
    .map((code) => ({ code, name: languageName(code, lang) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, lang))
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('langNone')}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}
