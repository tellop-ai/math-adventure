'use client';

import { useEffect, useRef, useState } from 'react';
import { Lightbulb, MessageCircle, Send, Sparkles, Speech } from 'lucide-react';

import { Bubble, BubbleContent, BubbleGroup } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { t } from '../lib/i18n/index.js';
import { animalPicture } from '../lib/math/animals.js';
import { afterPress, HELPER_LIMITS, helperBody, NOTHING_USED, pressesLeft } from '../lib/math/helper.js';
import { sendSave } from '../lib/math/send.js';

import { HelperSpeak } from './helper-speak.jsx';

/**
 * Refusals that stay until the round screen opens again: AI paused, used up,
 * off, or no sign-in. While one stands, the helper's presses rest and the
 * card says why once, rather than refusing every press of every question.
 */
const STAYING = new Set(['ai.paused', 'ai.allowance', 'ai.appAiOff', 'ai.signedOut', 'ai.accountChanged']);

/**
 * The words for a refusal. An answer that never came, or a save that failed on
 * the way, is not a refusal the person can act on: the helper was not available.
 *
 * @param {string | undefined} problem
 */
function helperProblem(problem) {
  if (problem === undefined || problem === 'error.saveUnconfirmed' || problem === 'error.saveFailed') return 'ai.unavailable';
  return problem;
}

/** Lets a key press reach the round, not a button that kept focus after a click. */
function letGo(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

/**
 * The helper under the answer: a hint before the child answers, an
 * explanation after, and up to three questions of their own, typed or asked
 * out loud. Each answer comes from AI on the person's allowance and can be
 * read aloud (`voice`, from `useHelperVoice`).
 *
 * One card serves one question: the round gives each question its own card
 * (its `key`), so Next starts empty. Nothing here is saved, and the stars do
 * not change with it. Every press sends only what `helperBody` names; the
 * player's name never goes. A refusal that stays (`STAYING`) goes to the round
 * (`onStop`), which keeps it for every later question (`stops`); so does Ask
 * out loud's own.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   animal: string,
 *   question: { topic: string, seed: number },
 *   given: string | null,
 *   voice: ReturnType<typeof import('./helper-voice.jsx').useHelperVoice>,
 *   stops: { ai: string, speak: string },
 *   onStop: (what: 'ai' | 'speak', problemKey: string) => void,
 * }} props
 * `given` is what the child answered, or `null` while the question waits.
 */
export function RoundHelper({ locale, animal, question, given, voice, stops, onStop }) {
  const [turns, setTurns] = useState(/** @type {{ from: 'child' | 'helper', text: string }[]} */ ([]));
  const [used, setUsed] = useState(NOTHING_USED);
  const [waiting, setWaiting] = useState(/** @type {'' | 'hint' | 'explain' | 'ask'} */ (''));
  const [problem, setProblem] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const field = useRef(/** @type {HTMLInputElement | null} */ (null));
  const title = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const live = useRef(true);
  const answered = given !== null;
  const left = pressesLeft(used, answered);
  const aiOff = stops.ai !== '';

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The field takes the focus when it opens.
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  /** @param {'hint' | 'explain' | 'ask'} kind */
  async function press(kind) {
    if (waiting !== '' || aiOff) return;
    const words = kind === 'ask' ? draft.trim() : t(kind === 'hint' ? 'math.helper.hint' : 'math.helper.explain', locale);
    if (words.length === 0) {
      setProblem('math.helper.askFirst');
      field.current?.focus();
      return;
    }
    setProblem('');
    setWaiting(kind);
    const sent = await sendSave('/api/helper', helperBody({ kind, question, given, asked: words, history: turns }), 'reply');
    if (!live.current) return;
    setWaiting('');
    // The pressed button may have gone: the card's heading keeps the focus in the card.
    if (document.activeElement === null || document.activeElement === document.body) title.current?.focus();
    if (sent.problem !== undefined || typeof sent.value !== 'string') {
      const refused = helperProblem(sent.problem);
      if (STAYING.has(refused)) onStop('ai', refused);
      else setProblem(refused);
      return;
    }
    setTurns((now) => [...now, { from: 'child', text: words }, { from: 'helper', text: sent.value }]);
    const now = afterPress(used, kind);
    setUsed(now);
    if (kind === 'ask') {
      setDraft('');
      if (!pressesLeft(now, answered).ask) setOpen(false);
    }
  }

  /** @param {string} heardWords what AI wrote down from the recording */
  function heard(heardWords) {
    setDraft(heardWords);
    setProblem('');
    field.current?.focus();
  }

  const listenLabel = t(voice.aiVoice ? 'math.helper.listenAi' : 'math.helper.listen', locale);
  const lastReply = turns.length > 0 ? turns[turns.length - 1].text : '';

  return (
    <Card className="math-helper">
      <CardContent className="flex flex-col gap-3">
        <div className="math-helper-head">
          <span className="math-helper-animal" aria-hidden="true">{animalPicture(animal)}</span>
          <div className="flex flex-col">
            <h2 className="math-helper-title" ref={title} tabIndex={-1}>{t('math.helper.title', locale)}</h2>
            <p className="math-helper-lead">{t(answered ? 'math.helper.leadAfter' : 'math.helper.leadBefore', locale)}</p>
          </div>
        </div>

        {turns.length > 0 ? (
          <BubbleGroup className="math-helper-turns">
            {turns.map((turn, at) => (
              turn.from === 'child' ? (
                <Bubble key={at} variant="secondary" align="end">
                  <BubbleContent className="math-helper-text">{turn.text}</BubbleContent>
                </Bubble>
              ) : (
                <div key={at} className="math-helper-reply">
                  <span className="math-helper-face" aria-hidden="true">{animalPicture(animal)}</span>
                  <Bubble variant="tinted">
                    <BubbleContent className="math-helper-text">{turn.text}</BubbleContent>
                  </Bubble>
                  {voice.canSay ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={listenLabel}
                      title={listenLabel}
                      disabled={voice.waiting !== ''}
                      onClick={(event) => { letGo(event); voice.say(turn.text); }}
                    >
                      {voice.waiting === turn.text ? <Spinner aria-hidden="true" /> : <Speech aria-hidden="true" />}
                    </Button>
                  ) : null}
                </div>
              )
            ))}
          </BubbleGroup>
        ) : null}

        {/* Always in place, so the words are said when they change: the newest answer, and the wait. */}
        <p className="sr-only" aria-live="polite">{lastReply}</p>
        <p className={waiting !== '' ? 'math-helper-waiting' : 'sr-only'} role="status">
          {waiting !== '' ? <Spinner aria-hidden="true" /> : null}
          {waiting !== '' ? t('math.helper.thinking', locale) : ''}
        </p>
        {problem !== '' ? <p className="math-helper-problem" role="alert">{t(problem, locale)}</p> : null}
        {aiOff ? <p className="math-helper-problem" role="status">{t(stops.ai, locale)}</p> : null}

        <div className="flex flex-wrap gap-2">
          {left.hint ? (
            <Button
              variant="secondary"
              size="lg"
              className="math-helper-button"
              disabled={waiting !== '' || aiOff}
              onClick={(event) => { letGo(event); void press('hint'); }}
            >
              <Lightbulb aria-hidden="true" />
              {t('math.helper.hint', locale)}
            </Button>
          ) : null}
          {left.explain ? (
            <Button
              variant="secondary"
              size="lg"
              className="math-helper-button"
              disabled={waiting !== '' || aiOff}
              onClick={(event) => { letGo(event); void press('explain'); }}
            >
              <Sparkles aria-hidden="true" />
              {t('math.helper.explain', locale)}
            </Button>
          ) : null}
          {left.ask && !open ? (
            <Button variant="outline" size="lg" className="math-helper-button" disabled={aiOff} onClick={() => setOpen(true)}>
              <MessageCircle aria-hidden="true" />
              {t('math.helper.ask', locale)}
            </Button>
          ) : null}
        </div>

        {left.ask && open && !aiOff ? (
          <form
            className="math-helper-ask"
            onSubmit={(event) => {
              event.preventDefault();
              void press('ask');
            }}
          >
            <Input
              ref={field}
              className="math-helper-field"
              value={draft}
              maxLength={HELPER_LIMITS.asked}
              aria-label={t('math.helper.askLabel', locale)}
              placeholder={t('math.helper.askPlaceholder', locale)}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex flex-wrap items-start gap-2">
              <Button type="submit" size="lg" disabled={waiting !== ''} onClick={letGo}>
                <Send aria-hidden="true" />
                {t('math.helper.send', locale)}
              </Button>
              <HelperSpeak
                locale={locale}
                disabled={waiting !== ''}
                stopped={stops.speak}
                onStop={(problemKey) => onStop('speak', problemKey)}
                onHeard={heard}
              />
            </div>
          </form>
        ) : null}
        {!left.ask ? <p className="math-helper-note">{t('math.helper.asksUsed', locale)}</p> : null}

        <p className="math-helper-note">
          {t('math.helper.isAi', locale)}
          {voice.canSay && voice.aiVoice ? ` ${t('math.helper.aiVoice', locale)}` : ''}
        </p>
        {voice.notice !== '' ? (
          <p className="math-helper-note" role="status">
            {t(voice.notice, locale)}
            {voice.canSay ? ` ${t('math.helper.macInstead', locale)}` : ''}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
