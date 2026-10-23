'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Delete, Flame, Volume2, VolumeX, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';

import { t } from '../lib/i18n/index.js';
import { MAX_TYPED, MINUS, readTyped, typedIsRight } from '../lib/math/numbers.js';
import { roundSaves } from '../lib/math/round-saves.js';
import { sendSave } from '../lib/math/send.js';
import { playEnd, playMiss, playRight } from '../lib/math/sound.js';
import { choiceForKey, makeRound, ROUND_LENGTH, starsFor } from '../lib/math/topics.js';
import { animalPicture } from '../lib/math/animals.js';

import { answerText, askText, QuestionPicture, Stars, Sum } from './math-pieces.jsx';

/** A new round's starting seed. Called only from a press, never while a page opens. */
function freshSeed() {
  return Math.floor(Math.random() * 4294967296);
}

/** One of the four praise lines, in turn. @param {number} at */
function praiseKey(at) {
  return `math.round.right${(at % 4) + 1}`;
}

/**
 * Whether an answer from the round address is a saved round.
 *
 * @param {any} value
 */
function isRound(value) {
  const whole = (number) => Number.isSafeInteger(number) && number >= 0;
  return Boolean(value)
    && typeof value.topic === 'string'
    && whole(value.stars)
    && whole(value.correct)
    && value.score !== null
    && typeof value.score === 'object'
    && whole(value.score.rounds)
    && whole(value.score.bestStars)
    && whole(value.score.bestCorrect)
    && whole(value.score.answered)
    && whole(value.score.correct);
}

/** Lets a key press reach the page, not a button that kept focus after a click. */
function letGo(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

/**
 * One round of ten questions, then its stars.
 *
 * Levels 1 and 2 answer by pressing a choice; the others type on the pad or
 * the keyboard (digits, Backspace, Enter, and minus, the decimal mark or the
 * fraction line where the topic needs one). After each answer the screen says
 * right or not, shows the worked line, and waits for Next.
 *
 * The round is saved once, when its tenth question is answered; "See my
 * stars" then shows how the save went, and "New best!" shows only once the
 * save is confirmed. A round stopped before its tenth answer is not saved. A
 * refusal that comes back after Stop or Play again goes to the topics
 * screen's problem line (`lib/math/round-saves.js`), and that line, a
 * refused Sound save included, shows on the round too (`notice`).
 *
 * Each new question takes the keyboard focus, so the next Tab reaches its
 * answers, and the result of each answer is said in a live line that stays on
 * the screen for the whole round. The end card's heading takes the focus. A
 * held Enter or Space does nothing past its first press, so it cannot skip
 * the worked line or the stars.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   player: { id: number, name: string, animal: string, soundOn: boolean },
 *   topicId: string,
 *   best: null | { rounds: number, bestCorrect: number },
 *   notice: string,
 *   onSaved: (topic: string, score: any) => void,
 *   onSaveProblem: (topic: string, problemKey: string) => void,
 *   onLeave: () => void,
 *   onSound: (soundOn: boolean) => void,
 * }} props
 */
export function RoundPlay({ locale, player, topicId, best, notice, onSaved, onSaveProblem, onLeave, onSound }) {
  const [seed, setSeed] = useState(freshSeed);
  const questions = useMemo(() => makeRound(topicId, seed), [topicId, seed]);
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState('');
  const [result, setResult] = useState(/** @type {null | { right: boolean, given: unknown }} */ (null));
  const [right, setRight] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(/** @type {null | { correct: number, stars: number, newBest: boolean, saving: boolean, problem: string }} */ (null));
  const [ended, setEnded] = useState(false);
  const [bestSoFar, setBestSoFar] = useState(best);
  const questionCard = useRef(/** @type {HTMLDivElement | null} */ (null));
  const endHeading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const parent = useRef({ onSaved, onSaveProblem });
  parent.current = { onSaved, onSaveProblem };
  const saves = useRef(/** @type {null | ReturnType<typeof roundSaves>} */ (null));
  if (saves.current === null) {
    saves.current = roundSaves({
      scores: (score) => {
        parent.current.onSaved(topicId, score);
        setBestSoFar(score);
      },
      round: (problemKey) => {
        setRound((now) => (now === null ? now : { ...now, saving: false, problem: problemKey }));
      },
      late: (problemKey) => parent.current.onSaveProblem(topicId, problemKey),
    });
  }

  const question = questions[at];
  const soundOn = player.soundOn;
  const end = ended ? round : null;

  // A new question, or a new round, takes the focus.
  useEffect(() => {
    questionCard.current?.focus();
  }, [at, seed]);

  // The end card's heading takes the focus, so a key still held from the
  // last answer presses nothing on it.
  useEffect(() => {
    if (ended) endHeading.current?.focus();
  }, [ended]);

  // This round is on the screen until the round screen goes.
  useEffect(() => {
    const mine = saves.current;
    mine.begin();
    return () => mine.leave();
  }, []);

  function answer(given, isRight) {
    if (result !== null || ended) return;
    setResult({ right: isRight, given });
    setHint('');
    if (isRight) {
      setRight((count) => count + 1);
      setStreak((count) => count + 1);
      if (soundOn) playRight();
    } else {
      setStreak(0);
      if (soundOn) playMiss();
    }
    if (at + 1 === ROUND_LENGTH) {
      const correct = right + (isRight ? 1 : 0);
      const newBest = bestSoFar !== null && bestSoFar.rounds > 0 && correct > bestSoFar.bestCorrect;
      setRound({ correct, stars: starsFor(correct), newBest, saving: true, problem: '' });
      saveRound(correct);
    }
  }

  function choose(value) {
    answer(value, value === question.answer.value);
  }

  function check() {
    if (result !== null) return;
    if (typed === '') {
      setHint('math.round.typeFirst');
      return;
    }
    if (readTyped(typed) === null) {
      setHint('math.round.unreadable');
      return;
    }
    answer(typed, typedIsRight(typed, question.answer));
  }

  /** @param {string} key */
  function press(key) {
    if (result !== null) return;
    setHint('');
    setTyped((now) => {
      if (key === 'delete') return now.slice(0, -1);
      if (now.length >= MAX_TYPED) return now;
      if (key === MINUS) return now === '' ? MINUS : now;
      if (key === '.' || key === ',') return now.includes('.') || now.includes(',') ? now : `${now === '' || now === MINUS ? `${now}0` : now}${key}`;
      if (key === '/') return now === '' || now === MINUS || now.includes('/') ? now : `${now}/`;
      return `${now}${key}`;
    });
  }

  function saveRound(correct) {
    saves.current.save(async () => {
      const answerBack = await sendSave('/api/rounds', { playerId: player.id, topic: topicId, correct }, 'round');
      if (answerBack.problem !== undefined) return answerBack;
      return isRound(answerBack.value) ? { value: answerBack.value.score } : { problem: 'error.saveUnconfirmed' };
    });
  }

  function next() {
    if (result === null) return;
    if (at + 1 < ROUND_LENGTH) {
      setAt(at + 1);
      setTyped('');
      setResult(null);
      return;
    }
    if (round === null) return;
    setEnded(true);
    if (soundOn) playEnd(round.stars);
  }

  function again() {
    saves.current.begin();
    setSeed(freshSeed());
    setAt(0);
    setTyped('');
    setHint('');
    setResult(null);
    setRight(0);
    setStreak(0);
    setRound(null);
    setEnded(false);
  }

  // The keyboard: the latest handlers, read by one listener for the whole round.
  const keys = useRef({ press, check, next, choose, question, result, end });
  keys.current = { press, check, next, choose, question, result, end };
  useEffect(() => {
    function onKey(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A held Enter or Space repeats: only its first press counts, so it
      // cannot press Next past the worked line or Play again past the stars.
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        return;
      }
      const target = event.target;
      // A focused button answers its own Enter and Space.
      if (target instanceof HTMLElement && target.closest('button, a, [role="dialog"]')) {
        if (event.key === 'Enter' || event.key === ' ') return;
      }
      const now = keys.current;
      if (now.end !== null) return;
      if (now.result !== null) {
        if (event.key === 'Enter') {
          event.preventDefault();
          now.next();
        }
        return;
      }
      if (now.question.choices !== null) {
        const choice = choiceForKey(now.question, event.key);
        if (choice !== null) {
          event.preventDefault();
          now.choose(choice);
        }
        return;
      }
      const pad = now.question.pad;
      if (/^[0-9]$/u.test(event.key)) now.press(event.key);
      else if (event.key === 'Backspace') now.press('delete');
      else if (event.key === 'Enter') now.check();
      else if (pad.minus && (event.key === '-' || event.key === MINUS)) now.press(MINUS);
      else if (pad.point && (event.key === '.' || event.key === ',')) now.press(locale === 'tr' ? ',' : '.');
      else if (pad.slash && event.key === '/') now.press('/');
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locale]);

  const header = (
    <header className="math-bar">
      {end === null ? (
        <Button variant="ghost" onClick={onLeave} title={t('math.round.stopNote', locale)}>
          <X aria-hidden="true" />
          {t('math.round.stop', locale)}
        </Button>
      ) : <span />}
      <span className="math-bar-topic">
        <span aria-hidden="true">{animalPicture(player.animal)} </span>
        {`${player.name} · ${t(`math.topic.${topicId}`, locale)}`}
      </span>
      <div className="math-bar-end">
        {end === null && streak >= 2 ? (
          <span className="math-streak">
            <Flame aria-hidden="true" className="math-flame" />
            {t('math.round.streak', locale, { count: streak })}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(soundOn ? 'math.round.soundOff' : 'math.round.soundOn', locale)}
          title={t(soundOn ? 'math.round.soundOff' : 'math.round.soundOn', locale)}
          onClick={(event) => { letGo(event); onSound(!soundOn); }}
        >
          {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        </Button>
      </div>
    </header>
  );

  const answered = result !== null;
  const correctText = answerText(question.answer, locale);
  const feedbackText = !answered
    ? ''
    : result.right
      ? t(praiseKey(at), locale)
      : `${t('math.round.wrong', locale)} ${t('math.round.answerWas', locale, { answer: correctText })}`;
  // Said by a screen reader when it changes. It stays in place for the whole
  // round, so a line that appears with its words already in it is not missed.
  const spoken = (
    <p className="sr-only" aria-live="polite">
      {end !== null ? `${t(`math.end.title${end.stars}`, locale)} ${t('math.end.score', locale, { correct: end.correct })}` : feedbackText}
    </p>
  );

  // Problems from the topics screen: a refused Sound save during this round,
  // or a refused round that is no longer on the screen.
  const noticeLine = notice !== '' ? <p className="math-problem" role="alert">{notice}</p> : null;

  if (end !== null) {
    const confirmed = !end.saving && end.problem === '';
    return (
      <div className="math-shell">
        {header}
        {spoken}
        {noticeLine}
        <Card className="math-end">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Stars count={end.stars} locale={locale} size="big" />
            <h1 className="math-title" ref={endHeading} tabIndex={-1}>{t(`math.end.title${end.stars}`, locale)}</h1>
            <p className="text-lg">{t('math.end.score', locale, { correct: end.correct })}</p>
            {end.newBest && confirmed ? <span className="math-badge rounded-full">{t('math.end.newBest', locale)}</span> : null}
            <p className={end.problem !== '' ? 'math-problem' : 'math-note'} role="status">
              {end.saving
                ? t('math.end.saving', locale)
                : end.problem !== ''
                  ? `${t('math.end.notSaved', locale)} ${t(end.problem, locale)}`
                  : t('math.end.saved', locale)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" className="math-big-button" onClick={again}>{t('math.end.again', locale)}</Button>
              <Button size="lg" variant="outline" className="math-big-button" onClick={onLeave}>{t('math.end.back', locale)}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="math-shell">
      {header}
      {spoken}
      {noticeLine}
      <Progress value={((at + (answered ? 1 : 0)) / ROUND_LENGTH) * 100} className="math-progress">
        <ProgressLabel>{t('math.round.question', locale, { number: at + 1 })}</ProgressLabel>
      </Progress>

      <Card
        className="math-question"
        ref={questionCard}
        tabIndex={-1}
        role="group"
        aria-label={t('math.round.question', locale, { number: at + 1 })}
      >
        <CardContent className="flex flex-col items-center gap-5 text-center">
          {question.ask !== null ? <p className="math-ask">{askText(question.ask, locale)}</p> : null}
          <QuestionPicture picture={question.picture} locale={locale} />
          {question.show !== null ? <Sum pieces={question.show} locale={locale} answer={answered ? question.answer : null} /> : null}
        </CardContent>
      </Card>

      {question.choices !== null ? (
        <div className="math-choices" role="group" aria-label={t('math.round.chooseAnswer', locale)}>
          {question.choices.map((choice) => {
            const isAnswer = choice === question.answer.value;
            const mark = !answered ? '' : isAnswer ? 'math-choice-right' : choice === result.given ? 'math-choice-miss' : 'math-choice-quiet';
            return (
              <Button
                key={String(choice)}
                variant="outline"
                className={`math-choice ${mark}`}
                disabled={answered}
                onClick={(event) => { letGo(event); choose(choice); }}
              >
                {answerText({ kind: typeof choice === 'number' ? 'number' : 'sign', value: choice }, locale)}
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="math-typing">
          <div
            className={`math-typed ${answered ? (result.right ? 'math-typed-right' : 'math-typed-miss') : ''}`}
            role="status"
            aria-label={t('math.round.yourAnswer', locale)}
          >
            {typed === '' ? <span className="math-typed-empty">?</span> : typed}
          </div>
          {!answered ? (
            <>
              <div className="math-pad" role="group" aria-label={t('math.round.pad', locale)}>
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
                  <Button key={digit} variant="secondary" className="math-key" onClick={(event) => { letGo(event); press(digit); }}>
                    {digit}
                  </Button>
                ))}
                {question.pad.minus ? (
                  <Button variant="secondary" className="math-key" aria-label={t('math.round.minus', locale)} onClick={(event) => { letGo(event); press(MINUS); }}>
                    {MINUS}
                  </Button>
                ) : <span />}
                <Button variant="secondary" className="math-key" onClick={(event) => { letGo(event); press('0'); }}>0</Button>
                {question.pad.point ? (
                  <Button
                    variant="secondary"
                    className="math-key"
                    aria-label={t('math.round.point', locale)}
                    onClick={(event) => { letGo(event); press(locale === 'tr' ? ',' : '.'); }}
                  >
                    {locale === 'tr' ? ',' : '.'}
                  </Button>
                ) : question.pad.slash ? (
                  <Button variant="secondary" className="math-key" aria-label={t('math.round.slash', locale)} onClick={(event) => { letGo(event); press('/'); }}>
                    /
                  </Button>
                ) : <span />}
              </div>
              <div className="flex w-full max-w-xs gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="math-big-button"
                  aria-label={t('math.round.delete', locale)}
                  title={t('math.round.delete', locale)}
                  onClick={(event) => { letGo(event); press('delete'); }}
                >
                  <Delete aria-hidden="true" />
                </Button>
                <Button size="lg" className="math-big-button flex-1" onClick={(event) => { letGo(event); check(); }}>
                  {t('math.round.check', locale)}
                </Button>
              </div>
              {/* Always in place, so the words are said when they change. */}
              <p className={hint !== '' ? 'math-note' : 'sr-only'} role="status">{hint !== '' ? t(hint, locale) : ''}</p>
            </>
          ) : null}
        </div>
      )}

      {answered ? (
        <Card className={result.right ? 'math-feedback math-feedback-right' : 'math-feedback math-feedback-miss'}>
          <CardContent className="flex flex-col gap-3">
            <p className="math-feedback-title">{feedbackText}</p>
            <div className="math-worked">
              {question.worked.map((line, index) => (
                <Sum key={index} pieces={line} locale={locale} size="small" />
              ))}
            </div>
            <Button size="lg" className="math-big-button self-start" onClick={next} autoFocus>
              {at + 1 < ROUND_LENGTH ? t('math.round.next', locale) : t('math.round.finish', locale)}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <p className="math-note">{t('math.round.stopNote', locale)}</p>
    </div>
  );
}
