'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { t } from '../lib/i18n/index.js';
import { HELPER_LIMITS } from '../lib/math/helper.js';
import { sendSave } from '../lib/math/send.js';
import { RECORDING_BITS_PER_SECOND, recordingType } from '../lib/recording.js';
import { sendFile } from '../lib/send-file.js';

/**
 * Whether this page can record at all: a microphone the page may ask for, and
 * a recording type Tellop can read. Without Tellop's "Use camera and devices"
 * switch on for this app, the page has no microphone to ask for.
 */
function canRecord() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && recordingType() !== undefined;
}

/**
 * Refusals of writing a recording down that stay until the round screen opens
 * again: AI off, paused, used up or at this app's limit for the day, writing
 * speech down paused, or a Tellop that does not take the recording's language
 * yet (it answers `ai.refused`). Each later press would record the child and
 * keep the file for nothing.
 */
const STAYING = new Set(['ai.paused', 'ai.allowance', 'ai.appAiOff', 'ai.signedOut', 'ai.accountChanged', 'ai.refused', 'ai.voicePaused', 'ai.dailyLimit', 'ai.appPaused']);

/**
 * Ask out loud: records what the child says between their Ask out loud and
 * Stop presses (at most `HELPER_LIMITS.recordSeconds`), keeps the recording
 * (kit rule 6c) and has AI write it down in the app's language. Nothing is
 * recorded before the press or after Stop, and what was heard goes to
 * `onHeard`, which puts it in the question field: nothing is asked of the
 * helper until the child presses Send.
 *
 * When this page cannot record at all, or writing down refuses in a way that
 * stays (`STAYING`), the button rests for the rest of the round screen
 * (`onStop`, then `stopped` is the reason) and says why beside it.
 *
 * @param {{ locale: 'en' | 'tr', disabled?: boolean, stopped: string, onStop: (problemKey: string) => void, onHeard: (heard: string) => void }} props
 */
export function HelperSpeak({ locale, disabled = false, stopped, onStop, onHeard }) {
  const [state, setState] = useState(/** @type {'idle' | 'starting' | 'recording' | 'writing'} */ ('idle'));
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');
  const recorder = useRef(/** @type {MediaRecorder | null} */ (null));
  const stream = useRef(/** @type {MediaStream | null} */ (null));
  const timer = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const live = useRef(true);

  function release() {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  }

  // A page that cannot record says so once, beside a resting button.
  useEffect(() => {
    if (!canRecord()) onStop('math.helper.speak.noMicrophone');
    // Asked once, when the button is first drawn: whether this page can record does not change.
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    };
  }, []);

  /** @param {Blob} clip */
  async function writeDown(clip) {
    setState('writing');
    let kept;
    try {
      kept = await sendFile(clip);
    } catch (error) {
      if (!live.current) return;
      setProblem(typeof error?.messageKey === 'string' ? error.messageKey : 'error.fileNotKept');
      setState('idle');
      return;
    }
    // A question that has gone (Next, Stop) is not written down: that would cost and show nothing. Its recording only goes.
    if (!live.current) {
      void sendSave('/api/helper/heard', { file: kept.file, drop: true }, 'dropped');
      return;
    }
    const sent = await sendSave('/api/helper/heard', { file: kept.file }, 'heard');
    if (!live.current) return;
    setState('idle');
    if (sent.problem !== undefined || typeof sent.value !== 'string') {
      const refused = sent.problem === undefined || sent.problem === 'error.saveUnconfirmed' || sent.problem === 'error.saveFailed'
        ? 'ai.unavailable'
        : sent.problem;
      if (STAYING.has(refused)) onStop(refused === 'ai.refused' ? 'math.helper.speak.notTaken' : refused);
      else setProblem(refused);
      return;
    }
    if (sent.value === '') {
      setProblem('math.helper.speak.nothingHeard');
      return;
    }
    onHeard(sent.value);
  }

  async function start() {
    setProblem('');
    const type = recordingType();
    if (!canRecord() || type === undefined) {
      setProblem('math.helper.speak.noMicrophone');
      return;
    }
    setState('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (!live.current) return;
      setProblem(error?.name === 'NotAllowedError' ? 'math.helper.speak.notAllowed' : 'math.helper.speak.noMicrophone');
      setState('idle');
      return;
    }
    if (!live.current) {
      release();
      return;
    }
    /** @type {Blob[]} */
    const parts = [];
    // A recording that failed is never written down, even though the recorder still stops after it.
    let failed = false;
    let made;
    try {
      made = new MediaRecorder(stream.current, { mimeType: type, audioBitsPerSecond: RECORDING_BITS_PER_SECOND });
    } catch {
      release();
      setProblem('math.helper.speak.cannotRecord');
      setState('idle');
      return;
    }
    made.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data);
    };
    made.onerror = () => {
      failed = true;
      release();
      if (live.current) {
        setProblem('math.helper.speak.cannotRecord');
        setState('idle');
      }
    };
    made.onstop = () => {
      release();
      recorder.current = null;
      if (!live.current || failed) return;
      const clip = new Blob(parts, { type });
      if (clip.size === 0) {
        setProblem('math.helper.speak.nothingHeard');
        setState('idle');
        return;
      }
      void writeDown(clip);
    };
    recorder.current = made;
    try {
      made.start();
    } catch {
      // The recorder could not start (the encoder refused this microphone): let go of the microphone at once.
      recorder.current = null;
      release();
      setProblem('math.helper.speak.cannotRecord');
      setState('idle');
      return;
    }
    setSeconds(0);
    setState('recording');
    const began = Date.now();
    timer.current = setInterval(() => {
      const passed = Math.floor((Date.now() - began) / 1000);
      setSeconds(passed);
      if (passed >= HELPER_LIMITS.recordSeconds && recorder.current?.state === 'recording') recorder.current.stop();
    }, 250);
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const shown = `0:${String(Math.min(seconds, HELPER_LIMITS.recordSeconds)).padStart(2, '0')}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'recording' ? (
          <Button type="button" variant="destructive" size="lg" onClick={stop}>
            <Square aria-hidden="true" />
            {t('math.helper.speak.stop', locale)}
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="lg" disabled={disabled || stopped !== '' || state !== 'idle'} onClick={() => void start()}>
            <Mic aria-hidden="true" />
            {t(state === 'writing' ? 'math.helper.speak.writing' : 'math.helper.speak.start', locale)}
          </Button>
        )}
        {/* Always in place, so the words are said when they change. */}
        <span role="status" className={state === 'recording' ? 'text-sm text-muted-foreground' : 'sr-only'}>
          {state === 'recording' ? t('math.helper.speak.recording', locale, { time: shown }) : ''}
        </span>
      </div>
      {problem !== '' ? <p role="alert" className="math-helper-problem">{t(problem, locale)}</p> : null}
      {stopped !== '' ? <p role="status" className="math-helper-note">{t(stopped, locale)}</p> : null}
    </div>
  );
}
