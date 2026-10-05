import { State } from 'ts-fsrs'
import { languageName, useI18n } from '../i18n'
import type { CardDir } from '../lib/db'
import type { CollectionData } from '../lib/queries'
import { href } from '../lib/route'
import { buildQueue, type QueueOptions } from '../lib/scheduler'
import { Icon } from './Icon'

/**
 * Ways to keep studying when the regular queue is not enough: practice one direction
 * now, or learn a new batch beyond the daily limit.
 */
export function StudyMore({
  data,
  current = {},
  onRestart,
}: {
  data: CollectionData
  current?: QueueOptions
  /** Called instead of navigating when a choice leads to the current page. */
  onRestart?: () => void
}) {
  const { t, lang } = useI18n()
  const c = data.collection
  const queue = (options: QueueOptions) =>
    buildQueue(c, data.cards, data.reviewsToday, data.noteOrder, new Date(), options)
  const left = languageName(c.leftLang, lang) ?? t('leftSide')
  const right = languageName(c.rightLang, lang) ?? t('rightSide')

  const choices: { label: string; to: string }[] = []
  // Two choices may lead to the same cards: keep the first one.
  const offered = new Set<string>()
  const offer = (cards: { id: number }[], label: string, to: string) => {
    const key = cards.map((card) => card.id).sort((a, b) => a - b).join()
    if (cards.length === 0 || offered.has(key)) return
    offered.add(key)
    choices.push({ label, to })
  }

  const directions: CardDir[] = ['forward', 'reverse']
  for (const dir of directions) {
    if (dir === current.dir) continue
    const cards = queue({ dir, extra: true })
    const label = t(dir === 'forward' ? 'dirForward' : 'dirReverse', { left, right })
    offer(cards, t('practiceDir', { dir: label, n: cards.length }), href.study(c.id, { dir, extra: true }))
  }

  // A new batch only makes sense once the regular queue is done.
  if (queue({ dir: current.dir }).length === 0) {
    const more = { dir: current.dir, extra: true }
    const cards = queue(more).filter((card) => card.state === State.New)
    offer(cards, t('learnMore', { n: cards.length }), href.study(c.id, more))
  }

  if (choices.length === 0) return null
  return (
    <div className="study-more">
      <p className="field-label">{t('keepGoing')}</p>
      {choices.map((choice) => (
        <a
          key={choice.to}
          className="button"
          href={choice.to}
          onClick={(e) => {
            // Same URL: no hashchange event, so the session must be restarted by hand.
            if (window.location.hash === choice.to && onRestart) {
              e.preventDefault()
              onRestart()
            }
          }}
        >
          <Icon name="play" size={16} /> {choice.label}
        </a>
      ))}
    </div>
  )
}
