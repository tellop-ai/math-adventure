'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Delete, Flag, Flame, MapPin, Medal, NotebookPen, Speech, Volume2, VolumeX, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

import { t } from '../lib/i18n/index.js';
import { MAX_TYPED, MINUS, readTyped, typedIsRight } from '../lib/math/numbers.js';
import { chooseBox, eraseDigit, moveCursor, paperAnswer, paperFor, paperHint, solvedPaper, startWriting, writeDigit } from '../lib/math/paper.js';
import { CHIME_MOMENTS, isGate, LANDS, levelOfRound, makeRoundFor, nextAfter, PANEL_MOMENTS, progressOf, rewardsFor } from '../lib/math/path.js';
import { roundSaves } from '../lib/math/round-saves.js';
import { sendSave } from '../lib/math/send.js';
import { playEnd, playLevel, playMiss, playOpen, playRight, playRun, END_LENGTH } from '../lib/math/sound.js';
import { choiceForKey, ROUND_LENGTH, starsFor } from '../lib/math/topics.js';
import { animalPicture } from '../lib/math/animals.js';
import { spokenQuestion } from '../lib/math/words.js';

import { useHelperVoice } from './helper-voice.jsx';
import { answerText, askText, QuestionPicture, roundName, Stars, Sum, sumText } from './math-pieces.jsx';
import { PaperBoard } from './paper-board.jsx';
import { RoundHelper } from './round-helper.jsx';

/** A new round's starting seed. Called only from a press, never while a page opens. */
function freshSeed() {
  return Math.floor(Math.random() * 4294967296);
}

/** One of the four praise lines, in turn. @param {number} at */
function praiseKey(at) {
  return `math.round.right${(at % 4) + 1}`;
}

/** Right answers in a row that are a small milestone of their own: a brighter tone. */
const RUN_MARKS = Object.freeze([5, 10]);

/** The run counter shows from this many right answers in a row. */
const RUN_SHOWN = 3;

/**
 * The words for the end card's first button, the next step on the path.
 *
 * @param {{ id: string, kind: 'stop' | 'gate' | 'level', level: number }} next
 * @param {'en' | 'tr'} locale
 */
function nextWords(next, locale) {
  if (next.kind === 'gate') return t('math.end.takeGate', locale);
  if (next.kind === 'level') return t('math.end.goLevel', locale, { level: next.level });
  return t('math.end.next', locale, { name: roundName(next.id, locale) });
}

/**
 * The highlighted panel of a big moment at a round's end, a level opened or
 * the finish: its picture, its headline and one line.
 *
 * @param {{ moment: ReturnType<typeof rewardsFor>, animal: string, locale: 'en' | 'tr' }} props
 */
function MomentPanel({ moment, animal, locale }) {
  const { headline, level } = moment;
  const picture = headline === 'levelOpened' ? (
    <>
      <span className="math-moment-land">{LANDS[level - 1].picture}</span>
      <span className="math-moment-animal rounded-full">{animalPicture(animal)}</span>
    </>
  ) : <Crown />;
  const values = { level, land: t(`math.land.${LANDS[level - 1].key}`, locale) };
  return (
    <div className="math-moment rounded-md" data-moment={headline}>
      <span className="math-moment-picture rounded-full" aria-hidden="true">{picture}</span>
      <p className="math-moment-title">{t(`math.end.moment.${headline}`, locale, values)}</p>
      <p className="text-sm">{t(`math.end.moment.${headline}Body`, locale, values)}</p>
    </div>
  );
}

/**
 * The one headline line of a smaller moment: a stop or the big challenge
 * opened, or a badge won.
 *
 * @param {{ moment: ReturnType<typeof rewardsFor>, locale: 'en' | 'tr' }} props
 */
function MomentLine({ moment, locale }) {
  const { headline } = moment;
  const icon = headline === 'stopOpened' ? <MapPin aria-hidden="true" /> : headline === 'gateOpened' ? <Flag aria-hidden="true" /> : <Medal aria-hidden="true" />;
  return <p className="math-moment-headline rounded-full">{icon}{t(`math.end.moment.${headline}`, locale)}</p>;
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

/** The paper's note under it, for the sums that are written their own way. */
const PAPER_NOTES = Object.freeze({ long: 'math.paper.noteLong', share: 'math.paper.noteShare' });

/** The arrow keys that move the cursor on the paper. */
const ARROWS = Object.freeze({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' });

/** Lets a key press reach the page, not a button that kept focus after a click. */
function letGo(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

/**
 * One round of ten questions, then its stars: a stop's topic, or a level's big
 * challenge (two questions from each of its stops, `makeRoundFor`).
 *
 * Levels 1 and 2 answer by pressing a choice; the others type on the pad or
 * the keyboard (digits, Backspace, Enter, and minus, the decimal mark or the
 * fraction line where the topic needs one). After each answer the screen says
 * right or not, shows the worked line, and waits for Next.
 *
 * The round is saved once, when its tenth question is answered; "See my
 * stars" then shows how the save went, and "New best!" shows only once the
 * save is confirmed. So does what the save opened on the path: the end card
 * shows one moment, the biggest (`rewardsFor`), with one sound after the
 * stars, and its first button is the next step on the path when this round
 * did what its point needs (`onNext`). Below the mark it says the mark. A
 * round stopped before its tenth answer is not saved. A
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
 * A big sum (`PAPER_TOPICS`) can be worked out on squared paper
 * (`app/paper-board.jsx`), a division laid out as the page's language writes
 * it. While the paper is open, the pad and the keys write
 * on it (the arrow keys move its cursor), the answer box shows its answer row,
 * and Check checks that row; put away, the answer box keeps what the row says.
 * Nothing else on the paper is checked or saved. Once opened, the paper opens
 * again, empty, on each next big sum of the round. After an answer written on
 * it, the feedback shows the same paper filled in right.
 *
 * Under the answer is the helper (`app/round-helper.jsx`): a hint, an
 * explanation and the child's own questions, from AI on the person's
 * allowance, and Read it to me on the question. Keys typed in the helper's
 * field are the child's words, never an answer.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   player: { id: number, name: string, animal: string, level: number, soundOn: boolean },
 *   roundId: string,
 *   scores: Record<string, { rounds: number, bestStars: number, bestCorrect: number }>,
 *   notice: string,
 *   onSaved: (topic: string, score: any) => void,
 *   onSaveProblem: (topic: string, problemKey: string) => void,
 *   onLeave: () => void,
 *   onNext: (next: { id: string, kind: 'stop' | 'gate' | 'level', level: number }) => void,
 *   onSound: (soundOn: boolean) => void,
 * }} props
 */
export function RoundPlay({ locale, player, roundId, scores, notice, onSaved, onSaveProblem, onLeave, onNext, onSound }) {
  const [seed, setSeed] = useState(freshSeed);
  const questions = useMemo(() => makeRoundFor(roundId, seed), [roundId, seed]);
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState('');
  const [result, setResult] = useState(/** @type {null | { right: boolean, given: unknown, onPaper: boolean }} */ (null));
  // The paper: whether it is open in this round, and what is written on this question's paper.
  const [paperOn, setPaperOn] = useState(false);
  const [writing, setWriting] = useState(/** @type {null | import('../lib/math/paper.js').Writing} */ (null));
  const [right, setRight] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(/** @type {null | { correct: number, stars: number, newBest: boolean, saving: boolean, problem: string, moment: null | ReturnType<typeof rewardsFor> }} */ (null));
  const [ended, setEnded] = useState(false);
  const [bestSoFar, setBestSoFar] = useState(scores[roundId] ?? null);
  const voice = useHelperVoice(locale);
  // The helper's refusals that stay for this round screen: AI's, and Ask out loud's own.
  const [helperStops, setHelperStops] = useState({ ai: '', speak: '' });
  const questionCard = useRef(/** @type {HTMLDivElement | null} */ (null));
  const endHeading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const parent = useRef({ onSaved, onSaveProblem, scores, placement: player.level });
  parent.current = { onSaved, onSaveProblem, scores, placement: player.level };
  // Where the player was on the path just before the confirmed save, and after it.
  const saved = useRef(/** @type {null | { before: ReturnType<typeof progressOf>, after: ReturnType<typeof progressOf> }} */ (null));
  // When the stars were shown, so the moment's sound comes after their notes.
  const endedAt = useRef(0);
  const momentPlayed = useRef(false);
  const saves = useRef(/** @type {null | ReturnType<typeof roundSaves>} */ (null));
  if (saves.current === null) {
    saves.current = roundSaves({
      scores: (score) => {
        const { scores: prior, placement } = parent.current;
        saved.current = { before: progressOf(placement, prior), after: progressOf(placement, { ...prior, [roundId]: score }) };
        parent.current.onSaved(roundId, score);
        // A late answer for an older round never puts back a row that knows fewer rounds.
        setBestSoFar((now) => (now !== null && now.rounds > score.rounds ? now : score));
      },
      round: (problemKey) => {
        const pair = saved.current;
        setRound((now) => {
          if (now === null) return now;
          const moment = problemKey === '' && pair !== null
            ? rewardsFor(pair.before, pair.after, roundId, { stars: now.stars, newBest: now.newBest })
            : null;
          return { ...now, saving: false, problem: problemKey, moment };
        });
      },
      late: (problemKey) => parent.current.onSaveProblem(roundId, problemKey),
    });
  }

  const question = questions[at];
  const soundOn = player.soundOn;
  const end = ended ? round : null;
  const paper = useMemo(() => paperFor(question, locale), [question, locale]);
  const writingNow = paper === null ? null : writing ?? startWriting(paper);
  const onPaper = paperOn && paper !== null && result === null && !ended;
  const paperRead = writingNow === null ? null : paperAnswer(paper, writingNow.cells, locale);

  // A new question, or a new round, takes the focus, and nothing read for the last one goes on.
  const quietVoice = voice.quiet;
  useEffect(() => {
    questionCard.current?.focus();
    quietVoice();
  }, [at, seed, quietVoice]);

  // The end card's heading takes the focus, so a key still held from the
  // last answer presses nothing on it.
  useEffect(() => {
    if (ended) endHeading.current?.focus();
  }, [ended]);

  // One sound for what the save opened, once, after the stars' notes: the short
  // tune for a level or the finish, a chime for a stop, the challenge or a badge.
  // A moment shown with Sound off stays quiet, even if Sound is turned on after.
  const momentNow = ended && round !== null ? round.moment?.headline ?? '' : '';
  useEffect(() => {
    if (momentNow === '' || momentPlayed.current) return;
    momentPlayed.current = true;
    if (!soundOn) return;
    const after = Math.max(0, END_LENGTH - (Date.now() - endedAt.current) / 1000);
    if (PANEL_MOMENTS.includes(momentNow)) playLevel(after);
    else if (CHIME_MOMENTS.includes(momentNow)) playOpen(after);
  }, [momentNow, soundOn]);

  // The buttons wait for the save's answer, so the next step never jumps in
  // under a finger; a save slower than two seconds shows them anyway.
  const [slowSave, setSlowSave] = useState(false);
  const waitingSave = ended && round !== null && round.saving;
  useEffect(() => {
    if (!waitingSave) return undefined;
    const timer = setTimeout(() => setSlowSave(true), 2000);
    return () => clearTimeout(timer);
  }, [waitingSave]);

  // This round is on the screen until the round screen goes.
  useEffect(() => {
    const mine = saves.current;
    mine.begin();
    return () => mine.leave();
  }, []);

  function answer(given, isRight, written = false) {
    if (result !== null || ended) return;
    setResult({ right: isRight, given, onPaper: written });
    setHint('');
    if (isRight) {
      setRight((count) => count + 1);
      setStreak((count) => count + 1);
      if (soundOn) {
        if (RUN_MARKS.includes(streak + 1)) playRun();
        else playRight();
      }
    } else {
      setStreak(0);
      if (soundOn) playMiss();
    }
    if (at + 1 === ROUND_LENGTH) {
      const correct = right + (isRight ? 1 : 0);
      const newBest = bestSoFar !== null && bestSoFar.rounds > 0 && correct > bestSoFar.bestCorrect;
      setRound({ correct, stars: starsFor(correct), newBest, saving: true, problem: '', moment: null });
      saveRound(correct);
    }
  }

  function choose(value) {
    answer(value, value === question.answer.value);
  }

  function check() {
    if (result !== null) return;
    if (onPaper) {
      if ('problem' in paperRead) {
        setHint(paperHint(paper, paperRead.problem));
        return;
      }
      answer(paperRead.text, typedIsRight(paperRead.text, question.answer), true);
      return;
    }
    if (typed === '') {
      setHint('math.round.typeFirst');
      return;
    }
    if (readTyped(typed) === null) {
      setHint('math.round.unreadable');
      return;
    }
    // Worked on the paper and then put away: the feedback still shows the paper filled in right.
    answer(typed, typedIsRight(typed, question.answer), writing !== null && Object.keys(writing.cells).length > 0);
  }

  /** @param {string} key */
  function press(key) {
    if (result !== null) return;
    setHint('');
    if (onPaper) {
      setWriting((now) => (key === 'delete' ? eraseDigit(paper, now ?? startWriting(paper)) : writeDigit(paper, now ?? startWriting(paper), key)));
      return;
    }
    setTyped((now) => {
      if (key === 'delete') return now.slice(0, -1);
      if (now.length >= MAX_TYPED) return now;
      if (key === MINUS) return now === '' ? MINUS : now;
      if (key === '.' || key === ',') return now.includes('.') || now.includes(',') ? now : `${now === '' || now === MINUS ? `${now}0` : now}${key}`;
      if (key === '/') return now === '' || now === MINUS || now.includes('/') ? now : `${now}/`;
      return `${now}${key}`;
    });
  }

  /** @param {'left' | 'right' | 'up' | 'down'} direction */
  function move(direction) {
    if (onPaper) setWriting((now) => moveCursor(paper, now ?? startWriting(paper), direction));
  }

  /** @param {string} id */
  function chooseOnPaper(id) {
    if (onPaper) setWriting((now) => chooseBox(paper, now ?? startWriting(paper), id));
  }

  /**
   * Opens the paper, or puts it away with what its answer row says in the
   * answer box: nothing, when the row is empty or has a gap, never an answer
   * typed before the paper was opened.
   */
  function togglePaper() {
    setHint('');
    if (!paperOn) {
      setPaperOn(true);
      return;
    }
    setTyped(paperRead !== null && 'text' in paperRead ? paperRead.text : '');
    setPaperOn(false);
  }

  function saveRound(correct) {
    saves.current.save(async () => {
      const answerBack = await sendSave('/api/rounds', { playerId: player.id, topic: roundId, correct }, 'round');
      if (answerBack.problem !== undefined) return answerBack;
      return isRound(answerBack.value) ? { value: answerBack.value.score } : { problem: 'error.saveUnconfirmed' };
    });
  }

  function next() {
    if (result === null) return;
    if (at + 1 < ROUND_LENGTH) {
      setAt(at + 1);
      setTyped('');
      setWriting(null);
      setResult(null);
      return;
    }
    if (round === null) return;
    setEnded(true);
    endedAt.current = Date.now();
    if (soundOn) playEnd(round.stars);
  }

  function again() {
    saves.current.begin();
    setSeed(freshSeed());
    setAt(0);
    setTyped('');
    setWriting(null);
    setPaperOn(false);
    setHint('');
    setResult(null);
    setRight(0);
    setStreak(0);
    setRound(null);
    setEnded(false);
    saved.current = null;
    momentPlayed.current = false;
    setSlowSave(false);
  }

  // The keyboard: the latest handlers, read by one listener for the whole round.
  const keys = useRef({ press, check, next, choose, move, question, result, end, onPaper });
  keys.current = { press, check, next, choose, move, question, result, end, onPaper };
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
      // Words typed in the helper's field are the child's own question, not an answer.
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;
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
      if (now.onPaper && Object.hasOwn(ARROWS, event.key)) now.move(ARROWS[event.key]);
      else if (/^[0-9]$/u.test(event.key)) now.press(event.key);
      else if (event.key === 'Backspace') now.press('delete');
      else if (event.key === 'Enter') now.check();
      else if (now.onPaper) return;
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
        {`${player.name} · ${roundName(roundId, locale)}`}
      </span>
      <div className="math-bar-end">
        {end === null && streak >= RUN_SHOWN ? (
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
  // The answer box: what was answered, the paper's answer row while the paper is open, or what is typed.
  const shownTyped = answered ? String(result.given) : onPaper ? ('text' in paperRead ? paperRead.text : '') : typed;
  const correctText = answerText(question.answer, locale);
  const questionWords = spokenQuestion(question, locale);
  const readLabel = t(voice.aiVoice ? 'math.helper.readQuestionAi' : 'math.helper.readQuestion', locale);
  const feedbackText = !answered
    ? ''
    : result.right
      ? t(praiseKey(at), locale)
      : `${t('math.round.wrong', locale)} ${t('math.round.answerWas', locale, { answer: correctText })}`;
  // Said by a screen reader when it changes. It stays in place for the whole
  // round, so a line that appears with its words already in it is not missed.
  const momentWords = end?.moment && (PANEL_MOMENTS.includes(end.moment.headline) || CHIME_MOMENTS.includes(end.moment.headline))
    ? ` ${t(`math.end.moment.${end.moment.headline}`, locale, { level: end.moment.level })}`
    : '';
  const spoken = (
    <p className="sr-only" aria-live="polite">
      {end !== null ? `${t(`math.end.title${end.stars}`, locale)} ${t('math.end.score', locale, { correct: end.correct })}${momentWords}` : feedbackText}
    </p>
  );

  // Problems from the topics screen: a refused Sound save during this round,
  // or a refused round that is no longer on the screen.
  const noticeLine = notice !== '' ? <p className="math-problem" role="alert">{notice}</p> : null;

  if (end !== null) {
    const confirmed = !end.saving && end.problem === '';
    const moment = confirmed ? end.moment : null;
    // The next step: what the confirmed save opened; after a refusal, what was open already.
    const next = moment !== null ? moment.next : end.saving ? null : nextAfter(progressOf(player.level, scores), roundId);
    const leads = moment !== null && moment.cleared && next !== null;
    const nextButton = next === null ? null : (
      <Button size="lg" variant={leads ? 'default' : 'outline'} className="math-big-button" onClick={() => onNext(next)}>
        {nextWords(next, locale)}
      </Button>
    );
    const lines = moment === null ? [] : moment.lines.filter((line) => line !== 'newBest');
    // At the finish the map comes first: it shows the crown.
    const finished = moment?.headline === 'finished';
    const backButton = (
      <Button size="lg" variant={finished ? 'default' : 'outline'} className="math-big-button" onClick={onLeave}>{t('math.end.back', locale)}</Button>
    );
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
            {moment !== null && PANEL_MOMENTS.includes(moment.headline) ? <MomentPanel moment={moment} animal={player.animal} locale={locale} /> : null}
            {moment !== null && CHIME_MOMENTS.includes(moment.headline) ? <MomentLine moment={moment} locale={locale} /> : null}
            {lines.map((line) => (
              <p key={line} className="math-moment-line">
                <Medal aria-hidden="true" className="math-medal" />
                {t(`math.end.line.${line}`, locale, { level: levelOfRound(roundId) ?? 1 })}
              </p>
            ))}
            {moment?.mark ? <p className="math-mark">{t(`math.end.mark.${moment.mark.opens}`, locale, { right: moment.mark.right })}</p> : null}
            <p className={end.problem !== '' ? 'math-problem' : 'math-note'} role="status">
              {end.saving
                ? t('math.end.saving', locale)
                : end.problem !== ''
                  ? `${t('math.end.notSaved', locale)} ${t(end.problem, locale)}`
                  : t('math.end.saved', locale)}
            </p>
            {end.saving && !slowSave ? null : (
              <div className="math-end-buttons flex flex-wrap justify-center gap-2">
                {leads ? nextButton : null}
                {finished ? backButton : null}
                <Button size="lg" variant={leads || finished ? 'outline' : 'default'} className="math-big-button" onClick={again}>{t('math.end.again', locale)}</Button>
                {finished ? null : backButton}
                {leads ? null : nextButton}
              </div>
            )}
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

      {/* On a wide window a typed question has its answer box and keys beside it, so nothing needs a scroll. */}
      <div className="math-work" data-typed={question.choices === null ? 'true' : undefined}>
        <Card
          className="math-question"
          ref={questionCard}
          tabIndex={-1}
          role="group"
          aria-label={t('math.round.question', locale, { number: at + 1 })}
        >
          <CardContent className="flex flex-col items-center gap-5 text-center">
            {isGate(roundId) ? <p className="math-from rounded-full">{t('math.round.fromStop', locale, { name: roundName(question.topic, locale) })}</p> : null}
            {question.ask !== null ? <p className="math-ask">{askText(question.ask, locale)}</p> : null}
            <QuestionPicture picture={question.picture} locale={locale} />
            {question.show !== null ? <Sum pieces={question.show} locale={locale} answer={answered ? question.answer : null} /> : null}
            <div className="math-question-tools">
              {paper !== null && !answered ? (
                <Button
                  variant={paperOn ? 'secondary' : 'outline'}
                  className="math-paper-toggle"
                  onClick={(event) => { letGo(event); togglePaper(); }}
                >
                  <NotebookPen aria-hidden="true" />
                  {t(paperOn ? 'math.paper.close' : 'math.paper.open', locale)}
                </Button>
              ) : null}
              {voice.canSay && questionWords !== '' ? (
                <Button
                  variant="ghost"
                  className="math-read"
                  title={readLabel}
                  disabled={voice.waiting !== ''}
                  onClick={(event) => { letGo(event); voice.say(questionWords); }}
                >
                  {voice.waiting === questionWords ? <Spinner aria-hidden="true" /> : <Speech aria-hidden="true" />}
                  {readLabel}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {paper !== null && (onPaper || result?.onPaper === true) ? (
          <div className="math-paper-place">
            <PaperBoard
              paper={paper}
              cells={writingNow.cells}
              cursor={onPaper ? writingNow.cursor : null}
              label={t('math.paper.label', locale, { sum: sumText(question.show, locale) })}
              locale={locale}
              onChoose={onPaper ? chooseOnPaper : undefined}
            />
            {onPaper ? <p className="math-note">{t(PAPER_NOTES[paper.kind] ?? 'math.paper.note', locale)}</p> : null}
          </div>
        ) : null}

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
              {shownTyped === '' ? <span className="math-typed-empty">?</span> : shownTyped}
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
                  {question.pad.point && !onPaper ? (
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
      </div>

      {answered ? (
        <Card className={result.right ? 'math-feedback math-feedback-right' : 'math-feedback math-feedback-miss'}>
          <CardContent className="flex flex-col gap-3">
            <p className="math-feedback-title">{feedbackText}</p>
            <div className="math-worked">
              {question.worked.map((line, index) => (
                <Sum key={index} pieces={line} locale={locale} size="small" />
              ))}
            </div>
            {result.onPaper && paper !== null ? (
              <div className="math-paper-solved">
                <p className="math-paper-solved-title">{t('math.paper.solved', locale)}</p>
                <PaperBoard
                  paper={paper}
                  cells={solvedPaper(paper, question)}
                  label={t('math.paper.label', locale, { sum: sumText(question.show, locale, question.answer) })}
                  locale={locale}
                />
              </div>
            ) : null}
            <Button size="lg" className="math-big-button self-start" onClick={next} autoFocus>
              {at + 1 < ROUND_LENGTH ? t('math.round.next', locale) : t('math.round.finish', locale)}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <RoundHelper
        key={`${seed}-${at}`}
        locale={locale}
        animal={player.animal}
        question={question}
        given={answered ? String(result.given) : null}
        voice={voice}
        stops={helperStops}
        onStop={(what, problemKey) => setHelperStops((now) => (now[what] === '' ? { ...now, [what]: problemKey } : now))}
      />

      <p className="math-note">{t('math.round.stopNote', locale)}</p>
    </div>
  );
}
