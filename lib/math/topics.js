/**
 * The game's levels and topics, and the questions each topic makes.
 *
 * A level is a school grade (1st to 8th grade, about age 6 to 14) with five
 * topics. A topic makes a question from a seeded random source, so the same
 * seed always makes the same question.
 *
 * A question is plain data the page draws:
 *
 *  - `ask`: the sentence above it, as a word key and its values (or `null` when
 *    the sum alone says what to do). Values are numbers; the page writes them in
 *    the reader's language.
 *  - `show`: the sum, as a list of pieces (see `piece kinds` below), or `null`.
 *  - `picture`: things to count (some crossed out, or in two groups), or a
 *    rectangle with its sides, or `null`.
 *  - `answer`: `{ kind: 'number', value }`, `{ kind: 'fraction', top, bottom }`
 *    or `{ kind: 'sign', value }` (one of `<`, `=`, `>`).
 *  - `choices`: four values to press (levels 1 and 2), or `null` when the
 *    answer is typed on the pad.
 *  - `pad`: which extra keys the pad shows (`minus`, `point`, `slash`).
 *  - `worked`: lines of pieces shown after an answer, ending on the answer.
 *
 * Piece kinds: `{ n }` a number; `{ op }` a sign; `{ f: [top, bottom] }` a
 * fraction; `{ blank: true }` the box; `{ pow: [base, power] }` a power (a
 * `null` power is the box); `{ sqrt: n }` a square root; `{ x: [times, power] }`
 * the letter x; `{ sup: n }` a raised power after a bracket (`null` is the box).
 *
 * Every sentence key here has words in both locale files (a test checks).
 * Pure: nothing here touches stored information or the page.
 */

import {
  between,
  greatestCommonFactor,
  leastCommonMultiple,
  MINUS,
  pickOne,
  seededRandom,
  shuffled,
  simplest,
} from './numbers.js';

/** Questions in one round. */
export const ROUND_LENGTH = 10;

/** The lowest and highest level. */
export const FIRST_LEVEL = 1;
export const LAST_LEVEL = 8;

/**
 * Stars for a round: all 10 right gives 3, 8 or 9 gives 2, 6 or 7 gives 1.
 *
 * @param {number} correct
 */
export function starsFor(correct) {
  if (correct >= 10) return 3;
  if (correct >= 8) return 2;
  if (correct >= 6) return 1;
  return 0;
}

/** Things to count on the first level. */
export const COUNTING_THINGS = Object.freeze(['🍎', '🍓', '🐞', '🎈', '🐟', '🌼', '🍪', '🐤', '🚗', '🦋']);

const PLUS = '+';
const TIMES = '×';
const SHARE = '÷';

/** @param {number} n */
const num = (n) => Object.freeze({ n });
/** @param {string} sign */
const op = (sign) => Object.freeze({ op: sign });
/** @param {number} top @param {number} bottom */
const frac = (top, bottom) => Object.freeze({ f: Object.freeze([top, bottom]) });
const BLANK = Object.freeze({ blank: true });
/** The box for a number of degrees: once answered, it shows its unit. */
const BLANK_DEG = Object.freeze({ blank: true, unit: '°' });
/** @param {number} base @param {number | null} power */
const pow = (base, power) => Object.freeze({ pow: Object.freeze([base, power]) });
/** @param {number} n */
const root = (n) => Object.freeze({ sqrt: n });
/** @param {number} times @param {number} power */
const ex = (times = 1, power = 1) => Object.freeze({ x: Object.freeze([times, power]) });
/** @param {number | null} n */
const sup = (n) => Object.freeze({ sup: n });
/** A number of degrees, drawn and said with its unit. @param {number} n */
const deg = (n) => Object.freeze({ n, unit: '°' });
/** The letter y with its number in front. @param {number} times */
const ey = (times = 1) => Object.freeze({ x: Object.freeze([times, 1]), letter: 'y' });

/** @param {number} value */
const numberAnswer = (value) => Object.freeze({ kind: 'number', value });
/** @param {number} top @param {number} bottom */
const fractionAnswer = (top, bottom) => Object.freeze({ kind: 'fraction', top, bottom });
/** @param {string} value */
const signAnswer = (value) => Object.freeze({ kind: 'sign', value });

/**
 * Four choices around a whole-number answer: the answer and three near misses,
 * none below zero, in a shuffled order.
 *
 * @param {() => number} random
 * @param {number} value
 * @param {number} [wide] a second, wider step to miss by (10 for tens)
 */
function choicesAround(random, value, wide = 3) {
  const found = new Set([value]);
  const steps = shuffled(random, [1, -1, 2, -2, wide, -wide]);
  for (const step of steps) {
    if (found.size === 4) break;
    if (value + step >= 0) found.add(value + step);
  }
  for (let step = 3; found.size < 4; step += 1) found.add(value + step);
  return Object.freeze(shuffled(random, [...found]));
}

/**
 * Four choices for a number read from blocks: the answer, its tens and ones
 * swapped (the classic slip, when that is a different two-digit number), and
 * near misses by one and by ten, none below zero, shuffled.
 *
 * @param {() => number} random
 * @param {number} value
 * @param {number} tens
 * @param {number} ones
 */
function placeChoices(random, value, tens, ones) {
  const found = new Set([value]);
  const swapped = ones * 10 + tens;
  if (ones > 0 && swapped !== value) found.add(swapped);
  for (const step of shuffled(random, [10, -10, 1, -1])) {
    if (found.size === 4) break;
    if (value + step >= 0) found.add(value + step);
  }
  for (let step = 2; found.size < 4; step += 1) found.add(value + step);
  return Object.freeze(shuffled(random, [...found]));
}

/** The pad with digits only. */
const DIGITS = Object.freeze({ minus: false, point: false, slash: false });
const WITH_MINUS = Object.freeze({ minus: true, point: false, slash: false });
const WITH_POINT = Object.freeze({ minus: false, point: true, slash: false });
const WITH_SLASH = Object.freeze({ minus: false, point: false, slash: true });

/**
 * A fraction's worked ending: `= top/bottom`, then `= simpler` when it
 * simplifies, then `= whole` when it is whole.
 *
 * @param {number} top
 * @param {number} bottom
 */
function fractionEnding(top, bottom) {
  const pieces = [op('='), frac(top, bottom)];
  const [smallTop, smallBottom] = simplest(top, bottom);
  if (smallBottom === 1) return [...pieces, op('='), num(smallTop)];
  if (smallBottom !== bottom) pieces.push(op('='), frac(smallTop, smallBottom));
  return pieces;
}

/**
 * Each topic: its id (the stored name and the word key `math.topic.<id>`), its
 * level, and `make(random)`, which answers one question's parts.
 *
 * @type {ReadonlyArray<{ id: string, level: number, make: (random: () => number) => any }>}
 */
const TOPIC_LIST = [
  // Level 1: about age 6.
  {
    id: 'count',
    level: 1,
    make(random) {
      const count = between(random, 3, 15);
      return {
        ask: { key: 'math.q.howMany' },
        picture: { kind: 'things', thing: pickOne(random, COUNTING_THINGS), count, crossed: 0 },
        answer: numberAnswer(count),
        choices: choicesAround(random, count, 3),
        worked: [[num(count)]],
      };
    },
  },
  {
    id: 'add-10',
    level: 1,
    make(random) {
      const a = between(random, 1, 9);
      const b = between(random, 1, 10 - a);
      return {
        show: [num(a), op(PLUS), num(b), op('='), BLANK],
        picture: { kind: 'groups', thing: pickOne(random, COUNTING_THINGS), groups: [a, b] },
        answer: numberAnswer(a + b),
        choices: choicesAround(random, a + b),
        worked: [[num(a), op(PLUS), num(b), op('='), num(a + b)]],
      };
    },
  },
  {
    id: 'take-away-10',
    level: 1,
    make(random) {
      const a = between(random, 2, 10);
      const b = between(random, 1, a);
      return {
        show: [num(a), op(MINUS), num(b), op('='), BLANK],
        picture: { kind: 'things', thing: pickOne(random, COUNTING_THINGS), count: a, crossed: b },
        answer: numberAnswer(a - b),
        choices: choicesAround(random, a - b),
        worked: [[num(a), op(MINUS), num(b), op('='), num(a - b)]],
      };
    },
  },
  {
    id: 'compare',
    level: 1,
    make(random) {
      const a = between(random, 0, 50);
      const b = random() < 0.2 ? a : between(random, 0, 50);
      const sign = a < b ? '<' : a > b ? '>' : '=';
      return {
        ask: { key: 'math.q.sign' },
        show: [num(a), BLANK, num(b)],
        answer: signAnswer(sign),
        choices: Object.freeze(['<', '=', '>']),
        worked: [[num(a), op(sign), num(b)]],
      };
    },
  },
  {
    id: 'add-20',
    level: 1,
    make(random) {
      const sum = between(random, 11, 20);
      const a = between(random, Math.max(1, sum - 10), Math.min(10, sum - 1));
      const b = sum - a;
      return {
        show: [num(a), op(PLUS), num(b), op('='), BLANK],
        answer: numberAnswer(sum),
        choices: choicesAround(random, sum),
        worked: [[num(a), op(PLUS), num(b), op('='), num(sum)]],
      };
    },
  },

  {
    id: 'blocks-tower',
    level: 1,
    make(random) {
      // Up to ten in one tower, or a full ten and some more for the teens.
      const count = random() < 0.3 ? between(random, 11, 19) : between(random, 1, 10);
      return {
        ask: { key: 'math.q.howManyBlocks' },
        picture: { kind: 'tower', count },
        answer: numberAnswer(count),
        choices: choicesAround(random, count, count > 10 ? 10 : 3),
        worked: count > 10 ? [[num(10), op(PLUS), num(count - 10), op('='), num(count)]] : [[num(count)]],
      };
    },
  },
  {
    id: 'make-10',
    level: 1,
    make(random) {
      const filled = between(random, 1, 9);
      const missing = 10 - filled;
      const boxFirst = random() < 0.5;
      return {
        ask: { key: 'math.q.makeTen' },
        show: boxFirst ? [BLANK, op(PLUS), num(filled), op('='), num(10)] : [num(filled), op(PLUS), BLANK, op('='), num(10)],
        picture: { kind: 'ten-places', filled },
        answer: numberAnswer(missing),
        choices: choicesAround(random, missing),
        worked: [[num(10), op(MINUS), num(filled), op('='), num(missing)]],
      };
    },
  },

  // Level 2: about age 7.
  {
    id: 'add-100',
    level: 2,
    make(random) {
      const a = between(random, 10, 89);
      const b = between(random, 2, 100 - a);
      return {
        show: [num(a), op(PLUS), num(b), op('='), BLANK],
        answer: numberAnswer(a + b),
        choices: choicesAround(random, a + b, 10),
        worked: [[num(a), op(PLUS), num(b), op('='), num(a + b)]],
      };
    },
  },
  {
    id: 'take-away-100',
    level: 2,
    make(random) {
      const a = between(random, 20, 100);
      const b = between(random, 2, a - 1);
      return {
        show: [num(a), op(MINUS), num(b), op('='), BLANK],
        answer: numberAnswer(a - b),
        choices: choicesAround(random, a - b, 10),
        worked: [[num(a), op(MINUS), num(b), op('='), num(a - b)]],
      };
    },
  },
  {
    id: 'skip-count',
    level: 2,
    make(random) {
      const step = pickOne(random, [2, 5, 10, 3, 4]);
      const start = step * between(random, 1, 8);
      const hole = between(random, 1, 4);
      const row = [0, 1, 2, 3, 4].map((at) => start + at * step);
      const show = [];
      row.forEach((value, at) => {
        if (at > 0) show.push(op(','));
        show.push(at === hole ? BLANK : num(value));
      });
      const worked = [];
      row.forEach((value, at) => {
        if (at > 0) worked.push(op(','));
        worked.push(num(value));
      });
      return {
        ask: { key: 'math.q.box' },
        show,
        answer: numberAnswer(row[hole]),
        choices: choicesAround(random, row[hole], step),
        worked: [worked],
      };
    },
  },
  {
    id: 'tens-ones',
    level: 2,
    make(random) {
      if (random() < 0.5) {
        const tens = between(random, 2, 9);
        const ones = between(random, 2, 9);
        const value = tens * 10 + ones;
        return {
          ask: { key: 'math.q.tensOnes', values: { tens, ones } },
          answer: numberAnswer(value),
          choices: choicesAround(random, value, 10),
          worked: [[num(tens * 10), op(PLUS), num(ones), op('='), num(value)]],
        };
      }
      const value = between(random, 20, 99);
      const tens = Math.floor(value / 10);
      return {
        ask: { key: 'math.q.tensIn', values: { n: value } },
        answer: numberAnswer(tens),
        choices: choicesAround(random, tens, 3),
        worked: [
          [num(value), op('='), num(tens * 10), op(PLUS), num(value % 10)],
          [num(tens * 10), op(SHARE), num(10), op('='), num(tens)],
        ],
      };
    },
  },
  {
    id: 'doubles-halves',
    level: 2,
    make(random) {
      if (random() < 0.5) {
        const n = between(random, 2, 25);
        return {
          ask: { key: 'math.q.double', values: { n } },
          answer: numberAnswer(2 * n),
          choices: choicesAround(random, 2 * n, 4),
          worked: [[num(2), op(TIMES), num(n), op('='), num(2 * n)]],
        };
      }
      const half = between(random, 2, 25);
      return {
        ask: { key: 'math.q.half', values: { n: half * 2 } },
        answer: numberAnswer(half),
        choices: choicesAround(random, half, 4),
        worked: [[num(half * 2), op(SHARE), num(2), op('='), num(half)]],
      };
    },
  },

  {
    id: 'blocks-tens',
    level: 2,
    make(random) {
      const tens = between(random, 1, 9);
      const ones = between(random, 0, 9);
      const value = tens * 10 + ones;
      return {
        ask: { key: 'math.q.blocksNumber' },
        picture: { kind: 'blocks', hundreds: 0, tens, ones },
        answer: numberAnswer(value),
        choices: placeChoices(random, value, tens, ones),
        worked: [[num(tens * 10), op(PLUS), num(ones), op('='), num(value)]],
      };
    },
  },
  {
    id: 'blocks-add',
    level: 2,
    make(random) {
      // Half of them make a new ten from the ones.
      const crossing = random() < 0.5;
      const aTens = between(random, 1, 7);
      const bTens = between(random, 1, 8 - aTens);
      const aOnes = crossing ? between(random, 2, 9) : between(random, 0, 8);
      const bOnes = crossing ? between(random, 10 - aOnes, 9) : between(random, 0, 9 - aOnes);
      const a = aTens * 10 + aOnes;
      const b = bTens * 10 + bOnes;
      return {
        show: [num(a), op(PLUS), num(b), op('='), BLANK],
        picture: { kind: 'blocks-sum', groups: [{ tens: aTens, ones: aOnes }, { tens: bTens, ones: bOnes }] },
        answer: numberAnswer(a + b),
        choices: choicesAround(random, a + b, 10),
        worked: [[num((aTens + bTens) * 10), op(PLUS), num(aOnes + bOnes), op('='), num(a + b)]],
      };
    },
  },

  // Level 3: about age 8. From here the answer is typed.
  {
    id: 'blocks-hundreds',
    level: 3,
    make(random) {
      const hundreds = between(random, 1, 9);
      const tens = between(random, 0, 9);
      const ones = between(random, 0, 9);
      const value = hundreds * 100 + tens * 10 + ones;
      return {
        ask: { key: 'math.q.blocksNumber' },
        picture: { kind: 'blocks', hundreds, tens, ones },
        answer: numberAnswer(value),
        pad: DIGITS,
        worked: [[num(hundreds * 100), op(PLUS), num(tens * 10), op(PLUS), num(ones), op('='), num(value)]],
      };
    },
  },
  {
    id: 'times-easy',
    level: 3,
    make(random) {
      const table = pickOne(random, [2, 3, 4, 5, 10]);
      const other = between(random, 1, 10);
      const [a, b] = random() < 0.5 ? [table, other] : [other, table];
      return {
        show: [num(a), op(TIMES), num(b), op('='), BLANK],
        answer: numberAnswer(a * b),
        pad: DIGITS,
        worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)]],
      };
    },
  },
  {
    id: 'times-hard',
    level: 3,
    make(random) {
      const table = between(random, 6, 9);
      const other = between(random, 2, 10);
      const [a, b] = random() < 0.5 ? [table, other] : [other, table];
      return {
        show: [num(a), op(TIMES), num(b), op('='), BLANK],
        answer: numberAnswer(a * b),
        pad: DIGITS,
        worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)]],
      };
    },
  },
  {
    id: 'share',
    level: 3,
    make(random) {
      const by = between(random, 2, 10);
      const each = between(random, 1, 10);
      return {
        show: [num(by * each), op(SHARE), num(by), op('='), BLANK],
        answer: numberAnswer(each),
        pad: DIGITS,
        worked: [[num(by), op(TIMES), num(each), op('='), num(by * each)], [num(by * each), op(SHARE), num(by), op('='), num(each)]],
      };
    },
  },
  {
    id: 'add-1000',
    level: 3,
    make(random) {
      if (random() < 0.5) {
        const a = between(random, 100, 899);
        const b = between(random, 11, 1000 - a);
        return {
          show: [num(a), op(PLUS), num(b), op('='), BLANK],
          answer: numberAnswer(a + b),
          pad: DIGITS,
          worked: [[num(a), op(PLUS), num(b), op('='), num(a + b)]],
        };
      }
      const a = between(random, 200, 1000);
      const b = between(random, 11, a - 1);
      return {
        show: [num(a), op(MINUS), num(b), op('='), BLANK],
        answer: numberAnswer(a - b),
        pad: DIGITS,
        worked: [[num(a), op(MINUS), num(b), op('='), num(a - b)]],
      };
    },
  },
  {
    id: 'missing-factor',
    level: 3,
    make(random) {
      const a = between(random, 2, 10);
      const b = between(random, 2, 10);
      const holeFirst = random() < 0.5;
      return {
        ask: { key: 'math.q.box' },
        show: holeFirst ? [BLANK, op(TIMES), num(b), op('='), num(a * b)] : [num(a), op(TIMES), BLANK, op('='), num(a * b)],
        answer: numberAnswer(holeFirst ? a : b),
        pad: DIGITS,
        worked: holeFirst
          ? [[num(a * b), op(SHARE), num(b), op('='), num(a)]]
          : [[num(a * b), op(SHARE), num(a), op('='), num(b)]],
      };
    },
  },

  // Level 4: about age 9.
  {
    id: 'long-times',
    level: 4,
    make(random) {
      const a = random() < 0.3 ? between(random, 100, 999) : between(random, 12, 99);
      const b = between(random, 2, 9);
      return {
        show: [num(a), op(TIMES), num(b), op('='), BLANK],
        answer: numberAnswer(a * b),
        pad: DIGITS,
        worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)]],
      };
    },
  },
  {
    id: 'long-share',
    level: 4,
    make(random) {
      const by = between(random, 2, 9);
      const each = between(random, 12, Math.floor(999 / by));
      return {
        show: [num(by * each), op(SHARE), num(by), op('='), BLANK],
        answer: numberAnswer(each),
        pad: DIGITS,
        worked: [[num(by), op(TIMES), num(each), op('='), num(by * each)], [num(by * each), op(SHARE), num(by), op('='), num(each)]],
      };
    },
  },
  {
    id: 'part-of',
    level: 4,
    make(random) {
      const parts = pickOne(random, [2, 3, 4, 5, 6, 8, 10]);
      const taken = between(random, 1, parts - 1);
      const whole = parts * between(random, 2, 12);
      const one = whole / parts;
      return {
        ask: taken === 1
          ? { key: 'math.q.partOfOne', values: { n: whole, d: parts } }
          : { key: 'math.q.partOfMany', values: { n: whole, d: parts, k: taken } },
        answer: numberAnswer(one * taken),
        pad: DIGITS,
        worked: [[num(whole), op(SHARE), num(parts), op('='), num(one)], [num(one), op(TIMES), num(taken), op('='), num(one * taken)]],
      };
    },
  },
  {
    id: 'rounding',
    level: 4,
    make(random) {
      if (random() < 0.5) {
        let n = between(random, 11, 999);
        if (n % 10 === 0) n += between(random, 1, 9);
        const rounded = Math.round(n / 10) * 10;
        return {
          ask: { key: 'math.q.roundTen', values: { n } },
          answer: numberAnswer(rounded),
          pad: DIGITS,
          worked: [[num(n), op('→'), num(rounded)]],
        };
      }
      let n = between(random, 101, 999);
      if (n % 100 === 0) n += between(random, 1, 99);
      const rounded = Math.round(n / 100) * 100;
      return {
        ask: { key: 'math.q.roundHundred', values: { n } },
        answer: numberAnswer(rounded),
        pad: DIGITS,
        worked: [[num(n), op('→'), num(rounded)]],
      };
    },
  },
  {
    id: 'perimeter',
    level: 4,
    make(random) {
      const long = between(random, 3, 20);
      const wide = between(random, 2, long - 1);
      const around = 2 * (long + wide);
      return {
        ask: { key: 'math.q.perimeter', values: { a: long, b: wide } },
        picture: { kind: 'rectangle', long, wide },
        answer: numberAnswer(around),
        pad: DIGITS,
        worked: [[num(2), op(TIMES), op('('), num(long), op(PLUS), num(wide), op(')'), op('='), num(around)]],
      };
    },
  },

  // Level 5: about age 10.
  {
    id: 'fraction-add',
    level: 5,
    make(random) {
      const bottom = between(random, 3, 12);
      if (random() < 0.5) {
        const a = between(random, 1, bottom - 1);
        const b = between(random, 1, bottom - a);
        return {
          show: [frac(a, bottom), op(PLUS), frac(b, bottom), op('='), BLANK],
          answer: fractionAnswer(a + b, bottom),
          pad: WITH_SLASH,
          worked: [[frac(a, bottom), op(PLUS), frac(b, bottom), ...fractionEnding(a + b, bottom)]],
        };
      }
      const a = between(random, 2, bottom - 1);
      const b = between(random, 1, a - 1);
      return {
        show: [frac(a, bottom), op(MINUS), frac(b, bottom), op('='), BLANK],
        answer: fractionAnswer(a - b, bottom),
        pad: WITH_SLASH,
        worked: [[frac(a, bottom), op(MINUS), frac(b, bottom), ...fractionEnding(a - b, bottom)]],
      };
    },
  },
  {
    id: 'decimals',
    level: 5,
    make(random) {
      // Made from whole tenths, so no sum carries a rounding tail. Neither
      // number is whole, so each one shows its decimal mark.
      const tenths = () => {
        const value = between(random, 11, 99);
        return value % 10 === 0 ? value + 1 : value;
      };
      const a = tenths();
      const b = tenths();
      if (random() < 0.5) {
        return {
          show: [num(a / 10), op(PLUS), num(b / 10), op('='), BLANK],
          answer: numberAnswer((a + b) / 10),
          pad: WITH_POINT,
          worked: [[num(a / 10), op(PLUS), num(b / 10), op('='), num((a + b) / 10)]],
        };
      }
      const [big, small] = a >= b ? [a, b] : [b, a];
      return {
        show: [num(big / 10), op(MINUS), num(small / 10), op('='), BLANK],
        answer: numberAnswer((big - small) / 10),
        pad: WITH_POINT,
        worked: [[num(big / 10), op(MINUS), num(small / 10), op('='), num((big - small) / 10)]],
      };
    },
  },
  {
    id: 'big-times',
    level: 5,
    make(random) {
      const a = between(random, 11, 99);
      const b = between(random, 11, 30);
      const tens = Math.floor(b / 10) * 10;
      const ones = b % 10;
      const worked = ones === 0
        ? [[num(a), op(TIMES), num(b), op('='), num(a * b)]]
        : [
          [num(a), op(TIMES), num(tens), op('='), num(a * tens)],
          [num(a), op(TIMES), num(ones), op('='), num(a * ones)],
          [num(a * tens), op(PLUS), num(a * ones), op('='), num(a * b)],
        ];
      return {
        show: [num(a), op(TIMES), num(b), op('='), BLANK],
        answer: numberAnswer(a * b),
        pad: DIGITS,
        worked,
      };
    },
  },
  {
    id: 'order-ops',
    level: 5,
    make(random) {
      const a = between(random, 2, 9);
      const b = between(random, 2, 9);
      const c = between(random, 2, 9);
      const form = between(random, 0, 3);
      if (form === 0) {
        return {
          show: [num(a), op(PLUS), num(b), op(TIMES), num(c), op('='), BLANK],
          answer: numberAnswer(a + b * c),
          pad: DIGITS,
          worked: [[num(b), op(TIMES), num(c), op('='), num(b * c)], [num(a), op(PLUS), num(b * c), op('='), num(a + b * c)]],
        };
      }
      if (form === 1) {
        return {
          show: [op('('), num(a), op(PLUS), num(b), op(')'), op(TIMES), num(c), op('='), BLANK],
          answer: numberAnswer((a + b) * c),
          pad: DIGITS,
          worked: [[num(a), op(PLUS), num(b), op('='), num(a + b)], [num(a + b), op(TIMES), num(c), op('='), num((a + b) * c)]],
        };
      }
      if (form === 2) {
        const big = a * b + c;
        return {
          show: [num(big), op(MINUS), num(a), op(TIMES), num(b), op('='), BLANK],
          answer: numberAnswer(c),
          pad: DIGITS,
          worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)], [num(big), op(MINUS), num(a * b), op('='), num(c)]],
        };
      }
      return {
        show: [num(a), op(PLUS), num(b * c), op(SHARE), num(c), op('='), BLANK],
        answer: numberAnswer(a + b),
        pad: DIGITS,
        worked: [[num(b * c), op(SHARE), num(c), op('='), num(b)], [num(a), op(PLUS), num(b), op('='), num(a + b)]],
      };
    },
  },
  {
    id: 'area',
    level: 5,
    make(random) {
      const long = between(random, 3, 15);
      const wide = between(random, 2, Math.min(12, long));
      return {
        ask: long === wide
          ? { key: 'math.q.areaSquare', values: { a: long } }
          : { key: 'math.q.area', values: { a: long, b: wide } },
        picture: { kind: 'rectangle', long, wide },
        answer: numberAnswer(long * wide),
        pad: DIGITS,
        worked: [[num(long), op(TIMES), num(wide), op('='), num(long * wide)]],
      };
    },
  },

  // Level 6: about age 11.
  {
    id: 'negatives',
    level: 6,
    make(random) {
      const a = between(random, -15, 15);
      const b = between(random, 1, 15);
      const form = between(random, 0, 3);
      const [sign, other, value] = [
        [PLUS, b, a + b],
        [MINUS, b, a - b],
        [PLUS, -b, a - b],
        [MINUS, -b, a + b],
      ][form];
      return {
        show: [num(a), op(sign), num(other), op('='), BLANK],
        answer: numberAnswer(value),
        pad: WITH_MINUS,
        worked: [[num(a), op(sign), num(other), op('='), num(value)]],
      };
    },
  },
  {
    id: 'percent-of',
    level: 6,
    make(random) {
      const percent = pickOne(random, [10, 20, 25, 50, 75, 5, 30, 40]);
      const unit = 100 / greatestCommonFactor(percent, 100);
      const whole = unit * between(random, 1, Math.max(1, Math.floor(400 / unit)));
      const part = (whole * percent) / 100;
      return {
        ask: { key: 'math.q.percentOf', values: { p: percent, n: whole } },
        answer: numberAnswer(part),
        pad: DIGITS,
        worked: [[num(whole), op(TIMES), num(percent), op(SHARE), num(100), op('='), num(part)]],
      };
    },
  },
  {
    id: 'factors',
    level: 6,
    make(random) {
      if (random() < 0.5) {
        const common = between(random, 2, 12);
        let x = between(random, 1, 9);
        let y = between(random, 1, 9);
        while (x === y || greatestCommonFactor(x, y) !== 1) {
          x = between(random, 1, 9);
          y = between(random, 1, 9);
        }
        return {
          ask: { key: 'math.q.greatestFactor', values: { a: common * x, b: common * y } },
          answer: numberAnswer(common),
          pad: DIGITS,
          worked: [
            [num(common * x), op('='), num(x), op(TIMES), num(common)],
            [num(common * y), op('='), num(y), op(TIMES), num(common)],
          ],
        };
      }
      let a = between(random, 2, 15);
      let b = between(random, 2, 15);
      while (a === b || leastCommonMultiple(a, b) > 120) {
        a = between(random, 2, 15);
        b = between(random, 2, 15);
      }
      const multiple = leastCommonMultiple(a, b);
      return {
        ask: { key: 'math.q.leastMultiple', values: { a, b } },
        answer: numberAnswer(multiple),
        pad: DIGITS,
        worked: [
          [num(a), op(TIMES), num(multiple / a), op('='), num(multiple)],
          [num(b), op(TIMES), num(multiple / b), op('='), num(multiple)],
        ],
      };
    },
  },
  {
    id: 'powers',
    level: 6,
    make(random) {
      if (random() < 0.6) {
        const n = between(random, 2, 15);
        return {
          show: [pow(n, 2), op('='), BLANK],
          answer: numberAnswer(n * n),
          pad: DIGITS,
          worked: [[num(n), op(TIMES), num(n), op('='), num(n * n)]],
        };
      }
      const n = between(random, 2, 6);
      return {
        show: [pow(n, 3), op('='), BLANK],
        answer: numberAnswer(n * n * n),
        pad: DIGITS,
        worked: [[num(n), op(TIMES), num(n), op(TIMES), num(n), op('='), num(n * n * n)]],
      };
    },
  },
  {
    id: 'fraction-decimal',
    level: 6,
    make(random) {
      const bottom = pickOne(random, [2, 4, 5, 10, 20, 25]);
      const top = between(random, 1, bottom - 1);
      // Hundredths, counted as whole numbers, so the answer carries no tail.
      const hundredths = (top * 100) / bottom;
      return {
        ask: { key: 'math.q.toDecimal' },
        show: [frac(top, bottom), op('='), BLANK],
        answer: numberAnswer(hundredths / 100),
        pad: WITH_POINT,
        worked: [[num(top), op(SHARE), num(bottom), op('='), num(hundredths / 100)]],
      };
    },
  },

  {
    id: 'angles',
    level: 6,
    make(random) {
      const form = between(random, 0, 3);
      if (form === 0) {
        const a = between(random, 15, 165);
        return {
          ask: { key: 'math.q.anglesLine' },
          show: [deg(a), op(PLUS), BLANK_DEG, op('='), deg(180)],
          answer: numberAnswer(180 - a),
          pad: DIGITS,
          worked: [[deg(180), op(MINUS), deg(a), op('='), deg(180 - a)]],
        };
      }
      if (form === 1) {
        const a = between(random, 40, 200);
        const b = between(random, 40, 320 - a);
        const c = 360 - a - b;
        return {
          ask: { key: 'math.q.anglesPoint' },
          show: [deg(a), op(PLUS), deg(b), op(PLUS), BLANK_DEG, op('='), deg(360)],
          answer: numberAnswer(c),
          pad: DIGITS,
          worked: [[deg(360), op(MINUS), deg(a), op(MINUS), deg(b), op('='), deg(c)]],
        };
      }
      if (form === 2) {
        const a = between(random, 10, 80);
        return {
          ask: { key: 'math.q.anglesRight' },
          show: [deg(a), op(PLUS), BLANK_DEG, op('='), deg(90)],
          answer: numberAnswer(90 - a),
          pad: DIGITS,
          worked: [[deg(90), op(MINUS), deg(a), op('='), deg(90 - a)]],
        };
      }
      const a = between(random, 20, 120);
      const b = between(random, 20, 160 - a);
      const c = 180 - a - b;
      return {
        ask: { key: 'math.q.anglesTriangle' },
        show: [deg(a), op(PLUS), deg(b), op(PLUS), BLANK_DEG, op('='), deg(180)],
        answer: numberAnswer(c),
        pad: DIGITS,
        worked: [[deg(180), op(MINUS), deg(a), op(MINUS), deg(b), op('='), deg(c)]],
      };
    },
  },
  {
    id: 'mean',
    level: 6,
    make(random) {
      const count = between(random, 3, 5);
      const mean = between(random, 4, 30);
      let values = [];
      for (let tries = 0; tries < 50; tries += 1) {
        const first = Array.from({ length: count - 1 }, () => between(random, Math.max(1, mean - 10), mean + 10));
        const last = mean * count - first.reduce((total, value) => total + value, 0);
        if (last >= 1 && last <= mean + 15) {
          values = [...first, last];
          break;
        }
      }
      // Almost never: every number the average itself.
      if (values.length === 0) values = Array.from({ length: count }, () => mean);
      const total = mean * count;
      const show = [];
      const sum = [];
      values.forEach((value, at) => {
        if (at > 0) {
          show.push(op(','));
          sum.push(op(PLUS));
        }
        show.push(num(value));
        sum.push(num(value));
      });
      return {
        ask: { key: 'math.q.mean' },
        show,
        answer: numberAnswer(mean),
        pad: DIGITS,
        worked: [[...sum, op('='), num(total)], [num(total), op(SHARE), num(count), op('='), num(mean)]],
      };
    },
  },

  // Level 7: about age 12.
  {
    id: 'signed-times',
    level: 7,
    make(random) {
      const pickSigned = () => {
        const size = between(random, 2, 12);
        return random() < 0.5 ? -size : size;
      };
      let a = pickSigned();
      const b = pickSigned();
      if (a > 0 && b > 0) a = -a;
      if (random() < 0.5) {
        return {
          show: [num(a), op(TIMES), num(b), op('='), BLANK],
          answer: numberAnswer(a * b),
          pad: WITH_MINUS,
          worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)]],
        };
      }
      return {
        show: [num(a * b), op(SHARE), num(b), op('='), BLANK],
        answer: numberAnswer(a),
        pad: WITH_MINUS,
        worked: [[num(a), op(TIMES), num(b), op('='), num(a * b)], [num(a * b), op(SHARE), num(b), op('='), num(a)]],
      };
    },
  },
  {
    id: 'one-step',
    level: 7,
    make(random) {
      const form = between(random, 0, 3);
      if (form === 0) {
        const added = between(random, 2, 20);
        const x = between(random, -10, 30);
        return {
          ask: { key: 'math.q.findX' },
          show: [ex(), op(PLUS), num(added), op('='), num(x + added)],
          answer: numberAnswer(x),
          pad: WITH_MINUS,
          worked: [[ex(), op('='), num(x + added), op(MINUS), num(added), op('='), num(x)]],
        };
      }
      if (form === 1) {
        const taken = between(random, 2, 20);
        const x = between(random, -10, 30);
        return {
          ask: { key: 'math.q.findX' },
          show: [ex(), op(MINUS), num(taken), op('='), num(x - taken)],
          answer: numberAnswer(x),
          pad: WITH_MINUS,
          worked: [[ex(), op('='), num(x - taken), op(PLUS), num(taken), op('='), num(x)]],
        };
      }
      if (form === 2) {
        const times = between(random, 2, 12);
        let x = between(random, -12, 12);
        if (x === 0) x = 1;
        return {
          ask: { key: 'math.q.findX' },
          show: [ex(times), op('='), num(times * x)],
          answer: numberAnswer(x),
          pad: WITH_MINUS,
          worked: [[ex(), op('='), num(times * x), op(SHARE), num(times), op('='), num(x)]],
        };
      }
      const by = between(random, 2, 10);
      let result = between(random, -10, 12);
      if (result === 0) result = 2;
      return {
        ask: { key: 'math.q.findX' },
        show: [ex(), op(SHARE), num(by), op('='), num(result)],
        answer: numberAnswer(result * by),
        pad: WITH_MINUS,
        worked: [[ex(), op('='), num(result), op(TIMES), num(by), op('='), num(result * by)]],
      };
    },
  },
  {
    id: 'percent-change',
    level: 7,
    make(random) {
      const percent = pickOne(random, [10, 20, 25, 50, 5, 40]);
      const unit = 100 / greatestCommonFactor(percent, 100);
      const whole = unit * between(random, 1, Math.max(1, Math.floor(400 / unit)));
      const change = (whole * percent) / 100;
      const up = random() < 0.5;
      const value = up ? whole + change : whole - change;
      return {
        ask: { key: up ? 'math.q.percentUp' : 'math.q.percentDown', values: { p: percent, n: whole } },
        answer: numberAnswer(value),
        pad: DIGITS,
        worked: [
          [num(whole), op(TIMES), num(percent), op(SHARE), num(100), op('='), num(change)],
          [num(whole), op(up ? PLUS : MINUS), num(change), op('='), num(value)],
        ],
      };
    },
  },
  {
    id: 'fraction-times',
    level: 7,
    make(random) {
      const b = between(random, 2, 9);
      const d = between(random, 2, 9);
      const a = between(random, 1, b - 1);
      const c = between(random, 1, d - 1);
      return {
        show: [frac(a, b), op(TIMES), frac(c, d), op('='), BLANK],
        answer: fractionAnswer(a * c, b * d),
        pad: WITH_SLASH,
        worked: [[frac(a, b), op(TIMES), frac(c, d), ...fractionEnding(a * c, b * d)]],
      };
    },
  },
  {
    id: 'ratio',
    level: 7,
    make(random) {
      let a = between(random, 1, 7);
      let b = between(random, 1, 7);
      while (a === b || greatestCommonFactor(a, b) !== 1) {
        a = between(random, 1, 7);
        b = between(random, 1, 7);
      }
      const unit = between(random, 2, 12);
      const whole = (a + b) * unit;
      const larger = Math.max(a, b);
      return {
        ask: { key: 'math.q.ratio', values: { n: whole, a, b } },
        answer: numberAnswer(larger * unit),
        pad: DIGITS,
        worked: [
          [num(whole), op(SHARE), op('('), num(a), op(PLUS), num(b), op(')'), op('='), num(unit)],
          [num(unit), op(TIMES), num(larger), op('='), num(larger * unit)],
        ],
      };
    },
  },

  {
    id: 'brackets',
    level: 7,
    make(random) {
      const times = between(random, 2, 9);
      const plus = random() < 0.5;
      const inner = between(random, 1, 12);
      let x = between(random, -6, 15);
      if (x === 0) x = 3;
      const inside = plus ? x + inner : x - inner;
      const right = times * inside;
      const sign = plus ? PLUS : MINUS;
      return {
        ask: { key: 'math.q.findX' },
        show: [num(times), op(TIMES), op('('), ex(), op(sign), num(inner), op(')'), op('='), num(right)],
        answer: numberAnswer(x),
        pad: WITH_MINUS,
        worked: [
          [ex(), op(sign), num(inner), op('='), num(right), op(SHARE), num(times), op('='), num(inside)],
          [ex(), op('='), num(inside), op(plus ? MINUS : PLUS), num(inner), op('='), num(x)],
        ],
      };
    },
  },
  {
    id: 'chance',
    level: 7,
    make(random) {
      if (random() < 0.6) {
        const red = between(random, 1, 8);
        const blue = between(random, 1, 8);
        return {
          ask: { key: 'math.q.chanceRed' },
          picture: { kind: 'marbles', red, blue },
          answer: fractionAnswer(red, red + blue),
          pad: WITH_SLASH,
          worked: [fractionEnding(red, red + blue).slice(1)],
        };
      }
      const above = between(random, 1, 5);
      return {
        ask: { key: 'math.q.chanceDice', values: { n: above } },
        answer: fractionAnswer(6 - above, 6),
        pad: WITH_SLASH,
        worked: [fractionEnding(6 - above, 6).slice(1)],
      };
    },
  },

  // Level 8: about age 13 and 14.
  {
    id: 'two-step',
    level: 8,
    make(random) {
      const times = between(random, 2, 9);
      const x = between(random, -10, 12);
      let added = between(random, -20, 20);
      if (added === 0) added = 5;
      const right = times * x + added;
      const sign = added > 0 ? PLUS : MINUS;
      // A third of them put x on both sides. Drawn last, so the others are the
      // questions their seeds always made.
      if (random() < 1 / 3) {
        const other = between(random, 1, times - 1);
        const rest = right - other * x;
        const show = [ex(times), op(sign), num(Math.abs(added)), op('='), ex(other)];
        if (rest !== 0) show.push(op(rest > 0 ? PLUS : MINUS), num(Math.abs(rest)));
        return {
          ask: { key: 'math.q.findX' },
          show,
          answer: numberAnswer(x),
          pad: WITH_MINUS,
          worked: [
            [ex(times - other), op('='), num(rest), op(added > 0 ? MINUS : PLUS), num(Math.abs(added)), op('='), num(rest - added)],
            // One x is already x: no line that shares by 1.
            ...(times - other === 1 ? [] : [[ex(), op('='), num(rest - added), op(SHARE), num(times - other), op('='), num(x)]]),
          ],
        };
      }
      return {
        ask: { key: 'math.q.findX' },
        show: [ex(times), op(sign), num(Math.abs(added)), op('='), num(right)],
        answer: numberAnswer(x),
        pad: WITH_MINUS,
        worked: [
          [ex(times), op('='), num(right), op(added > 0 ? MINUS : PLUS), num(Math.abs(added)), op('='), num(times * x)],
          [ex(), op('='), num(times * x), op(SHARE), num(times), op('='), num(x)],
        ],
      };
    },
  },
  {
    id: 'square-roots',
    level: 8,
    make(random) {
      const n = between(random, 2, 20);
      return {
        show: [root(n * n), op('='), BLANK],
        answer: numberAnswer(n),
        pad: DIGITS,
        worked: [[num(n), op(TIMES), num(n), op('='), num(n * n)], [root(n * n), op('='), num(n)]],
      };
    },
  },
  {
    id: 'right-triangles',
    level: 8,
    make(random) {
      const [a0, b0, c0] = pickOne(random, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]);
      const scale = between(random, 1, Math.max(1, Math.floor(60 / c0)));
      const [a, b, c] = [a0 * scale, b0 * scale, c0 * scale];
      if (random() < 0.6) {
        return {
          ask: { key: 'math.q.hypotenuse', values: { a, b } },
          answer: numberAnswer(c),
          pad: DIGITS,
          worked: [
            [pow(a, 2), op(PLUS), pow(b, 2), op('='), num(a * a), op(PLUS), num(b * b), op('='), num(c * c)],
            [root(c * c), op('='), num(c)],
          ],
        };
      }
      return {
        ask: { key: 'math.q.leg', values: { a, c } },
        answer: numberAnswer(b),
        pad: DIGITS,
        worked: [
          [pow(c, 2), op(MINUS), pow(a, 2), op('='), num(c * c), op(MINUS), num(a * a), op('='), num(b * b)],
          [root(b * b), op('='), num(b)],
        ],
      };
    },
  },
  {
    id: 'power-rules',
    level: 8,
    make(random) {
      const base = pickOne(random, [2, 3, 5, 7, 10]);
      const m = between(random, 2, 6);
      const n = between(random, 2, 6);
      const form = between(random, 0, 2);
      if (form === 0) {
        return {
          ask: { key: 'math.q.power' },
          show: [pow(base, m), op(TIMES), pow(base, n), op('='), pow(base, null)],
          answer: numberAnswer(m + n),
          pad: DIGITS,
          worked: [[pow(base, m), op(TIMES), pow(base, n), op('='), pow(base, m + n)]],
        };
      }
      if (form === 1) {
        return {
          ask: { key: 'math.q.power' },
          show: [pow(base, m + n), op(SHARE), pow(base, n), op('='), pow(base, null)],
          answer: numberAnswer(m),
          pad: DIGITS,
          worked: [[pow(base, m + n), op(SHARE), pow(base, n), op('='), pow(base, m)]],
        };
      }
      return {
        ask: { key: 'math.q.power' },
        show: [op('('), pow(base, m), op(')'), sup(n), op('='), pow(base, null)],
        answer: numberAnswer(m * n),
        pad: DIGITS,
        worked: [[op('('), pow(base, m), op(')'), sup(n), op('='), pow(base, m * n)]],
      };
    },
  },
  {
    id: 'using-x',
    level: 8,
    make(random) {
      let x = between(random, -5, 6);
      if (x === 0) x = 3;
      const a = between(random, 2, 6);
      let b = between(random, -10, 10);
      if (b === 0) b = 4;
      const sign = b > 0 ? PLUS : MINUS;
      const size = Math.abs(b);
      if (random() < 0.5) {
        const value = a * x + b;
        return {
          ask: { key: 'math.q.evaluate', values: { x } },
          show: [ex(a), op(sign), num(size)],
          answer: numberAnswer(value),
          pad: WITH_MINUS,
          worked: [[num(a), op(TIMES), num(x), op(sign), num(size), op('='), num(a * x), op(sign), num(size), op('='), num(value)]],
        };
      }
      const value = a * x * x + b;
      return {
        ask: { key: 'math.q.evaluate', values: { x } },
        show: [ex(a, 2), op(sign), num(size)],
        answer: numberAnswer(value),
        pad: WITH_MINUS,
        worked: [[num(a), op(TIMES), pow(x, 2), op(sign), num(size), op('='), num(a * x * x), op(sign), num(size), op('='), num(value)]],
      };
    },
  },
  {
    id: 'two-equations',
    level: 8,
    make(random) {
      if (random() < 0.5) {
        const x = between(random, 2, 15);
        const y = between(random, 1, 12);
        const sum = x + y;
        const difference = x - y;
        return {
          ask: { key: 'math.q.findX' },
          picture: { kind: 'equations', lines: [
            [ex(), op(PLUS), ey(), op('='), num(sum)],
            [ex(), op(MINUS), ey(), op('='), num(difference)],
          ] },
          answer: numberAnswer(x),
          pad: WITH_MINUS,
          worked: [
            [ex(2), op('='), num(sum), op(PLUS), num(difference), op('='), num(sum + difference)],
            [ex(), op('='), num(sum + difference), op(SHARE), num(2), op('='), num(x)],
          ],
        };
      }
      const x = between(random, 2, 15);
      const y = between(random, 1, 12);
      return {
        ask: { key: 'math.q.findX' },
        picture: { kind: 'equations', lines: [
          [ex(2), op(PLUS), ey(), op('='), num(2 * x + y)],
          [ex(), op(PLUS), ey(), op('='), num(x + y)],
        ] },
        answer: numberAnswer(x),
        pad: WITH_MINUS,
        worked: [[ex(), op('='), num(2 * x + y), op(MINUS), num(x + y), op('='), num(x)]],
      };
    },
  },
  {
    id: 'patterns',
    level: 8,
    make(random) {
      let step = between(random, 2, 9);
      if (random() < 0.3) step = -step;
      // The four terms on the screen stay above zero.
      const start = Math.max(between(random, 1, 30), 1 - 3 * step);
      const n = pickOne(random, [10, 12, 15, 20, 25, 30, 50, 100]);
      const term = start + (n - 1) * step;
      const show = [];
      for (let at = 0; at < 4; at += 1) show.push(num(start + at * step), op(','));
      show.push(op('…'));
      return {
        ask: { key: 'math.q.patternTerm', values: { n } },
        show,
        answer: numberAnswer(term),
        pad: WITH_MINUS,
        worked: [[num(start), op(PLUS), op('('), num(n), op(MINUS), num(1), op(')'), op(TIMES), num(step), op('='), num(term)]],
      };
    },
  },
];

/** Every topic, by id. */
export const TOPICS = Object.freeze(Object.fromEntries(TOPIC_LIST.map((topic) => [topic.id, Object.freeze(topic)])));

/** Every topic id, in level order. */
export const TOPIC_IDS = Object.freeze(TOPIC_LIST.map((topic) => topic.id));

/**
 * The order a player meets each level's topics in, the stops of its path: each
 * stop builds on the one before, and each level's last stop leads into the
 * next level's first (adding to 20, then tens and ones; doubles, then times
 * tables; part of a number, then fractions; negative numbers, then signs in
 * times; one-step, then two-step equations). A test holds every level to its
 * own topics, each once. Blocks come early on levels 1 to 3 (a tower before
 * comparing, making 10 before taking away, blocks before tens and ones and
 * before adding to 100, hundreds blocks before adding to 1000); the top levels'
 * newest stops come last on their level, after the stops they build on.
 */
const PATH = Object.freeze({
  1: ['count', 'blocks-tower', 'compare', 'add-10', 'make-10', 'take-away-10', 'add-20'],
  2: ['blocks-tens', 'tens-ones', 'skip-count', 'blocks-add', 'add-100', 'take-away-100', 'doubles-halves'],
  3: ['blocks-hundreds', 'add-1000', 'times-easy', 'times-hard', 'share', 'missing-factor'],
  4: ['rounding', 'long-times', 'long-share', 'perimeter', 'part-of'],
  5: ['fraction-add', 'decimals', 'big-times', 'area', 'order-ops'],
  6: ['factors', 'powers', 'fraction-decimal', 'percent-of', 'negatives', 'angles', 'mean'],
  7: ['signed-times', 'fraction-times', 'ratio', 'percent-change', 'one-step', 'brackets', 'chance'],
  8: ['two-step', 'using-x', 'power-rules', 'square-roots', 'right-triangles', 'two-equations', 'patterns'],
});

/** The levels, each with its topic ids in the order of its path. */
export const LEVELS = Object.freeze(
  [1, 2, 3, 4, 5, 6, 7, 8].map((level) => Object.freeze({
    level,
    topics: Object.freeze([...PATH[level]]),
  })),
);

/** Levels 1 and 2 answer by pressing a choice; the others type the answer. */
export function answersByChoice(level) {
  return level <= 2;
}

/**
 * The choice a key press picks, or `null`. Only a sign is picked by its own key
 * (`<`, `=`, `>`). A digit never picks a choice: the choices are numbers, and a
 * child pressing 4 means the number 4, not the fourth button.
 *
 * @param {{ choices: readonly unknown[] | null, answer: { kind: string } }} question
 * @param {string} key
 */
export function choiceForKey(question, key) {
  if (question.choices === null || question.answer.kind !== 'sign') return null;
  return question.choices.includes(key) ? key : null;
}

/**
 * One question of a topic, made from a seed.
 *
 * @param {string} topicId
 * @param {number} seed
 */
export function makeQuestion(topicId, seed) {
  const topic = TOPICS[topicId];
  if (topic === undefined) throw new RangeError('Unknown topic');
  const parts = topic.make(seededRandom(seed));
  return Object.freeze({
    topic: topicId,
    seed,
    ask: parts.ask ?? null,
    show: parts.show ?? null,
    picture: parts.picture ?? null,
    answer: parts.answer,
    choices: parts.choices ?? null,
    pad: parts.choices ? null : (parts.pad ?? DIGITS),
    worked: parts.worked,
  });
}

/**
 * What makes two questions the same question.
 *
 * @param {ReturnType<typeof makeQuestion>} question
 */
export function sameness(question) {
  return JSON.stringify([question.ask, question.show, question.answer]);
}

/**
 * The ten questions of one round, all different where the topic has enough of
 * them, from one starting seed.
 *
 * @param {string} topicId
 * @param {number} seed
 */
export function makeRound(topicId, seed) {
  const random = seededRandom(seed);
  const questions = [];
  const seen = new Set();
  for (let tries = 0; questions.length < ROUND_LENGTH; tries += 1) {
    const question = makeQuestion(topicId, Math.floor(random() * 4294967296));
    const key = sameness(question);
    if (seen.has(key) && tries < ROUND_LENGTH * 20) continue;
    seen.add(key);
    questions.push(question);
  }
  return Object.freeze(questions);
}

/** The seed of each topic's example on its card. */
export const EXAMPLE_SEED = 2026;
