/**
 * A question as words: for a screen reader, for reading it aloud, and for the
 * helper's AI. The screens draw a sum from its pieces (`app/math-pieces.jsx`);
 * these say the same pieces in text. Pure: the server and the page both use it.
 */

import { t } from '../i18n/index.js';

import { formatNumber, MINUS } from './numbers.js';

const BRACKET_AFTER = new Set(['+', MINUS, '×', '÷']);

/**
 * Whether a negative number needs brackets: right after a sign, so that
 * `4 − (−3)` never reads as `4 − −3`.
 *
 * @param {any} before
 */
export function bracketsAfter(before) {
  return before !== undefined && typeof before.op === 'string' && BRACKET_AFTER.has(before.op);
}

/**
 * A number as text, in brackets when it is negative and asked to be.
 *
 * @param {number} value
 * @param {'en' | 'tr'} locale
 * @param {boolean} bracket
 */
export function numberText(value, locale, bracket) {
  const text = formatNumber(value, locale);
  return bracket && value < 0 ? `(${text})` : text;
}

/**
 * The letter x with its number in front and its power: `3x²`, `−x`, `x`.
 *
 * @param {number} times
 * @param {'en' | 'tr'} locale
 */
export function timesText(times, locale) {
  if (times === 1) return '';
  if (times === -1) return MINUS;
  return formatNumber(times, locale);
}

/**
 * An answer written out: a number, a fraction or a sign.
 *
 * @param {{ kind: string, value?: any, top?: number, bottom?: number }} answer
 * @param {'en' | 'tr'} locale
 */
export function answerText(answer, locale) {
  if (answer.kind === 'fraction') return `${formatNumber(answer.top, locale)}/${formatNumber(answer.bottom, locale)}`;
  if (answer.kind === 'number') return formatNumber(answer.value, locale);
  return String(answer.value);
}

/**
 * A question's sentence in the reader's language, with its numbers written
 * the way that language writes them.
 *
 * @param {{ key: string, values?: Record<string, number> }} ask
 * @param {'en' | 'tr'} locale
 */
export function askText(ask, locale) {
  const values = {};
  for (const [name, value] of Object.entries(ask.values ?? {})) values[name] = formatNumber(value, locale);
  return t(ask.key, locale, values);
}

/** The word key for a number with a unit, said in words: `65°` as "65 degrees". */
const UNIT_WORDS = Object.freeze({ '°': 'math.read.degrees' });

/** The word key for a sign said in words by a screen reader too: the dots that end a pattern. */
const READ_SIGNS = Object.freeze({ '…': 'math.read.andSoOn' });

/**
 * A number with its unit in words, or the number alone.
 *
 * @param {{ n: number, unit?: string }} piece
 * @param {string} number the number as it is said or read
 * @param {'en' | 'tr'} locale
 */
function withUnit(piece, number, locale) {
  return piece.unit !== undefined && Object.hasOwn(UNIT_WORDS, piece.unit) ? t(UNIT_WORDS[piece.unit], locale, { n: number }) : number;
}

/**
 * A sum as words for a screen reader: powers, roots and degrees said in the
 * reader's language, and the box said as "box" or, once answered, as the answer.
 *
 * @param {readonly any[]} pieces
 * @param {'en' | 'tr'} locale
 * @param {any} [answer]
 */
export function sumText(pieces, locale, answer = null) {
  const box = answer === null ? t('math.read.box', locale) : answerText(answer, locale);
  const power = (base, value) => t('math.read.power', locale, { base, power: value === null ? box : String(value) });
  return pieces
    .map((piece, at) => {
      if ('n' in piece) return withUnit(piece, numberText(piece.n, locale, bracketsAfter(pieces[at - 1])), locale);
      if ('op' in piece) return Object.hasOwn(READ_SIGNS, piece.op) ? t(READ_SIGNS[piece.op], locale) : piece.op;
      if ('f' in piece) return `${formatNumber(piece.f[0], locale)}/${formatNumber(piece.f[1], locale)}`;
      if ('blank' in piece) return answer === null ? box : withUnit(piece, box, locale);
      if ('pow' in piece) return power(numberText(piece.pow[0], locale, true), piece.pow[1]);
      if ('sqrt' in piece) return t('math.read.root', locale, { n: formatNumber(piece.sqrt, locale) });
      if ('x' in piece) {
        const letter = `${timesText(piece.x[0], locale)}${piece.letter ?? 'x'}`;
        return piece.x[1] === 1 ? letter : power(letter, piece.x[1]);
      }
      if ('sup' in piece) return t('math.read.raised', locale, { power: piece.sup === null ? box : String(piece.sup) });
      return '';
    })
    .join(' ');
}

/**
 * The word key a voice says for each sign. A bracket is said ("open bracket",
 * "close bracket"), so `7 × (x + 7)` is never heard as `7 × x + 7`, except
 * one around a single number, which only keeps a minus apart (`4 − (−3)`).
 */
const SAID_SIGNS = Object.freeze({
  '+': 'math.say.plus',
  [MINUS]: 'math.say.minus',
  '×': 'math.say.times',
  '÷': 'math.say.share',
  '=': 'math.say.equals',
  '<': 'math.say.less',
  '>': 'math.say.more',
  ',': 'math.say.and',
  '…': 'math.read.andSoOn',
  '(': 'math.say.open',
  ')': 'math.say.close',
});

/**
 * Whether a bracket only wraps one number: `(−3)`, not `(x + 7)`.
 *
 * @param {readonly any[]} pieces
 * @param {number} at
 */
function aroundOneNumber(pieces, at) {
  if (pieces[at].op === '(') return 'n' in (pieces[at + 1] ?? {}) && pieces[at + 2]?.op === ')';
  return 'n' in (pieces[at - 1] ?? {}) && pieces[at - 2]?.op === '(';
}

/**
 * A number as a voice says it: a negative one as "minus 3".
 *
 * @param {number} value
 * @param {'en' | 'tr'} locale
 */
function saidNumber(value, locale) {
  const text = formatNumber(Math.abs(value), locale);
  return value < 0 ? `${t('math.say.negative', locale)} ${text}` : text;
}

/**
 * A sum as a voice reads it aloud: every sign said as a word, a fraction as
 * "3 over 4", and the box as "box" (or "what", when the sum ends on it after
 * "equals": "3 plus 1 equals what"), so a reading never depends on how a voice
 * says a symbol.
 *
 * @param {readonly any[]} pieces
 * @param {'en' | 'tr'} locale
 */
export function spokenSum(pieces, locale) {
  const box = t('math.read.box', locale);
  const power = (base, value) => t('math.read.power', locale, { base, power: value === null ? box : saidNumber(value, locale) });
  const letter = (times, name) => {
    if (times === 1) return name;
    if (times === -1) return `${t('math.say.negative', locale)} ${name}`;
    return `${saidNumber(times, locale)} ${name}`;
  };
  return pieces
    .map((piece, at) => {
      if ('blank' in piece && at === pieces.length - 1 && pieces[at - 1]?.op === '=') return t('math.say.what', locale);
      if ('n' in piece) return withUnit(piece, saidNumber(piece.n, locale), locale);
      // The comma before a pattern's dots is not said: "14 and so on", never "14 and and so on".
      if (piece.op === ',' && pieces[at + 1]?.op === '…') return '';
      if ((piece.op === '(' || piece.op === ')') && aroundOneNumber(pieces, at)) return '';
      if ('op' in piece) return Object.hasOwn(SAID_SIGNS, piece.op) ? t(SAID_SIGNS[piece.op], locale) : '';
      if ('f' in piece) return t('math.say.fraction', locale, { top: saidNumber(piece.f[0], locale), bottom: saidNumber(piece.f[1], locale) });
      if ('blank' in piece) return box;
      if ('pow' in piece) return power(saidNumber(piece.pow[0], locale), piece.pow[1]);
      if ('sqrt' in piece) return t('math.read.root', locale, { n: saidNumber(piece.sqrt, locale) });
      if ('x' in piece) {
        const said = letter(piece.x[0], piece.letter ?? 'x');
        return piece.x[1] === 1 ? said : power(said, piece.x[1]);
      }
      if ('sup' in piece) return t('math.read.raised', locale, { power: piece.sup === null ? box : saidNumber(piece.sup, locale) });
      return '';
    })
    .filter((word) => word !== '')
    .join(' ');
}

/**
 * A question as a voice reads it: its sentence, the equations of its picture
 * when it has them, then its sum. Other pictures are seen, not read.
 *
 * @param {{ ask: null | { key: string, values?: Record<string, number> }, show: null | readonly any[], picture?: any }} question
 * @param {'en' | 'tr'} locale
 */
export function spokenQuestion(question, locale) {
  const parts = [];
  if (question.ask !== null) parts.push(askText(question.ask, locale));
  if (question.picture?.kind === 'equations') {
    parts.push(question.picture.lines.map((line) => spokenSum(line, locale)).join(`, ${t('math.say.and', locale)} `));
  }
  if (question.show !== null) parts.push(spokenSum(question.show, locale));
  return parts.join(' ');
}

/**
 * A sum as plain text with its signs, the box as `?`: `7 × 8 = ?`, `2^3`,
 * `√49`, `3x^2`. For the helper's AI, which reads signs well.
 *
 * @param {readonly any[]} pieces
 * @param {'en' | 'tr'} locale
 */
export function plainSum(pieces, locale) {
  const raised = (value) => (value === null ? '?' : formatNumber(value, locale));
  return pieces
    .map((piece, at) => {
      if ('n' in piece) return `${numberText(piece.n, locale, bracketsAfter(pieces[at - 1]))}${piece.unit ?? ''}`;
      if ('op' in piece) return piece.op;
      if ('f' in piece) return `${formatNumber(piece.f[0], locale)}/${formatNumber(piece.f[1], locale)}`;
      if ('blank' in piece) return '?';
      if ('pow' in piece) return `${numberText(piece.pow[0], locale, true)}^${raised(piece.pow[1])}`;
      if ('sqrt' in piece) return `√${formatNumber(piece.sqrt, locale)}`;
      if ('x' in piece) return `${timesText(piece.x[0], locale)}${piece.letter ?? 'x'}${piece.x[1] === 1 ? '' : `^${piece.x[1]}`}`;
      if ('sup' in piece) return `^${raised(piece.sup)}`;
      return '';
    })
    .join(' ')
    .replace(/ \^/gu, '^');
}
