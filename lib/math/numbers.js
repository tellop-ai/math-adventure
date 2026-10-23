/**
 * Numbers for the game: a seeded random source, whole-number helpers, how a
 * number is written in each language, and how a typed answer is read.
 *
 * Pure: nothing here touches stored information or the page.
 */

/**
 * A small seeded random source (mulberry32). The same seed always gives the same
 * numbers, so a test can replay any question.
 *
 * @param {number} seed
 * @returns {() => number} numbers from 0 up to (not including) 1
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A whole number from `low` to `high`, both included.
 *
 * @param {() => number} random
 * @param {number} low
 * @param {number} high
 */
export function between(random, low, high) {
  return low + Math.floor(random() * (high - low + 1));
}

/**
 * One item of a list.
 *
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function pickOne(random, list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * A shuffled copy of a list.
 *
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T[]}
 */
export function shuffled(random, list) {
  const copy = [...list];
  for (let at = copy.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [copy[at], copy[other]] = [copy[other], copy[at]];
  }
  return copy;
}

/**
 * The greatest common factor of two whole numbers (0 and 0 give 0).
 *
 * @param {number} a
 * @param {number} b
 */
export function greatestCommonFactor(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/**
 * The least common multiple of two whole numbers above zero.
 *
 * @param {number} a
 * @param {number} b
 */
export function leastCommonMultiple(a, b) {
  return Math.abs(a * b) / greatestCommonFactor(a, b);
}

/**
 * A fraction in its simplest form, with the sign on top.
 *
 * @param {number} top
 * @param {number} bottom
 * @returns {[number, number]}
 */
export function simplest(top, bottom) {
  const factor = greatestCommonFactor(top, bottom) || 1;
  const sign = bottom < 0 ? -1 : 1;
  return [(sign * top) / factor, (sign * bottom) / factor];
}

/** The minus sign the game shows (a real minus, not a hyphen). */
export const MINUS = '−';

/**
 * A number as the game shows it: no grouping, a real minus sign, and the
 * decimal mark of the language (a point in English, a comma in Turkish).
 *
 * The game's decimals are made from whole tenths and hundredths, so a value
 * never carries a long tail; anything longer is cut to four places.
 *
 * @param {number} value
 * @param {'en' | 'tr'} locale
 */
export function formatNumber(value, locale) {
  const plain = Number.isInteger(value) ? String(Math.abs(value)) : String(Number(Math.abs(value).toFixed(4)));
  const marked = locale === 'tr' ? plain.replace('.', ',') : plain;
  return value < 0 ? `${MINUS}${marked}` : marked;
}

/**
 * A percent as the language writes it: `25%` in English, `%25` in Turkish.
 *
 * @param {number} value
 * @param {'en' | 'tr'} locale
 */
export function formatPercent(value, locale) {
  const number = formatNumber(value, locale);
  return locale === 'tr' ? `%${number}` : `${number}%`;
}

/** The longest answer a person can type, in characters. */
export const MAX_TYPED = 8;

/**
 * A typed answer as a value, or `null` when it is not a number or a fraction.
 * A point or a comma is the decimal mark, and a hyphen or a minus sign is minus.
 *
 * @param {string} typed
 * @returns {{ kind: 'number', value: number } | { kind: 'fraction', top: number, bottom: number } | null}
 */
export function readTyped(typed) {
  if (typeof typed !== 'string' || typed.length === 0 || typed.length > MAX_TYPED) return null;
  const text = typed.replaceAll(MINUS, '-').replaceAll(',', '.').trim();
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(text)) return { kind: 'number', value: Number(text) };
  const fraction = /^(-?\d+)\/(\d+)$/u.exec(text);
  if (fraction !== null && Number(fraction[2]) !== 0) {
    return { kind: 'fraction', top: Number(fraction[1]), bottom: Number(fraction[2]) };
  }
  return null;
}

/**
 * Whether a typed answer is right.
 *
 * A number answer takes a number equal to it. A fraction answer takes any equal
 * fraction (`2/4` for `1/2`), and a whole number when the fraction is whole.
 *
 * @param {string} typed
 * @param {{ kind: string, value?: unknown, top?: number, bottom?: number }} answer
 */
export function typedIsRight(typed, answer) {
  const read = readTyped(typed);
  if (read === null) return false;
  if (answer.kind === 'number' && typeof answer.value === 'number') {
    return read.kind === 'number' && Math.abs(read.value - answer.value) < 1e-9;
  }
  if (answer.kind === 'fraction' && typeof answer.top === 'number' && typeof answer.bottom === 'number') {
    if (read.kind === 'fraction') return read.top * answer.bottom === answer.top * read.bottom;
    return answer.top % answer.bottom === 0 && Number.isInteger(read.value) && read.value === answer.top / answer.bottom;
  }
  return false;
}
