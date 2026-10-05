import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Rating, State, type Grade } from 'ts-fsrs'
import { useLiveQuery } from 'dexie-react-hooks'
import { GradeButtons } from '../components/GradeButtons'
import { StudyMore } from '../components/StudyMore'
import { Icon } from '../components/Icon'
import { languageName, useI18n } from '../i18n'
import { checkAnswer, normalize, type Check } from '../lib/answer'
import { saveSettings, type Collection, type Note, type StoredCard } from '../lib/db'
import { loadCollectionData } from '../lib/queries'
import { href } from '../lib/route'
import { buildQueue, gradeCard, type QueueOptions } from '../lib/scheduler'
import { useSettings } from '../settings'

interface Session {
  collection: Collection
  notes: Map<number, Note>
  queue: StoredCard[]
  /** Cards graded earlier in this session that are due again within the hour. */
  learning: StoredCard[]
  current?: StoredCard
  reviewed: number
}

const LEARNING_WINDOW_MS = 60 * 60 * 1000

/** Learning cards that are due come first, then the queue, then learning cards ahead of time. */
function advance(s: Omit<Session, 'current'>): Session {
  const now = Date.now()
  const learning = [...s.learning].sort((a, b) => a.due.getTime() - b.due.getTime())
  if (learning[0] && learning[0].due.getTime() <= now) {
    return { ...s, current: learning[0], learning: learning.slice(1) }
  }
  if (s.queue.length > 0) return { ...s, current: s.queue[0], queue: s.queue.slice(1), learning }
  return { ...s, current: learning[0], learning: learning.slice(1) }
}

/** Offers more practice at the end of a session, from fresh data (the session changed it). */
function DoneMore({ id, options, onRestart }: { id: number; options: QueueOptions; onRestart: () => void }) {
  const data = useLiveQuery(() => loadCollectionData(id), [id])
  return data ? <StudyMore data={data} current={options} onRestart={onRestart} /> : null
}

/** `options` must not change during a session: App remounts Study when the route changes. */
export function Study({ id, options }: { id: number; options: QueueOptions }) {
  const { t, lang } = useI18n()
  const settings = useSettings()
  const mode = settings.answerMode
  const [session, setSession] = useState<Session | null>()
  // Bumped to start a new session on the same route (e.g. "learn more" after a "learn more").
  const [round, setRound] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<Check>()
  const busy = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadCollectionData(id).then((data) => {
      if (!data) return setSession(null)
      const queue = buildQueue(data.collection, data.cards, data.reviewsToday, data.noteOrder, new Date(), options)
      setSession(advance({ collection: data.collection, notes: data.notes, queue, learning: [], reviewed: 0 }))
    })
  }, [id, round])

  const card = session?.current
  const note = card && session.notes.get(card.noteId)
  const forward = card?.dir === 'forward'
  const question = note && (forward ? note.left : note.right)
  const answer = note && (forward ? note.right : note.left)
  // Cards asking the same question ("reporter": Wartawan, Jurnalis) accept each other's answers.
  const accepted = useMemo(() => {
    if (!session || question === undefined || answer === undefined) return []
    const q = normalize(question)
    const others = [...session.notes.values()]
      .filter((n) => n.id !== note?.id && normalize(forward ? n.left : n.right) === q)
      .map((n) => (forward ? n.right : n.left))
    return [answer, ...others]
  }, [session, note, question, answer, forward])
  const questionLang = forward ? session?.collection.leftLang : session?.collection.rightLang
  const answerLang = forward ? session?.collection.rightLang : session?.collection.leftLang
  const showAnswer = revealed || check !== undefined

  const grade = useCallback(
    async (g: Grade) => {
      if (!session || !card || busy.current) return
      busy.current = true
      try {
        const updated = await gradeCard(card, g)
        const again =
          (updated.state === State.Learning || updated.state === State.Relearning) &&
          updated.due.getTime() - Date.now() < LEARNING_WINDOW_MS
        setSession(
          advance({
            ...session,
            learning: again ? [...session.learning, updated] : session.learning,
            reviewed: session.reviewed + 1,
          }),
        )
        setRevealed(false)
        setTyped('')
        setCheck(undefined)
      } finally {
        busy.current = false
      }
    },
    [session, card],
  )

  // Keep the keyboard up between cards in typed mode.
  useEffect(() => {
    if (mode === 'type' && card && !check) input.current?.focus()
  }, [mode, card, check])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const inInput = e.target instanceof HTMLInputElement && !e.target.readOnly
      if (inInput) return
      if (!showAnswer && mode === 'reveal' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (showAnswer && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void grade(Number(e.key) as Grade)
      } else if (showAnswer && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        void grade(check?.suggested ?? Rating.Good)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAnswer, mode, grade, check])

  const submitTyped = (e: FormEvent) => {
    e.preventDefault()
    if (answer !== undefined && !check) setCheck(checkAnswer(typed, accepted))
  }

  const switchMode = () => {
    void saveSettings({ answerMode: mode === 'reveal' ? 'type' : 'reveal' })
    setCheck(undefined)
    setRevealed(false)
  }

  if (session === undefined) return null
  if (session === null) {
    return (
      <main className="page study">
        <a className="button" href={href.home}>{t('backHome')}</a>
      </main>
    )
  }

  const remaining = session.queue.length + session.learning.length + (card ? 1 : 0)
  const progress = session.reviewed / Math.max(1, session.reviewed + remaining)
  const answerLangName = languageName(answerLang, lang)

  return (
    <main className="page study">
      <header className="study-bar">
        <a className="icon-button" href={href.collection(session.collection.id)} aria-label={t('back')}>
          <Icon name="close" />
        </a>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="muted remaining">{t('remaining', { n: remaining })}</span>
        <button
          className="icon-button"
          onClick={switchMode}
          title={t(mode === 'reveal' ? 'modeType' : 'modeReveal')}
          aria-label={t(mode === 'reveal' ? 'modeType' : 'modeReveal')}
        >
          <Icon name={mode === 'reveal' ? 'keyboard' : 'eye'} />
        </button>
      </header>

      {!card || !note ? (
        <section className="done">
          <div className="done-badge" aria-hidden="true">
            <Icon name="check" size={40} />
          </div>
          <h2>{t('doneTitle')}</h2>
          <p className="muted">{session.reviewed > 0 ? t('doneText', { n: session.reviewed }) : t('doneNothing')}</p>
          <a className="button primary large" href={href.home}>
            {t('backHome')}
          </a>
          <DoneMore id={id} options={options} onRestart={() => setRound((r) => r + 1)} />
        </section>
      ) : (
        <>
          <article className={`flashcard${showAnswer ? ' flipped' : ''}`} key={`${card.id}-${session.reviewed}`}>
            <p className="side-label">{languageName(questionLang, lang)}</p>
            <p className="question" lang={questionLang}>
              {question}
            </p>
            {showAnswer && (
              <div className="answer-block">
                <hr />
                {check && (
                  <p className={`verdict verdict-${check.verdict}`}>
                    {t(check.verdict)}
                    {check.verdict !== 'correct' && typed.trim() && (
                      <span className="typed">
                        {t('youTyped')} <s lang={answerLang}>{typed}</s>
                      </span>
                    )}
                  </p>
                )}
                <p className="side-label">{answerLangName}</p>
                <p className="answer" lang={answerLang}>
                  {answer}
                </p>
              </div>
            )}
          </article>

          <footer className="study-actions">
            {mode === 'type' && !check && (
              <form className="typed-answer" onSubmit={submitTyped}>
                <div className="input-wrap">
                  <input
                    ref={input}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={t('typeAnswer')}
                    lang={answerLang}
                    inputMode={answer && /^[\d\s.,:+-]+$/.test(answer) ? 'decimal' : 'text'}
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  {answerLang && (
                    <span className="kbd-badge" title={t('keyboardHint', { lang: answerLangName ?? answerLang })}>
                      <Icon name="keyboard" size={14} /> {answerLang.split('-')[0]!.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="typed-buttons">
                  <button type="button" className="button ghost" onClick={() => setCheck(checkAnswer('', answer!))}>
                    {t('showAnswer')}
                  </button>
                  <button type="submit" className="button primary">
                    {t('check')}
                  </button>
                </div>
              </form>
            )}
            {mode === 'reveal' && !showAnswer && (
              <button className="button primary large reveal" onClick={() => setRevealed(true)}>
                {t('showAnswer')}
              </button>
            )}
            {showAnswer && <GradeButtons card={card} suggested={check?.suggested} onGrade={(g) => void grade(g)} />}
            {(mode === 'reveal' || showAnswer) && <p className="hint center desktop-only">{t('shortcuts')}</p>}
          </footer>
        </>
      )}
    </main>
  )
}
