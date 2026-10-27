'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sendSave } from '../lib/math/send.js';

/**
 * Reading aloud on the round screen: with the AI voice, or with this Mac's own.
 *
 * The AI voice reads on a press of Listen or Read it to me, through the
 * helper's voice address, on the person's AI allowance; each text is read once
 * and its reading kept while the round screen is open. The page names the AI
 * voice wherever it reads. When AI refuses (paused, used up, off, or a Tellop
 * that serves no app voice yet), the page says why, reads with this Mac's
 * voice instead, and does not ask AI again until the round screen opens again
 * (a busy AI excepted: the next press asks again). `quiet()` stops whatever
 * reads, and a reading asked before it never plays: the round calls it when a
 * new question comes.
 *
 * The Mac's voice is the browser's own speech, made on this computer: no word
 * leaves it. When neither voice can read, `canSay` is false and no Listen
 * button is drawn.
 */

/** Voices made for fun on a Mac, which no child should hear as the helper. */
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar',
  'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical', 'Pipe Organ',
]);

/** The Mac's usual clear voice for each language, preferred when it is there. */
const PREFERRED = Object.freeze({
  'en-US': ['Samantha', 'Allison', 'Ava', 'Alex'],
  'tr-TR': ['Yelda', 'Cem'],
});

/** The speech language of each of the game's languages. */
const TAGS = Object.freeze({ en: 'en-US', tr: 'tr-TR' });

function speech() {
  const synth = /** @type {any} */ (globalThis).speechSynthesis;
  return synth && typeof synth.speak === 'function' ? synth : null;
}

/** @param {unknown} lang */
function tagOf(lang) {
  return String(lang ?? '').replace('_', '-').toLowerCase();
}

/**
 * The best voice for a speech language, or `null`. Only a voice on this
 * device is chosen, so no word read aloud leaves it.
 *
 * @param {any[]} voices
 * @param {string} tag
 */
function bestVoice(voices, tag) {
  const want = tag.toLowerCase();
  const language = want.split('-')[0];
  const names = PREFERRED[tag] ?? [];
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const lang = tagOf(voice?.lang);
    const name = String(voice?.name ?? '');
    const base = name.replace(/\s*\(.*\)\s*$/u, '');
    if (lang.split('-')[0] !== language || NOVELTY.has(base)) continue;
    // A voice the browser fetches over the internet would send the words away.
    if (voice?.localService === false) continue;
    let score = 0;
    if (lang === want) score += 8;
    const preferred = names.indexOf(base);
    if (preferred >= 0) score += 4 + (names.length - preferred) / 10;
    if (/enhanced|premium|geliştirilmiş/iu.test(name)) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The words for a refusal of the AI voice. An answer that never came, or a
 * save that failed on the way, is not a refusal the person can act on: the AI
 * voice was not available.
 *
 * @param {string | undefined} problem
 */
function voiceProblem(problem) {
  if (problem === undefined || problem === 'error.saveUnconfirmed' || problem === 'error.saveFailed') return 'ai.unavailable';
  return problem;
}

/**
 * One voice for the round screen.
 *
 * @param {'en' | 'tr'} locale
 * @returns {{ canSay: boolean, aiVoice: boolean, notice: string, waiting: string, say: (text: string) => void, quiet: () => void }}
 * `waiting` is the text the AI voice is being asked to read, or `''`; `notice`
 * is the word key for why the Mac reads instead, or `''`.
 */
export function useHelperVoice(locale) {
  const tag = TAGS[locale];
  const [voices, setVoices] = useState(/** @type {any[]} */ ([]));
  const [aiRefused, setAiRefused] = useState(false);
  const [notice, setNotice] = useState('');
  const [waiting, setWaiting] = useState('');
  const sounds = useRef(/** @type {Map<string, string>} */ (new Map()));
  const playing = useRef(/** @type {HTMLAudioElement | null} */ (null));
  const live = useRef(true);
  // Each reading asked counts one; a reading whose count is no longer the newest never plays.
  const asked = useRef(0);

  useEffect(() => {
    live.current = true;
    const synth = speech();
    const load = () => {
      try {
        setVoices(Array.from(synth?.getVoices() ?? []));
      } catch {
        setVoices([]);
      }
    };
    load();
    try {
      synth?.addEventListener?.('voiceschanged', load);
    } catch {
      // No voice list to follow.
    }
    return () => {
      live.current = false;
      playing.current?.pause();
      playing.current = null;
      try {
        synth?.removeEventListener?.('voiceschanged', load);
        synth?.cancel();
      } catch {
        // Nothing was being said.
      }
    };
  }, []);

  const voice = useMemo(() => bestVoice(voices, tag), [voices, tag]);
  const aiVoice = !aiRefused;

  const hush = useCallback(() => {
    playing.current?.pause();
    playing.current = null;
    try {
      speech()?.cancel();
    } catch {
      // Nothing was being said.
    }
  }, []);

  const quiet = useCallback(() => {
    asked.current += 1;
    setWaiting('');
    hush();
  }, [hush]);

  const sayWithMac = useCallback(
    (/** @type {string} */ text) => {
      const synth = speech();
      const Utterance = /** @type {any} */ (globalThis).SpeechSynthesisUtterance;
      if (synth === null || typeof Utterance !== 'function' || voice === null) return;
      try {
        hush();
        const utterance = new Utterance(text);
        utterance.lang = tag;
        utterance.voice = voice;
        utterance.rate = 0.9;
        synth.speak(utterance);
      } catch {
        // Speech failed this once; the words are still on the screen.
      }
    },
    [voice, tag, hush],
  );

  const sayWithAi = useCallback(
    async (/** @type {string} */ text) => {
      asked.current += 1;
      const mine = asked.current;
      let sound = sounds.current.get(text);
      if (sound === undefined) {
        setWaiting(text);
        const sent = await sendSave('/api/helper/voice', { text }, 'sound');
        if (!live.current || mine !== asked.current) return;
        setWaiting('');
        if (sent.problem !== undefined || typeof sent.value !== 'string') {
          const problem = voiceProblem(sent.problem);
          // A busy AI may answer the next press, and a text this page sent wrong is not the AI voice
          // refusing; anything else waits until the round screen opens again.
          if (problem !== 'ai.busy' && problem !== 'math.helper.refused') setAiRefused(true);
          if (problem !== 'math.helper.refused') setNotice(problem);
          sayWithMac(text);
          return;
        }
        sound = sent.value;
        sounds.current.set(text, sound);
        // A busy AI that read this time is not busy any more.
        setNotice((now) => (now === 'ai.busy' ? '' : now));
      }
      hush();
      const audio = new Audio(`/api/helper/voice?sound=${encodeURIComponent(sound)}`);
      playing.current = audio;
      try {
        await audio.play();
      } catch {
        // A reading the app no longer has (it started again since) is asked again on the next press.
        sounds.current.delete(text);
        if (live.current && playing.current === audio) sayWithMac(text);
      }
    },
    [hush, sayWithMac],
  );

  const say = useCallback(
    (/** @type {string} */ text) => {
      if (text.length === 0 || waiting !== '') return;
      if (aiVoice) void sayWithAi(text);
      else sayWithMac(text);
    },
    [aiVoice, waiting, sayWithAi, sayWithMac],
  );

  return useMemo(
    () => ({ canSay: aiVoice || voice !== null, aiVoice, notice, waiting, say, quiet }),
    [aiVoice, voice, notice, waiting, say, quiet],
  );
}
