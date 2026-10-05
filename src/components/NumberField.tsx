import { useEffect, useRef } from 'react'

/**
 * A whole-number input that saves once, when it is left (blur, Enter, or the page goes
 * away), rather than on every keystroke: typing "35" would otherwise save 0, 3, then 35.
 */
export function NumberField({
  label,
  value,
  onSave,
  max = 999,
}: {
  label: string
  value: number
  onSave: (n: number) => void
  max?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const saved = useRef(value)
  saved.current = value
  const save = useRef(onSave)
  save.current = onSave

  const commit = () => {
    const raw = input.current?.value.trim() ?? ''
    const n = Number(raw)
    if (raw !== '' && Number.isInteger(n) && n >= 0 && n <= max && n !== saved.current) {
      saved.current = n
      save.current(n)
    }
  }

  // Leaving the page by a link or the back gesture does not always blur the input.
  useEffect(() => commit, [])

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        ref={input}
        type="number"
        min={0}
        max={max}
        inputMode="numeric"
        defaultValue={value}
        key={value}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}
