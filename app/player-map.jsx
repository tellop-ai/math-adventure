'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChartNoAxesColumn, Star } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { playerSaves } from '../lib/math/player-saves.js';
import { sendSave } from '../lib/math/send.js';
import { answersByChoice, EXAMPLE_SEED, LEVELS, makeQuestion } from '../lib/math/topics.js';

import { Stars, Sum } from './math-pieces.jsx';
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
 * Sends one save of the player's level and Sound, with every field the
 * screen shows.
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
 * The player's map: the level picker, Sound, Progress, and the five topics of
 * the level as cards. Pressing Play on a card starts a round on this same page.
 *
 * The level and Sound save when they are pressed. The screen changes at once
 * and, if the save is refused, goes back to what is saved, with words that
 * say so. The same problem line takes a round's refusal that came back after
 * the round screen moved on, and shows on a round that is playing.
 *
 * Back from a round, the focus is on that topic's Play button.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   player: { id: number, seat: number, name: string, animal: string, level: number, soundOn: boolean },
 *   scores: Record<string, { rounds: number, bestStars: number, bestCorrect: number, answered: number, correct: number }>,
 * }} props
 */
export function PlayerMap({ locale, player: savedPlayer, scores: savedScores }) {
  const [player, setPlayer] = useState(savedPlayer);
  const [scores, setScores] = useState(savedScores);
  const [playing, setPlaying] = useState(/** @type {string | null} */ (null));
  const [showProgress, setShowProgress] = useState(false);
  const [problem, setProblem] = useState(/** @type {{ key: string, topic: string }} */ (NO_PROBLEM));
  const playButtons = useRef(/** @type {Map<string, HTMLElement>} */ (new Map()));
  const focusTopic = useRef(/** @type {string | null} */ (null));
  const saves = useRef(/** @type {null | ReturnType<typeof playerSaves>} */ (null));
  if (saves.current === null) {
    saves.current = playerSaves(savedPlayer, sendPlayer, (shown, problemKey) => {
      setPlayer(shown);
      setProblem(problemKey === '' ? NO_PROBLEM : { key: problemKey, topic: '' });
    });
  }

  // Back from a round: the focus goes to that topic's Play button.
  useEffect(() => {
    if (playing !== null || focusTopic.current === null) return;
    playButtons.current.get(focusTopic.current)?.focus();
    focusTopic.current = null;
  }, [playing]);

  const level = LEVELS.find((entry) => entry.level === player.level) ?? LEVELS[0];
  const levelStars = level.topics.reduce((total, id) => total + (scores[id]?.bestStars ?? 0), 0);

  /**
   * Saves the player with one field changed (`lib/math/player-saves.js`): the
   * screen shows it at once and ends on what is saved.
   *
   * @param {{ level?: number, soundOn?: boolean }} change
   * @param {string} failureKey
   */
  function savePlayer(change, failureKey) {
    saves.current.change(change, failureKey);
  }

  /** @param {string} topic @param {any} score */
  function roundSaved(topic, score) {
    setScores((now) => ({ ...now, [topic]: score }));
  }

  /** A round refused after its screen moved on. @param {string} topic @param {string} problemKey */
  function roundNotSaved(topic, problemKey) {
    setProblem({ key: problemKey, topic });
  }

  /** @param {string} topic */
  function startRound(topic) {
    setProblem(NO_PROBLEM);
    setPlaying(topic);
  }

  function leaveRound() {
    focusTopic.current = playing;
    setPlaying(null);
  }

  const problemWords = problem.key === ''
    ? ''
    : problem.topic === ''
      ? t(problem.key, locale)
      : `${t('math.map.roundNotSaved', locale, { topic: t(`math.topic.${problem.topic}`, locale) })} ${t(problem.key, locale)}`;

  if (playing !== null) {
    return (
      <RoundPlay
        key={playing}
        locale={locale}
        player={player}
        topicId={playing}
        best={scores[playing] ?? null}
        notice={problemWords}
        onSaved={roundSaved}
        onSaveProblem={roundNotSaved}
        onLeave={leaveRound}
        onSound={(soundOn) => savePlayer({ soundOn }, 'error.saveFailed')}
      />
    );
  }

  const played = LEVELS.flatMap((entry) => entry.topics.filter((id) => scores[id] !== undefined).map((id) => ({ id, level: entry.level })));

  return (
    <div className="math-shell">
      <header className="math-bar">
        <a href="/" className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden="true" />
          {t('math.map.back', locale)}
        </a>
        <div className="math-bar-end">
          <label className="math-switch-label">
            <Switch checked={player.soundOn} onCheckedChange={(soundOn) => savePlayer({ soundOn }, 'error.saveFailed')} />
            {t('math.map.sound', locale)}
          </label>
          <Button variant="outline" onClick={() => setShowProgress(true)}>
            <ChartNoAxesColumn aria-hidden="true" />
            {t('math.map.progress', locale)}
          </Button>
        </div>
      </header>

      <div className="math-player-head">
        <span className="math-avatar rounded-full" aria-hidden="true">{animalPicture(player.animal)}</span>
        <h1 className="math-title">{player.name}</h1>
      </div>

      {problemWords !== '' ? <p className="math-problem" role="alert">{problemWords}</p> : null}

      <section className="math-levels" aria-labelledby="level-heading">
        <div className="flex flex-col gap-1">
          <h2 id="level-heading" className="text-2xl">{t('math.level.name', locale, { level: level.level })}</h2>
          <p className="text-muted-foreground">
            {`${t(`math.level.hint${level.level}`, locale)} · ${t(answersByChoice(level.level) ? 'math.level.answerByChoice' : 'math.level.answerByTyping', locale)}`}
          </p>
        </div>
        <div className="math-level-row" role="group" aria-label={t('math.level.choose', locale)}>
          {LEVELS.map((entry) => (
            <Button
              key={entry.level}
              variant={entry.level === level.level ? 'default' : 'outline'}
              aria-pressed={entry.level === level.level}
              aria-label={t('math.level.name', locale, { level: entry.level })}
              className="math-level-button"
              onClick={() => { if (entry.level !== player.level) savePlayer({ level: entry.level }, 'math.map.levelNotSaved'); }}
            >
              {entry.level}
            </Button>
          ))}
        </div>
        <p className="math-star-count">
          <Star aria-hidden="true" className="math-star math-star-on" />
          {t('math.map.levelStars', locale, { count: levelStars, total: level.topics.length * 3 })}
        </p>
      </section>

      <ul className="math-topic-grid">
        {level.topics.map((id) => {
          const score = scores[id];
          return (
            <li key={id}>
              <Card className="math-topic-card">
                <CardHeader>
                  <CardTitle className="text-lg">{t(`math.topic.${id}`, locale)}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {EXAMPLES[id] ? (
                    <div className="math-example rounded-md"><Sum pieces={EXAMPLES[id]} locale={locale} size="small" /></div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars count={score?.bestStars ?? 0} locale={locale} />
                    <span className="text-sm text-muted-foreground">
                      {score ? t('math.map.best', locale, { correct: score.bestCorrect }) : t('math.map.notPlayed', locale)}
                    </span>
                  </div>
                  <Button
                    size="lg"
                    className="math-big-button mt-auto"
                    aria-label={t('math.map.playTopic', locale, { topic: t(`math.topic.${id}`, locale) })}
                    ref={(node) => {
                      if (node) playButtons.current.set(id, node);
                      else playButtons.current.delete(id);
                    }}
                    onClick={() => startRound(id)}
                  >
                    {t('math.map.play', locale)}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

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
                {played.map(({ id, level: topicLevel }) => {
                  const score = scores[id];
                  const percent = score.answered > 0 ? Math.round((score.correct / score.answered) * 100) : 0;
                  return (
                    <li key={id} className="math-progress-row rounded-md">
                      <div className="flex flex-col">
                        <span className="font-medium">{t(`math.topic.${id}`, locale)}</span>
                        <span className="text-xs text-muted-foreground">{t('math.level.name', locale, { level: topicLevel })}</span>
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
