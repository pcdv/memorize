import { useMemo } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { useIntervalUnits, useT, type MessageKey } from '../i18n'
import type { StoredCard } from '../lib/db'
import { GRADES, previewIntervals } from '../lib/scheduler'

const labels: Record<Grade, MessageKey> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
}

export function GradeButtons({
  card,
  suggested,
  onGrade,
}: {
  card: StoredCard
  suggested?: Grade
  onGrade: (grade: Grade) => void
}) {
  const t = useT()
  const units = useIntervalUnits()
  const intervals = useMemo(() => previewIntervals(card, units), [card, units])
  return (
    <div className="grades">
      {GRADES.map((g, i) => (
        <button
          key={g}
          className={`grade grade-${labels[g]}${suggested === g ? ' suggested' : ''}`}
          onClick={() => onGrade(g)}
          aria-keyshortcuts={String(i + 1)}
        >
          <span className="grade-label">{t(labels[g])}</span>
          <span className="grade-interval">{intervals[g]}</span>
        </button>
      ))}
    </div>
  )
}
