/**
 * The game's questions: every topic of every level, replayed over many seeds,
 * makes questions whose sums are true, whose answers fit the way they are
 * answered, and whose worked lines end on the answer.
 *
 * The sums are checked by a small calculator here that reads the same pieces
 * the page draws, so a question that shows one thing and expects another fails.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatNumber, formatPercent, MINUS, readTyped, typedIsRight } from '../lib/math/numbers.js';
import {
  answersByChoice,
  choiceForKey,
  LEVELS,
  makeQuestion,
  makeRound,
  ROUND_LENGTH,
  starsFor,
  TOPIC_IDS,
  TOPICS,
} from '../lib/math/topics.js';

const SEEDS = 400;

/**
 * The value of a list of pieces, or throws when they do not read as one sum.
 *
 * @param {any[]} pieces
 * @param {{ x?: number, blank?: number }} given
 */
function valueOf(pieces, given) {
  let at = 0;
  const peek = () => pieces[at];
  const take = () => pieces[at++];
  const isOp = (piece, sign) => piece !== undefined && piece.op === sign;

  function primary() {
    const piece = take();
    if (piece === undefined) throw new Error('a sum ends early');
    if ('n' in piece) return piece.n;
    if ('f' in piece) return piece.f[0] / piece.f[1];
    if ('blank' in piece) {
      assert.equal(typeof given.blank, 'number', 'a box with no value');
      return given.blank;
    }
    if ('pow' in piece) {
      const power = piece.pow[1] === null ? given.blank : piece.pow[1];
      return piece.pow[0] ** power;
    }
    if ('sqrt' in piece) return Math.sqrt(piece.sqrt);
    if ('x' in piece) {
      assert.equal(typeof given.x, 'number', 'an x with no value');
      return piece.x[0] * given.x ** piece.x[1];
    }
    if (isOp(piece, '(')) {
      const inside = sum();
      assert.ok(isOp(take(), ')'), 'a bracket is closed');
      return inside;
    }
    throw new Error(`a sum cannot start with ${JSON.stringify(piece)}`);
  }

  function factor() {
    const value = primary();
    const next = peek();
    if (next !== undefined && 'sup' in next) {
      take();
      return value ** (next.sup === null ? given.blank : next.sup);
    }
    return value;
  }

  function product() {
    let value = factor();
    while (isOp(peek(), '×') || isOp(peek(), '÷')) {
      const sign = take().op;
      const right = factor();
      value = sign === '×' ? value * right : value / right;
    }
    return value;
  }

  function sum() {
    let value = product();
    while (isOp(peek(), '+') || isOp(peek(), MINUS)) {
      const sign = take().op;
      const right = product();
      value = sign === '+' ? value + right : value - right;
    }
    return value;
  }

  const value = sum();
  assert.equal(at, pieces.length, `pieces left over in ${JSON.stringify(pieces)}`);
  return value;
}

/** Splits a line at its `=` signs. @param {any[]} line */
function sides(line) {
  const parts = [[]];
  for (const piece of line) {
    if (piece.op === '=') parts.push([]);
    else parts.at(-1).push(piece);
  }
  return parts;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

/** The number value of an answer. */
function answerValue(answer) {
  if (answer.kind === 'fraction') return answer.top / answer.bottom;
  return answer.value;
}

/** What x is in a question, if it has one. */
function xOf(question) {
  if (question.ask?.key === 'math.q.evaluate') return question.ask.values.x;
  if (question.ask?.key === 'math.q.findX') return question.answer.value;
  return undefined;
}

/** Every question of every topic for every seed, with its topic. */
function* everyQuestion() {
  for (const id of TOPIC_IDS) {
    for (let seed = 0; seed < SEEDS; seed += 1) yield makeQuestion(id, seed * 7919 + 13);
  }
}

test('eight levels, five topics each, forty different topics', () => {
  assert.equal(LEVELS.length, 8);
  assert.deepEqual(LEVELS.map((level) => level.level), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const level of LEVELS) assert.equal(level.topics.length, 5, `level ${level.level}`);
  assert.equal(TOPIC_IDS.length, 40);
  assert.equal(new Set(TOPIC_IDS).size, 40);
  for (const id of TOPIC_IDS) {
    assert.match(id, /^[a-z][a-z0-9-]{1,31}$/u);
    assert.equal(TOPICS[id].level, LEVELS.find((level) => level.topics.includes(id)).level);
  }
  assert.ok(Object.isFrozen(TOPICS) && Object.isFrozen(TOPIC_IDS) && Object.isFrozen(LEVELS));
});

test('the same seed makes the same question, and an unknown topic is refused', () => {
  for (const id of TOPIC_IDS) assert.deepEqual(makeQuestion(id, 99), makeQuestion(id, 99));
  assert.throws(() => makeQuestion('no-such-topic', 1), RangeError);
});

test('every shown sum is true once the box holds the answer', () => {
  for (const question of everyQuestion()) {
    if (question.show === null) continue;
    const what = `${question.topic} seed ${question.seed}`;
    if (question.answer.kind === 'sign') {
      const [left, box, right] = question.show;
      assert.ok(box.blank, what);
      const a = left.n;
      const b = right.n;
      const sign = a < b ? '<' : a > b ? '>' : '=';
      assert.equal(question.answer.value, sign, what);
      continue;
    }
    assert.equal(question.show.filter((piece) => piece.blank || (piece.pow && piece.pow[1] === null)).length <= 1, true, what);
    const given = { x: xOf(question), blank: answerValue(question.answer) };
    const parts = sides(question.show);
    if (parts.length === 1) continue; // An expression to work out with x, checked by its worked line.
    const values = parts.map((part) => valueOf(part, given));
    for (const value of values) assert.ok(near(value, values[0]), `${what}: ${JSON.stringify(question.show)}`);
  }
});

test('every worked line is true and the last one ends on the answer', () => {
  for (const question of everyQuestion()) {
    const what = `${question.topic} seed ${question.seed}`;
    assert.ok(Array.isArray(question.worked) && question.worked.length >= 1, what);
    const given = { x: xOf(question) };
    for (const line of question.worked) {
      if (line.some((piece) => piece.op === '→' || piece.op === ',' || piece.op === '<' || piece.op === '>')) continue;
      const values = sides(line).map((part) => valueOf(part, given));
      for (const value of values) assert.ok(near(value, values[0]), `${what}: ${JSON.stringify(line)}`);
    }
    const last = question.worked.at(-1).at(-1);
    if (question.worked[0].some((piece) => piece.op === ',')) {
      // A row counted in steps: even steps, and the answer fills the box's place.
      const row = question.worked[0].filter((piece) => 'n' in piece).map((piece) => piece.n);
      const step = row[1] - row[0];
      row.forEach((value, at) => assert.equal(value, row[0] + at * step, what));
      const hole = question.show.filter((piece) => piece.op !== ',').findIndex((piece) => piece.blank);
      assert.equal(row[hole], question.answer.value, what);
    } else if (question.answer.kind === 'sign') {
      assert.equal(question.worked[0][1].op, question.answer.value, what);
    } else if (last.pow) {
      assert.equal(last.pow[1], question.answer.value, what);
    } else if (last.f) {
      assert.ok(near(last.f[0] / last.f[1], answerValue(question.answer)), what);
    } else {
      assert.ok(near(last.n, answerValue(question.answer)), `${what}: ends on ${JSON.stringify(last)}`);
    }
  }
});

test('word questions and pictures say what their answers need', () => {
  for (const question of everyQuestion()) {
    const what = `${question.topic} seed ${question.seed}`;
    const values = question.ask?.values ?? {};
    const answer = answerValue(question.answer);
    switch (question.ask?.key) {
      case 'math.q.howMany':
        assert.equal(question.picture.count, answer, what);
        break;
      case 'math.q.tensOnes':
        assert.equal(values.tens * 10 + values.ones, answer, what);
        assert.ok(values.tens >= 2 && values.ones >= 2, `${what}: no "1 tens"`);
        break;
      case 'math.q.tensIn':
        assert.equal(Math.floor(values.n / 10), answer, what);
        break;
      case 'math.q.double':
        assert.equal(values.n * 2, answer, what);
        break;
      case 'math.q.half':
        assert.equal(values.n / 2, answer, what);
        break;
      case 'math.q.partOfOne':
      case 'math.q.partOfMany':
        assert.equal((values.n / values.d) * (values.k ?? 1), answer, what);
        assert.equal(values.k === undefined, question.ask.key === 'math.q.partOfOne', what);
        assert.notEqual(values.k, 1, `${what}: one part has its own sentence`);
        break;
      case 'math.q.roundTen':
        assert.equal(Math.round(values.n / 10) * 10, answer, what);
        assert.notEqual(values.n % 10, 0, what);
        break;
      case 'math.q.roundHundred':
        assert.equal(Math.round(values.n / 100) * 100, answer, what);
        assert.notEqual(values.n % 100, 0, what);
        break;
      case 'math.q.perimeter':
        assert.equal(2 * (values.a + values.b), answer, what);
        break;
      case 'math.q.area':
      case 'math.q.areaSquare':
        assert.equal(values.a * (values.b ?? values.a), answer, what);
        assert.equal(values.b === undefined, question.ask.key === 'math.q.areaSquare', what);
        assert.notEqual(values.a, values.b, `${what}: a square has its own sentence`);
        break;
      case 'math.q.percentOf':
        assert.equal((values.n * values.p) / 100, answer, what);
        break;
      case 'math.q.percentUp':
        assert.equal(values.n + (values.n * values.p) / 100, answer, what);
        break;
      case 'math.q.percentDown':
        assert.equal(values.n - (values.n * values.p) / 100, answer, what);
        break;
      case 'math.q.greatestFactor':
        assert.equal(values.a % answer, 0, what);
        assert.equal(values.b % answer, 0, what);
        for (let bigger = answer + 1; bigger <= Math.min(values.a, values.b); bigger += 1) {
          assert.ok(values.a % bigger !== 0 || values.b % bigger !== 0, what);
        }
        break;
      case 'math.q.leastMultiple':
        assert.equal(answer % values.a, 0, what);
        assert.equal(answer % values.b, 0, what);
        for (let smaller = Math.max(values.a, values.b); smaller < answer; smaller += 1) {
          assert.ok(smaller % values.a !== 0 || smaller % values.b !== 0, what);
        }
        break;
      case 'math.q.ratio':
        assert.equal((values.n / (values.a + values.b)) * Math.max(values.a, values.b), answer, what);
        assert.ok(Number.isInteger(values.n / (values.a + values.b)), what);
        break;
      case 'math.q.hypotenuse':
        assert.equal(values.a ** 2 + values.b ** 2, answer ** 2, what);
        break;
      case 'math.q.leg':
        assert.equal(values.a ** 2 + answer ** 2, values.c ** 2, what);
        break;
      default:
        break;
    }
    if (question.picture?.kind === 'groups') {
      assert.equal(question.picture.groups[0] + question.picture.groups[1], answer, what);
    }
    if (question.picture?.kind === 'things') {
      assert.equal(question.picture.count - question.picture.crossed, answer, what);
      assert.ok(question.picture.count <= 15, what);
    }
  }
});

test('levels 1 and 2 answer by choice, and every choice set holds the answer once with no number below zero', () => {
  for (const question of everyQuestion()) {
    const what = `${question.topic} seed ${question.seed}`;
    const level = TOPICS[question.topic].level;
    assert.equal(question.choices !== null, answersByChoice(level), what);
    assert.equal(question.pad === null, answersByChoice(level), what);
    if (question.choices === null) continue;
    const size = question.answer.kind === 'sign' ? 3 : 4;
    assert.equal(question.choices.length, size, what);
    assert.equal(new Set(question.choices).size, size, what);
    assert.equal(question.choices.filter((choice) => choice === question.answer.value).length, 1, what);
    for (const choice of question.choices) {
      if (typeof choice === 'number') assert.ok(Number.isInteger(choice) && choice >= 0, `${what}: ${choice}`);
    }
  }
});

test('a digit key never picks a choice by its place; a sign key picks its own sign', () => {
  for (const question of everyQuestion()) {
    if (question.choices === null) continue;
    for (const key of ['1', '2', '3', '4', '5', '9', '0']) assert.equal(choiceForKey(question, key), null, `${question.topic} key ${key}`);
    for (const key of ['<', '=', '>']) {
      assert.equal(choiceForKey(question, key), question.answer.kind === 'sign' ? key : null, `${question.topic} key ${key}`);
    }
  }
  assert.equal(choiceForKey({ choices: null, answer: { kind: 'number' } }, '<'), null);
});

test('a typed answer can always be typed on the pad the question shows, in both languages', () => {
  for (const question of everyQuestion()) {
    if (question.pad === null) continue;
    const what = `${question.topic} seed ${question.seed}`;
    const { answer, pad } = question;
    let typed;
    if (answer.kind === 'fraction') {
      assert.ok(pad.slash, what);
      typed = [`${answer.top}/${answer.bottom}`];
    } else {
      if (answer.value < 0) assert.ok(pad.minus, `${what}: needs minus`);
      if (!Number.isInteger(answer.value)) assert.ok(pad.point, `${what}: needs a decimal mark`);
      typed = [formatNumber(answer.value, 'en'), formatNumber(answer.value, 'tr')];
    }
    for (const text of typed) {
      assert.ok(text.length <= 8, `${what}: ${text} is too long to type`);
      for (const character of text) {
        const allowed = /\d/u.test(character)
          || (pad.minus && character === MINUS)
          || (pad.point && (character === '.' || character === ','))
          || (pad.slash && character === '/');
        assert.ok(allowed, `${what}: ${text} needs a key the pad does not show`);
      }
      assert.ok(typedIsRight(text, answer), `${what}: ${text}`);
    }
  }
});

test('a round has ten questions, different from each other, and replays from its seed', () => {
  for (const id of TOPIC_IDS) {
    for (const seed of [1, 2, 3, 4242]) {
      const round = makeRound(id, seed);
      assert.equal(round.length, ROUND_LENGTH);
      const keys = round.map((question) => JSON.stringify([question.ask, question.show, question.answer]));
      assert.equal(new Set(keys).size, ROUND_LENGTH, `${id} seed ${seed} repeats a question`);
      assert.deepEqual(makeRound(id, seed), round);
    }
  }
});

test('stars start at 6, 8 and 10 right answers', () => {
  assert.deepEqual([0, 5, 6, 7, 8, 9, 10].map(starsFor), [0, 0, 1, 1, 2, 2, 3]);
});

test('a typed answer is read with either decimal mark and either minus', () => {
  assert.deepEqual(readTyped('2,5'), { kind: 'number', value: 2.5 });
  assert.deepEqual(readTyped('2.5'), { kind: 'number', value: 2.5 });
  assert.deepEqual(readTyped(`${MINUS}3`), { kind: 'number', value: -3 });
  assert.deepEqual(readTyped('-3'), { kind: 'number', value: -3 });
  assert.deepEqual(readTyped('3/4'), { kind: 'fraction', top: 3, bottom: 4 });
  assert.equal(readTyped(''), null);
  assert.equal(readTyped('1/0'), null);
  assert.equal(readTyped('1/'), null);
  assert.equal(readTyped('--3'), null);
  assert.equal(readTyped('3-'), null);
  assert.equal(readTyped('abc'), null);
  // The longest answer is 8 characters: 8 is read, 9 is not.
  assert.deepEqual(readTyped('12345678'), { kind: 'number', value: 12345678 });
  assert.equal(readTyped('123456789'), null);
});

test('a fraction answer takes any equal fraction, and a whole number only when it is whole', () => {
  const half = { kind: 'fraction', top: 1, bottom: 2 };
  assert.ok(typedIsRight('1/2', half));
  assert.ok(typedIsRight('2/4', half));
  assert.ok(!typedIsRight('1/3', half));
  assert.ok(!typedIsRight('0.5', half));
  const whole = { kind: 'fraction', top: 4, bottom: 4 };
  assert.ok(typedIsRight('1', whole));
  assert.ok(typedIsRight('4/4', whole));
  assert.ok(!typedIsRight('2', whole));
  const number = { kind: 'number', value: 0.75 };
  assert.ok(typedIsRight('0,75', number));
  assert.ok(typedIsRight('.75', number));
  assert.ok(!typedIsRight('3/4', number));
  assert.ok(!typedIsRight('0.7', number));
});

test('numbers are written the way each language writes them', () => {
  assert.equal(formatNumber(2.5, 'en'), '2.5');
  assert.equal(formatNumber(2.5, 'tr'), '2,5');
  assert.equal(formatNumber(-7, 'en'), `${MINUS}7`);
  assert.equal(formatNumber(1380, 'tr'), '1380');
  assert.equal(formatNumber(0.24, 'tr'), '0,24');
  assert.equal(formatPercent(85, 'en'), '85%');
  assert.equal(formatPercent(85, 'tr'), '%85');
});
