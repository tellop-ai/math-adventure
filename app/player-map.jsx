'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChartNoAxesColumn, Check, Crown, Flag, Lock, Medal, Star, Trophy } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

import { t } from '../lib/i18n/index.js';
import { animalPicture } from '../lib/math/animals.js';
import { formatPercent } from '../lib/math/numbers.js';
import { BADGE_TOTAL, GATE_PASS, LANDS, levelOfRound, progressOf, rightFor } from '../lib/math/path.js';
import { playerSaves } from '../lib/math/player-saves.js';
import { sendSave } from '../lib/math/send.js';
import { answersByChoice, EXAMPLE_SEED, LAST_LEVEL, LEVELS, makeQuestion } from '../lib/math/topics.js';

import { levelName, roundName, Stars, Sum } from './math-pieces.jsx';
import { isPlayer } from './player-dialog.jsx';
import { RoundPlay } from './round-play.jsx';

/**
 * Each topic's example for its card: the first question its fixed seed makes,
 * when that question shows a sum.
 */
const EXAMPLES = Object.freeze(Object.fromEntries(
  LEVELS.flatMap((level) => level.topics).map((id) => [id, makeQuestion(id, EXAMPLE_SEED).show]),
));

/** No problem to show. */
const NO_PROBLEM = Object.freeze({ key: '', topic: '' });

/**
 * Sends one save of the player's Sound, with every field the screen shows.
 *
 * @param {{ id: number, name: string, animal: string, level: number, soundOn: boolean }} wanted
 */
async function sendPlayer(wanted) {
  const answer = await sendSave(
    '/api/players/change',
    { playerId: wanted.id, name: wanted.name, animal: wanted.animal, level: wanted.level, soundOn: wanted.soundOn },
    'player',
  );
  if (answer.problem !== undefined) return answer;
  return isPlayer(answer.value) ? { value: answer.value } : { problem: 'error.saveUnconfirmed' };
}

/**
 * What the round on a point is about, under its name: a stop's example sum,
 * or what a big challenge asks and what it opens (in a passed level, only its
 * badge).
 *
 * @param {{ point: import('../lib/math/path.js').Point, level: { level: number, passed: boolean }, locale: 'en' | 'tr' }} props
 */
function PointAbout({ point, level, locale }) {
  if (point.gate) {
    const key = level.passed ? 'math.gate.aboutBadge' : level.level < LAST_LEVEL ? 'math.gate.about' : 'math.gate.aboutLast';
    return <p className="text-sm text-muted-foreground">{t(key, locale, { right: rightFor(GATE_PASS) })}</p>;
  }
  return EXAMPLES[point.id] ? (
    <div className="math-example rounded-md"><Sum pieces={EXAMPLES[point.id]} locale={locale} size="small" /></div>
  ) : null;
}

/**
 * The round inside a point's circle on the trail: the player's animal where
 * they stand, a tick or a cup when done, a lock when not open yet, otherwise
 * the stop's number or the big challenge's flag.
 *
 * @param {{ point: import('../lib/math/path.js').Point, number: number, animal: string }} props
 */
function PointNode({ point, number, animal }) {
  let inside;
  if (point.state === 'next') inside = <span className="math-node-animal">{animalPicture(animal)}</span>;
  else if (point.state === 'locked') inside = <Lock />;
  else if (point.state === 'done') inside = point.gate ? <Trophy /> : <Check />;
  else inside = point.gate ? <Flag /> : <span className="math-node-number">{number}</span>;
  return <span className="math-node rounded-full" aria-hidden="true">{inside}</span>;
}

/**
 * The player's map: one level of the path at a time. A row of the eight
 * levels (a level not open yet rests with a lock), then the shown level's
 * stops and its big challenge on one trail. Pressing Play starts that
 * round on this same page; a round's end can start the next point's round
 * in its place, or show the next level here.
 *
 * What is open comes from `progressOf` (`lib/math/path.js`), the same rules
 * the server checks before it saves a round. The shown level starts at the
 * player's current one and is never saved. Sound saves when it is pressed: the
 * screen changes at once and, if the save is refused, goes back to what is
 * saved, with words that say so. The same problem line takes a round's refusal
 * that came back after the round screen moved on, and shows on a round that is
 * playing.
 *
 * Back from a round, the focus is on that point's Play button, or on the
 * level's heading when that point has none.
 *
 * Only a role that may change saved things (`canChange`, `lib/math/roles.js`,
 * chosen on the server) saves: its Sound and its rounds. For anyone else Sound
 * changes this visit only, every open round plays and nothing is sent to be
 * saved, and `roleNote` says so. `canAdd` lets the helper keep a spoken
 * question for a moment to write it down.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   player: { id: number, seat: number, name: string, animal: string, level: number, soundOn: boolean },
 *   scores: Record<string, { rounds: number, bestStars: number, bestCorrect: number, answered: number, correct: number }>,
 *   canAdd?: boolean,
 *   canChange?: boolean,
 *   roleNote?: string,
 * }} props
 */
export function PlayerMap({ locale, player: savedPlayer, scores: savedScores, canAdd = false, canChange = false, roleNote = '' }) {
  const [player, setPlayer] = useState(savedPlayer);
  const [scores, setScores] = useState(savedScores);
  const progress = useMemo(() => progressOf(player.level, scores), [player.level, scores]);
  const [shown, setShown] = useState(progress.current);
  const [playing, setPlaying] = useState(/** @type {string | null} */ (null));
  const [showProgress, setShowProgress] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [problem, setProblem] = useState(/** @type {{ key: string, topic: string }} */ (NO_PROBLEM));
  const playButtons = useRef(/** @type {Map<string, HTMLElement>} */ (new Map()));
  const levelHeading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const herePoint = useRef(/** @type {HTMLLIElement | null} */ (null));
  const focusPoint = useRef(/** @type {string | null} */ (null));
  const saves = useRef(/** @type {null | ReturnType<typeof playerSaves>} */ (null));
  if (saves.current === null) {
    saves.current = playerSaves(savedPlayer, sendPlayer, (shownPlayer, problemKey) => {
      setPlayer(shownPlayer);
      setProblem(problemKey === '' ? NO_PROBLEM : { key: problemKey, topic: '' });
    });
  }

  // As the map opens, the place where the player stands is in view, without
  // taking the focus.
  useEffect(() => {
    const here = herePoint.current;
    if (here === null || here.getBoundingClientRect().bottom <= window.innerHeight) return;
    here.scrollIntoView({ block: 'center' });
  }, []);

  // Back from a round: the focus goes to that point's Play button, or to the heading.
  useEffect(() => {
    if (playing !== null || focusPoint.current === null) return;
    (playButtons.current.get(focusPoint.current) ?? levelHeading.current)?.focus();
    focusPoint.current = null;
  }, [playing, shown]);

  /**
   * Sound, pressed on the map or in a round: saved for a role that may change
   * the player, otherwise for this visit only.
   *
   * @param {boolean} soundOn
   */
  function changeSound(soundOn) {
    if (canChange) void saves.current.change({ soundOn }, 'error.saveFailed');
    else setPlayer((now) => ({ ...now, soundOn }));
  }

  const level = progress.levels[shown - 1] ?? progress.levels[0];
  const land = LANDS[level.level - 1];
  const levelStars = level.points.reduce((total, point) => total + point.stars, 0);
  const doneCount = level.points.filter((point) => point.state === 'done').length;

  /**
   * A confirmed round. A late answer for an older round never puts back a row
   * that knows fewer rounds, so nothing open closes again.
   *
   * @param {string} topic
   * @param {any} score
   */
  function roundSaved(topic, score) {
    setScores((now) => (now[topic] !== undefined && now[topic].rounds > score.rounds ? now : { ...now, [topic]: score }));
  }

  /** A round refused after its screen moved on. @param {string} topic @param {string} problemKey */
  function roundNotSaved(topic, problemKey) {
    setProblem({ key: problemKey, topic });
  }

  /** @param {string} id */
  function startRound(id) {
    setProblem(NO_PROBLEM);
    setShown(levelOfRound(id) ?? shown);
    setPlaying(id);
  }

  function leaveRound() {
    focusPoint.current = playing;
    setPlaying(null);
  }

  /**
   * A round's end pressed the next step on the path: the next point's round
   * starts in place, or the map shows the level that just opened.
   *
   * @param {{ id: string, kind: 'stop' | 'gate' | 'level', level: number }} next
   */
  function goNext(next) {
    if (next.kind === 'level') {
      focusPoint.current = next.id;
      setShown(next.level);
      setPlaying(null);
      return;
    }
    startRound(next.id);
  }

  const problemWords = problem.key === ''
    ? ''
    : problem.topic === ''
      ? t(problem.key, locale)
      : `${t('math.map.roundNotSaved', locale, { topic: roundName(problem.topic, locale) })} ${t(problem.key, locale)}`;

  if (playing !== null) {
    return (
      <RoundPlay
        key={playing}
        locale={locale}
        player={player}
        roundId={playing}
        scores={scores}
        notice={problemWords}
        onSaved={roundSaved}
        onSaveProblem={roundNotSaved}
        onLeave={leaveRound}
        onNext={goNext}
        onSound={changeSound}
        keepRound={canChange}
        canRecord={canAdd}
      />
    );
  }

  const played = LEVELS.flatMap((entry) => [...entry.topics, `gate-${entry.level}`]
    .filter((id) => scores[id] !== undefined)
    .map((id) => ({ id, level: entry.level })));
  const someLocked = progress.levels.some((entry) => !entry.open);

  let status;
  if (progress.finished && level.level === LAST_LEVEL) {
    status = <p className="math-land-status"><Crown aria-hidden="true" className="math-crown" />{t('math.map.finished', locale)}</p>;
  } else if (level.passed && level.badge) {
    status = <p className="math-land-status"><span className="math-badge rounded-full">{t('math.map.passed', locale)}</span></p>;
  } else if (level.passed) {
    status = <p className="math-land-status text-muted-foreground">{t('math.map.practice', locale)}</p>;
  } else {
    status = <p className="math-land-status">{t('math.map.done', locale, { done: doneCount, total: level.points.length })}</p>;
  }

  return (
    <div className="math-shell">
      <header className="math-bar">
        <a href="/" className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden="true" />
          {t('math.map.back', locale)}
        </a>
        <div className="math-bar-end">
          <label className="math-switch-label">
            <Switch checked={player.soundOn} onCheckedChange={changeSound} />
            {t('math.map.sound', locale)}
          </label>
          <Button variant="outline" onClick={() => setShowBadges(true)}>
            <Medal aria-hidden="true" />
            {`${t('math.map.badges', locale)} · ${progress.badges}`}
          </Button>
          <Button variant="outline" onClick={() => setShowProgress(true)}>
            <ChartNoAxesColumn aria-hidden="true" />
            {t('math.map.progress', locale)}
          </Button>
        </div>
      </header>

      <div className="math-player-head">
        <span className="math-avatar rounded-full" aria-hidden="true">{animalPicture(player.animal)}</span>
        <h1 className="math-title">{player.name}</h1>
        {progress.finished ? <Crown aria-hidden="true" className="math-crown math-crown-big" /> : null}
      </div>

      {problemWords !== '' ? <p className="math-problem" role="alert">{problemWords}</p> : null}
      {roleNote !== '' ? <p className="math-note">{t(roleNote, locale)}</p> : null}

      <nav className="math-levels" aria-label={t('math.level.choose', locale)}>
        <ul className="math-level-row">
          {progress.levels.map((entry) => {
            const entryLand = LANDS[entry.level - 1];
            const isShown = entry.level === level.level;
            return (
              <li key={entry.level}>
                <Button
                  variant={isShown ? 'default' : 'outline'}
                  aria-pressed={isShown}
                  aria-label={entry.open ? levelName(entry.level, locale) : t('math.level.locked', locale, { level: entry.level })}
                  title={entry.open ? levelName(entry.level, locale) : t('math.level.locked', locale, { level: entry.level })}
                  className="math-level-button"
                  data-state={entry.open ? (entry.passed ? 'passed' : 'open') : 'locked'}
                  disabled={!entry.open}
                  onClick={() => setShown(entry.level)}
                >
                  <span aria-hidden="true" className="math-level-picture">{entryLand.picture}</span>
                  <span className="math-level-number">{entry.open ? entry.level : <Lock aria-hidden="true" />}</span>
                </Button>
              </li>
            );
          })}
        </ul>
        {someLocked ? <p className="text-sm text-muted-foreground">{t('math.level.opensOne', locale)}</p> : null}
      </nav>

      <section className="math-land" aria-labelledby="level-heading">
        <div className="math-land-head">
          <span className="math-land-picture rounded-full" aria-hidden="true">{land.picture}</span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="level-heading" className="text-2xl" ref={levelHeading} tabIndex={-1}>{levelName(level.level, locale)}</h2>
            <p className="text-muted-foreground">
              {`${t(`math.level.hint${level.level}`, locale)} · ${t(answersByChoice(level.level) ? 'math.level.answerByChoice' : 'math.level.answerByTyping', locale)}`}
            </p>
          </div>
        </div>
        <div className="math-land-line">
          {status}
          <p className="math-star-count">
            <Star aria-hidden="true" className="math-star math-star-on" />
            {t('math.map.levelStars', locale, { count: levelStars, total: level.points.length * 3 })}
          </p>
        </div>

        <ol className="math-trail">
          {level.points.map((point, at) => {
            const name = roundName(point.id, locale);
            const score = scores[point.id];
            const before = level.points[at - 1];
            return (
              <li
                key={point.id}
                className="math-point"
                data-state={point.state}
                data-side={at % 2 === 0 ? 'start' : 'end'}
                data-gate={point.gate ? 'yes' : 'no'}
                data-onward={level.points[at + 1] !== undefined && level.points[at + 1].state !== 'locked' ? 'yes' : 'no'}
                ref={point.state === 'next' ? herePoint : undefined}
              >
                <PointNode point={point} number={at + 1} animal={player.animal} />
                <Card className="math-point-card">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="math-point-name">
                        <span className="math-point-kicker">
                          {point.gate ? t('math.level.name', locale, { level: level.level }) : t('math.map.stop', locale, { number: at + 1 })}
                        </span>
                        {point.gate ? t('math.gate.short', locale) : name}
                      </h3>
                      {point.state === 'next' ? <span className="math-here rounded-full">{t('math.map.youAreHere', locale)}</span> : null}
                    </div>
                    <PointAbout point={point} level={level} locale={locale} />
                    {point.state === 'locked' ? (
                      <p className="math-point-locked">
                        <Lock aria-hidden="true" />
                        {point.gate ? t('math.map.gateOpens', locale) : t('math.map.opensAfter', locale, { stop: before ? roundName(before.id, locale) : '' })}
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Stars count={point.stars} locale={locale} />
                          <span className="text-sm text-muted-foreground">
                            {score ? t('math.map.best', locale, { correct: score.bestCorrect }) : t('math.map.notPlayed', locale)}
                          </span>
                        </div>
                        <Button
                          size="lg"
                          variant={point.state === 'next' ? 'default' : 'outline'}
                          className="math-big-button"
                          aria-label={t('math.map.playTopic', locale, { topic: name })}
                          ref={(node) => {
                            if (node) playButtons.current.set(point.id, node);
                            else playButtons.current.delete(point.id);
                          }}
                          onClick={() => startRound(point.id)}
                        >
                          {t('math.map.play', locale)}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <Dialog open={showBadges} onOpenChange={setShowBadges}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg">{t('math.badges.title', locale, { name: player.name })}</DialogTitle>
            <DialogDescription>{t('math.badges.lead', locale)}</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            <p className="math-star-count mb-3">
              <Medal aria-hidden="true" className="math-medal" />
              {t('math.badges.count', locale, { count: progress.badges, total: BADGE_TOTAL })}
            </p>
            <ul className="math-badge-grid">
              {progress.levels.flatMap((entry) => [
                { key: `level-${entry.level}`, won: entry.badge, words: t('math.badges.level', locale, { level: entry.level }), gold: false, entry },
                { key: `gold-${entry.level}`, won: entry.gold, words: t('math.badges.gold', locale, { level: entry.level }), gold: true, entry },
              ]).map((badge) => (
                <li key={badge.key} className="math-badge-tile rounded-md" data-won={badge.won ? 'yes' : 'no'}>
                  <span className="math-badge-picture rounded-full" aria-hidden="true">
                    {badge.gold ? <Medal /> : LANDS[badge.entry.level - 1].picture}
                  </span>
                  <span className="text-sm font-medium">{badge.words}</span>
                  <span className={badge.won ? 'text-xs font-semibold' : 'text-xs text-muted-foreground'}>{t(badge.won ? 'math.badges.won' : 'math.badges.notYet', locale)}</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t('math.badges.close', locale)}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProgress} onOpenChange={setShowProgress}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg">{t('math.progress.title', locale, { name: player.name })}</DialogTitle>
            <DialogDescription>{t('math.progress.lead', locale)}</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            {played.length === 0 ? (
              <p className="text-muted-foreground">{t('math.progress.empty', locale)}</p>
            ) : (
              <ul className="math-progress-list">
                {played.map(({ id, level: roundLevel }) => {
                  const score = scores[id];
                  const percent = score.answered > 0 ? Math.round((score.correct / score.answered) * 100) : 0;
                  return (
                    <li key={id} className="math-progress-row rounded-md">
                      <div className="flex flex-col">
                        <span className="font-medium">{id.startsWith('gate-') ? t('math.gate.short', locale) : roundName(id, locale)}</span>
                        <span className="text-xs text-muted-foreground">{t('math.level.name', locale, { level: roundLevel })}</span>
                      </div>
                      <Stars count={score.bestStars} locale={locale} />
                      <div className="flex flex-col text-right text-sm text-muted-foreground">
                        <span>{t('math.progress.rounds', locale, { count: score.rounds })}</span>
                        <span>{t('math.map.best', locale, { correct: score.bestCorrect })}</span>
                        <span>{t('math.progress.right', locale, { percent: formatPercent(percent, locale) })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t('math.progress.close', locale)}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
