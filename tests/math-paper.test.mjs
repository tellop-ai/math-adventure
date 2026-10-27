/**
 * The squared paper (`lib/math/paper.js`): how a big sum is laid out in
 * places, how the cursor moves as a child writes, how the answer row is read
 * back, and the paper filled in right after the answer.
 *
 * The solved paper is checked against the question's own answer and against
 * the arithmetic of each place (the carry, the borrowing, the part rows), never
 * against itself.
 *
 * Pure: nothing here touches stored information.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  PAPER_TOPICS, boxId, chooseBox, eraseDigit, isBox, moveCursor, paperAnswer, paperFor, paperHint, placeKey, solvedPaper, startWriting, writeDigit,
} = await import('../lib/math/paper.js');
const { MESSAGES } = await import('../lib/i18n/index.js');
const { TOPIC_IDS, makeQuestion } = await import('../lib/math/topics.js');
const { typedIsRight } = await import('../lib/math/numbers.js');

const SEEDS = 600;

/** Every question of a topic over the seeds, with its paper. @param {string} topic */
function papersOf(topic) {
  return Array.from({ length: SEEDS }, (_, seed) => {
    const question = makeQuestion(topic, seed);
    return { question, paper: paperFor(question), what: `${topic} seed ${seed}` };
  });
}

/** A row of a paper as numbers by place, `null` where nothing is written. */
function rowOf(paper, cells, row) {
  return Array.from({ length: paper.places }, (_, place) => (cells[boxId(row, place)] === undefined ? null : Number(cells[boxId(row, place)])));
}

/** The value of digits by place (`null` as 0). */
function valueOf(digits) {
  return digits.reduce((total, digit) => total * 10 + (digit ?? 0), 0);
}

/** Cells for an answer row written as a string, a space for an empty box. */
function answerCells(written) {
  return Object.fromEntries([...written].flatMap((digit, place) => (digit === ' ' ? [] : [[boxId('answer', place), digit]])));
}

/* ---------- which sums go on paper, and how they stand ---------- */

test('every question of the five big-sum topics has a paper, and no other question does', () => {
  for (const topic of TOPIC_IDS) {
    for (let seed = 0; seed < 120; seed += 1) {
      const question = makeQuestion(topic, seed);
      assert.equal(paperFor(question) !== null, PAPER_TOPICS.includes(topic), `${topic} seed ${seed}`);
    }
  }
  assert.equal(paperFor({ topic: 'add-1000', show: [{ n: 5 }, { op: '+' }, { blank: true }, { op: '=' }, { n: 9 }] }), null, 'a box among the numbers');
  assert.equal(paperFor({ topic: 'add-1000', show: null }), null);
});

test('the numbers stand in places, ones on the right, with room for the longest answer but never the answer\'s own length', () => {
  for (const topic of PAPER_TOPICS.filter((id) => id !== 'long-share')) {
    for (const { question, paper, what } of papersOf(topic)) {
      const [first, , second] = question.show;
      const scale = paper.tenths ? 10 : 1;
      assert.equal(valueOf(paper.top.map((digit) => (digit === null ? null : Number(digit)))), Math.round(first.n * scale), what);
      assert.equal(valueOf(paper.bottom.map((digit) => (digit === null ? null : Number(digit)))), Math.round(second.n * scale), what);
      assert.equal(paper.top.at(-1) !== null && paper.bottom.at(-1) !== null, true, `${what}: both numbers end in the last place`);
      const top = paper.top.filter((digit) => digit !== null).length;
      const bottom = paper.bottom.filter((digit) => digit !== null).length;
      const room = { add: Math.max(top, bottom) + 1, take: Math.max(top, bottom), times: top + 1, long: top + bottom }[paper.kind];
      assert.equal(paper.places, room, what);
      assert.ok(paper.places <= 5, what);
    }
  }
  const long = paperFor(makeQuestion('big-times', 3));
  assert.deepEqual(long.rows.map((row) => row.id), ['small', 'part1', 'part2', 'answer']);
  assert.equal(long.rows[2].boxes.at(-1), false, 'no box under the ones in the second part row');
  assert.equal(paperFor({ topic: 'add-1000', show: [{ n: 562 }, { op: '+' }, { n: 438 }, { op: '=' }, { blank: true }] }).rows[0].boxes.at(-1), false, 'nothing is carried into the ones');
  const take = paperFor({ topic: 'add-1000', show: [{ n: 702 }, { op: '−' }, { n: 58 }, { op: '=' }, { blank: true }] });
  assert.equal(take.rows[0].size, 2, 'a digit after borrowing can be 12');
  assert.deepEqual(take.top, ['7', '0', '2']);
  assert.deepEqual(take.bottom, [null, '5', '8']);
  const decimals = paperFor({ topic: 'decimals', show: [{ n: 7.6 }, { op: '+' }, { n: 3.9 }, { op: '=' }, { blank: true }] });
  assert.deepEqual([decimals.places, decimals.tenths, decimals.top, decimals.bottom], [3, true, [null, '7', '6'], [null, '3', '9']]);
  assert.deepEqual([0, 1, 2].map((place) => placeKey(decimals, place)), ['tens', 'ones', 'tenths']);
});

/* ---------- the paper filled in right ---------- */

test('the solved paper\'s answer row reads back as the question\'s answer, in both languages', () => {
  for (const topic of PAPER_TOPICS) {
    for (const { question, paper, what } of papersOf(topic)) {
      const cells = solvedPaper(paper, question);
      for (const locale of ['en', 'tr']) {
        const read = paperAnswer(paper, cells, locale);
        assert.ok('text' in read, `${what} ${locale}`);
        assert.ok(typedIsRight(read.text, question.answer), `${what} ${locale}: ${read.text}`);
        if (paper.tenths) assert.match(read.text, locale === 'tr' ? /^\d+,\d$/u : /^\d+\.\d$/u, `${what} ${locale}`);
      }
      for (const id of Object.keys(cells)) assert.ok(isBox(paper, id), `${what}: ${id} is a box`);
    }
  }
});

test('adding and one-digit times: each place makes its answer digit with the carry written above it', () => {
  for (const topic of ['add-1000', 'long-times', 'decimals']) {
    for (const { question, paper, what } of papersOf(topic)) {
      if (paper.kind !== 'add' && paper.kind !== 'times') continue;
      const cells = solvedPaper(paper, question);
      const small = rowOf(paper, cells, 'small');
      const answer = rowOf(paper, cells, 'answer');
      const top = paper.top.map((digit) => (digit === null ? null : Number(digit)));
      const bottom = paper.bottom.map((digit) => (digit === null ? null : Number(digit)));
      const times = paper.kind === 'times' ? bottom.at(-1) : null;
      for (let place = paper.places - 1; place >= 0; place -= 1) {
        if (top[place] === null && (paper.kind === 'times' || bottom[place] === null)) continue;
        const total = (times === null ? (top[place] ?? 0) + (bottom[place] ?? 0) : (top[place] ?? 0) * times) + (small[place] ?? 0);
        assert.equal(total % 10, answer[place] ?? 0, `${what}: place ${place}`);
        // What a place carries is written above the next place, or, past the numbers, is the answer's first digit.
        const carried = place > 0 && (top[place - 1] !== null || (paper.kind === 'add' && bottom[place - 1] !== null))
          ? small[place - 1] ?? 0
          : valueOf(answer.slice(0, place));
        assert.equal(Math.floor(total / 10), carried, `${what}: carry from place ${place}`);
      }
      assert.equal(small.at(-1), null, `${what}: nothing above the last place`);
    }
  }
});

test('taking away: each digit after borrowing keeps the number\'s value and makes its answer digit', () => {
  for (const topic of ['add-1000', 'decimals']) {
    for (const { question, paper, what } of papersOf(topic)) {
      if (paper.kind !== 'take') continue;
      const cells = solvedPaper(paper, question);
      const small = rowOf(paper, cells, 'small');
      const answer = rowOf(paper, cells, 'answer');
      const shown = paper.top.map((digit, place) => small[place] ?? (digit === null ? 0 : Number(digit)));
      const weight = (place) => 10 ** (paper.places - 1 - place);
      assert.equal(
        shown.reduce((total, digit, place) => total + digit * weight(place), 0),
        valueOf(paper.top.map((digit) => (digit === null ? null : Number(digit)))),
        `${what}: borrowing never changes the number`,
      );
      for (let place = 0; place < paper.places; place += 1) {
        const bottom = paper.bottom[place] === null ? 0 : Number(paper.bottom[place]);
        assert.ok(shown[place] - bottom >= 0 && shown[place] - bottom <= 9, `${what}: place ${place}`);
        assert.equal(shown[place] - bottom, answer[place] ?? 0, `${what}: place ${place}`);
        if (small[place] !== null) assert.notEqual(String(small[place]), paper.top[place], `${what}: only a changed digit is written`);
      }
    }
  }
  const through = paperFor({ topic: 'add-1000', show: [{ n: 1000 }, { op: '−' }, { n: 999 }, { op: '=' }, { blank: true }] });
  const cells = solvedPaper(through, { show: [{ n: 1000 }, { op: '−' }, { n: 999 }] });
  assert.deepEqual(rowOf(through, cells, 'small'), [0, 9, 9, 10], 'borrowing through the zeros');
  assert.deepEqual(rowOf(through, cells, 'answer'), [null, null, null, 1]);
});

test('two-digit times: the part rows are the number times the ones and times the tens, one place left, and they add up', () => {
  for (const { question, paper, what } of papersOf('big-times')) {
    const cells = solvedPaper(paper, question);
    const [a, b] = [question.show[0].n, question.show[2].n];
    const part1 = rowOf(paper, cells, 'part1');
    const part2 = rowOf(paper, cells, 'part2');
    assert.equal(valueOf(part1), a * (b % 10), what);
    assert.equal(part2.at(-1), null, `${what}: the second row leaves the ones empty`);
    assert.equal(valueOf(part2.slice(0, -1)), a * Math.floor(b / 10), what);
    assert.equal(valueOf(part1) + valueOf(part2.slice(0, -1)) * 10, valueOf(rowOf(paper, cells, 'answer')), what);
    assert.equal(valueOf(rowOf(paper, cells, 'answer')), question.answer.value, what);
  }
});

/* ---------- reading the answer row back ---------- */

test('the answer row reads from its first digit; an empty box inside it or at its ones is a gap', () => {
  const whole = paperFor({ topic: 'add-1000', show: [{ n: 562 }, { op: '+' }, { n: 38 }, { op: '=' }, { blank: true }] });
  assert.equal(whole.places, 4);
  assert.deepEqual(paperAnswer(whole, {}, 'en'), { problem: 'empty' });
  assert.deepEqual(paperAnswer(whole, answerCells(' 600'), 'en'), { text: '600' });
  assert.deepEqual(paperAnswer(whole, answerCells('  60'), 'en'), { text: '60' });
  assert.deepEqual(paperAnswer(whole, answerCells('0600'), 'en'), { text: '0600' }, 'a 0 written in front is read, as typed');
  assert.deepEqual(paperAnswer(whole, answerCells(' 6 0'), 'en'), { problem: 'gap' });
  assert.deepEqual(paperAnswer(whole, answerCells(' 60 '), 'en'), { problem: 'gap' }, 'the ones are empty');
  const decimals = paperFor({ topic: 'decimals', show: [{ n: 7.6 }, { op: '+' }, { n: 3.9 }, { op: '=' }, { blank: true }] });
  assert.deepEqual(paperAnswer(decimals, answerCells('115'), 'en'), { text: '11.5' });
  assert.deepEqual(paperAnswer(decimals, answerCells('115'), 'tr'), { text: '11,5' });
  assert.deepEqual(paperAnswer(decimals, answerCells(' 7 '), 'tr'), { text: '7' }, 'an empty tenths box is a whole number');
  assert.deepEqual(paperAnswer(decimals, answerCells('  5'), 'en'), { text: '0.5' }, 'only tenths is 0 and tenths');
  assert.deepEqual(paperAnswer(decimals, answerCells('1 5'), 'en'), { problem: 'gap' });
  assert.deepEqual(paperAnswer(decimals, answerCells('1  '), 'en'), { problem: 'gap' });
  assert.equal(typedIsRight(paperAnswer(decimals, answerCells('115'), 'tr').text, { kind: 'number', value: 11.5 }), true);
});

/* ---------- writing on the paper ---------- */

test('a digit goes in the box at the cursor, and the cursor goes one box left, as a sum is written from the right', () => {
  const paper = paperFor({ topic: 'add-1000', show: [{ n: 562 }, { op: '+' }, { n: 438 }, { op: '=' }, { blank: true }] });
  let writing = startWriting(paper);
  assert.equal(writing.cursor, 'answer-3');
  for (const digit of '0001') writing = writeDigit(paper, writing, digit);
  assert.deepEqual(writing.cells, { 'answer-3': '0', 'answer-2': '0', 'answer-1': '0', 'answer-0': '1' });
  assert.equal(writing.cursor, 'answer-0', 'the cursor stays on the leftmost box');
  assert.deepEqual(paperAnswer(paper, writing.cells, 'en'), { text: '1000' });
  assert.equal(writeDigit(paper, writing, 'x'), writing, 'only a digit is written');
  // Backspace empties the box at the cursor, then each box to its right in turn.
  writing = eraseDigit(paper, writing);
  assert.equal(writing.cells['answer-0'], undefined);
  writing = eraseDigit(paper, writing);
  assert.deepEqual([writing.cursor, writing.cells['answer-1']], ['answer-1', undefined]);
});

test('a small box takes a carry and the cursor goes back to its row; after borrowing, a 1 waits for a second digit', () => {
  const adding = paperFor({ topic: 'add-1000', show: [{ n: 562 }, { op: '+' }, { n: 438 }, { op: '=' }, { blank: true }] });
  let writing = writeDigit(adding, startWriting(adding), '0');
  writing = chooseBox(adding, writing, 'small-2');
  writing = writeDigit(adding, writing, '1');
  assert.deepEqual([writing.cells['small-2'], writing.cursor], ['1', 'answer-2'], 'back where the answer goes on');
  assert.equal(chooseBox(adding, writing, 'small-3'), writing, 'no small box above the ones when adding');
  assert.equal(chooseBox(adding, writing, 'dragon-1'), writing);

  const taking = paperFor({ topic: 'add-1000', show: [{ n: 702 }, { op: '−' }, { n: 58 }, { op: '=' }, { blank: true }] });
  writing = chooseBox(taking, startWriting(taking), 'small-2');
  writing = writeDigit(taking, writing, '1');
  assert.equal(writing.cursor, 'small-2', 'a 1 may be the start of 12');
  writing = writeDigit(taking, writing, '2');
  assert.deepEqual([writing.cells['small-2'], writing.cursor], ['12', 'answer-2']);
  writing = chooseBox(taking, writing, 'small-2');
  writing = eraseDigit(taking, writing);
  assert.equal(writing.cells['small-2'], '1', 'Backspace takes the last digit off');
  writing = eraseDigit(taking, eraseDigit(taking, writing));
  assert.deepEqual([writing.cells['small-2'], writing.cursor], [undefined, 'answer-2'], 'an empty small box goes back to its row');

  // 364 − 127 written as on paper: 14 over the ones, 7, then 5 over the tens and the tens' 3: no digit is lost.
  const paper = paperFor({ topic: 'add-1000', show: [{ n: 364 }, { op: '−' }, { n: 127 }, { op: '=' }, { blank: true }] });
  let worked = startWriting(paper);
  for (const [box, digits] of [['small-2', '14'], [null, '7'], ['small-1', '5'], [null, '32']]) {
    if (box !== null) worked = chooseBox(paper, worked, box);
    for (const digit of digits) worked = writeDigit(paper, worked, digit);
  }
  assert.deepEqual(worked.cells, { 'small-2': '14', 'answer-2': '7', 'small-1': '5', 'answer-1': '3', 'answer-0': '2' });
  assert.deepEqual(paperAnswer(paper, worked.cells, 'en'), { text: '237' });
  // A digit typed in a small box that has one replaces it, so a wrong 5 is put right with one digit.
  worked = writeDigit(paper, chooseBox(paper, worked, 'small-1'), '4');
  assert.deepEqual([worked.cells['small-1'], worked.cursor], ['4', 'answer-0']);
});

test('the arrow keys move along a row and to the nearest box of the row above or below', () => {
  const paper = paperFor(makeQuestion('big-times', 3));
  let writing = startWriting(paper);
  assert.equal(writing.cursor, `part1-${paper.places - 1}`, 'two-digit times starts on the first part row');
  writing = moveCursor(paper, writing, 'down');
  assert.equal(writing.cursor, `part2-${paper.places - 2}`, 'no box under the ones: the nearest is the tens');
  writing = moveCursor(paper, writing, 'right');
  assert.equal(writing.cursor, `part2-${paper.places - 2}`, 'nothing further right');
  writing = moveCursor(paper, startWriting(paper), 'up');
  assert.equal(writing.cursor, `small-${paper.places - 2}`);
  assert.equal(writing.back, `part1-${paper.places - 1}`, 'a small box remembers the row it came from');
  assert.equal(moveCursor(paper, writing, 'up'), writing, 'nothing above the small boxes');
  let bottom = startWriting(paper);
  for (const direction of ['down', 'down', 'down', 'down']) bottom = moveCursor(paper, bottom, direction);
  assert.equal(bottom.cursor, `answer-${paper.places - 2}`);
  bottom = moveCursor(paper, bottom, 'left');
  assert.equal(bottom.cursor, `answer-${paper.places - 3}`);
});

/* ---------- long division ---------- */

/** The places of a row that hold a digit. */
function filled(paper, cells, row) {
  return rowOf(paper, cells, row).flatMap((digit, place) => (digit === null ? [] : [place]));
}

test('a division stands as written at school: the number, the divisor, and two rows for each of the number\'s digits', () => {
  for (const { question, paper, what } of papersOf('long-share')) {
    const [number, , divisor] = question.show;
    assert.equal(paper.kind, 'share', what);
    assert.equal(paper.top.join(''), String(number.n), what);
    assert.equal(paper.divisor, String(divisor.n), what);
    assert.equal(paper.places, String(number.n).length, `${what}: as many answer boxes as the number has digits`);
    assert.deepEqual(
      paper.rows.map((row) => row.id),
      ['answer', ...Array.from({ length: paper.places }, (_, at) => [`minus${at + 1}`, `rest${at + 1}`]).flat()],
      `${what}: never fewer rows when the sum needs fewer steps`,
    );
    assert.ok(paper.rows.every((row) => row.boxes.every(Boolean)), what);
  }
  assert.equal(paperFor(makeQuestion('long-share', 1), 'tr').layout, 'tr');
  assert.equal(paperFor(makeQuestion('long-share', 1), 'en').layout, 'en');
  assert.equal(paperFor(makeQuestion('long-share', 1)).layout, 'en');
});

test('each step of a division takes away its answer digit times the divisor, leaves less than the divisor, and brings the next digit down', () => {
  for (const locale of ['en', 'tr']) {
    for (const { question, what } of papersOf('long-share')) {
      const paper = paperFor(question, locale);
      const cells = solvedPaper(paper, question);
      const divisor = Number(paper.divisor);
      const top = paper.top.map(Number);
      const answer = rowOf(paper, cells, 'answer');
      const digits = [];
      let partial = null;
      let place = null;
      for (let step = 1; step <= paper.places; step += 1) {
        const minus = filled(paper, cells, `minus${step}`);
        if (minus.length === 0) {
          assert.equal(filled(paper, cells, `rest${step}`).length, 0, `${what} ${locale}: an empty step stays empty`);
          continue;
        }
        const at = minus.at(-1);
        if (place === null) {
          // The first step takes the number's first digits, as few as reach the divisor (or all of them).
          partial = valueOf(top.slice(0, at + 1));
          assert.ok(at === 0 || valueOf(top.slice(0, at)) < divisor, `${what} ${locale}: the first step takes as few digits as it can`);
        } else {
          assert.equal(at, place + 1, `${what} ${locale}: each step is one place to the right`);
        }
        const taken = Number(rowOf(paper, cells, `minus${step}`).filter((written) => written !== null).join(''));
        const digit = locale === 'en' ? answer[at] : answer[digits.length];
        assert.ok(digit !== null, `${what} ${locale}: step ${step} writes its answer digit`);
        assert.equal(taken, digit * divisor, `${what} ${locale}: step ${step} takes away digit × divisor`);
        const left = partial - taken;
        assert.ok(left >= 0 && left < divisor, `${what} ${locale}: step ${step} leaves less than the divisor`);
        const rest = rowOf(paper, cells, `rest${step}`);
        if (at < paper.places - 1) {
          assert.equal(rest[at + 1], top[at + 1], `${what} ${locale}: step ${step} brings the next digit down`);
          assert.equal(rest[at], left, `${what} ${locale}: step ${step} writes what is left`);
          partial = left * 10 + top[at + 1];
        } else {
          assert.equal(valueOf(rest), 0, `${what} ${locale}: nothing is left at the end`);
        }
        digits.push(digit);
        place = at;
      }
      assert.equal(place, paper.places - 1, `${what} ${locale}: the steps reach the last digit`);
      assert.equal(Number(digits.join('')), question.answer.value, `${what} ${locale}`);
      if (locale === 'tr') assert.deepEqual(answer.slice(0, digits.length), digits, `${what}: the answer written from the left`);
    }
  }
  const zero = { topic: 'long-share', show: [{ n: 412 }, { op: '÷' }, { n: 4 }, { op: '=' }, { blank: true }] };
  const paper = paperFor(zero, 'tr');
  const cells = solvedPaper(paper, zero);
  assert.deepEqual(rowOf(paper, cells, 'answer'), [1, 0, 3]);
  assert.deepEqual([rowOf(paper, cells, 'rest1'), rowOf(paper, cells, 'minus2')], [[0, 1, null], [null, 0, null]], 'a 0 in the answer takes away 0');
  const first = { topic: 'long-share', show: [{ n: 156 }, { op: '÷' }, { n: 4 }, { op: '=' }, { blank: true }] };
  const english = paperFor(first, 'en');
  assert.deepEqual(rowOf(english, solvedPaper(english, first), 'answer'), [null, 3, 9], 'in English each answer digit is above its place');
  assert.deepEqual(rowOf(english, solvedPaper(english, first), 'minus1'), [1, 2, null], '15 is the first number shared: 12 under it');
});

test('a division is written to the right, and its answer is read from its first digit to its last', () => {
  const question = { topic: 'long-share', show: [{ n: 156 }, { op: '÷' }, { n: 4 }, { op: '=' }, { blank: true }] };
  const paper = paperFor(question, 'tr');
  let writing = startWriting(paper);
  assert.equal(writing.cursor, 'answer-0');
  writing = writeDigit(paper, writeDigit(paper, writing, '3'), '9');
  assert.deepEqual([writing.cells, writing.cursor], [{ 'answer-0': '3', 'answer-1': '9' }, 'answer-2']);
  assert.deepEqual(paperAnswer(paper, writing.cells, 'tr'), { text: '39' }, 'an empty box after the answer is not part of it');
  writing = eraseDigit(paper, writing);
  assert.deepEqual([writing.cells, writing.cursor], [{ 'answer-0': '3' }, 'answer-1'], 'Backspace undoes the last digit, to the left');
  assert.deepEqual(paperAnswer(paper, { 'answer-1': '3', 'answer-2': '9' }, 'en'), { text: '39' }, 'nor one before it');
  assert.deepEqual(paperAnswer(paper, { 'answer-0': '3', 'answer-2': '9' }, 'en'), { problem: 'gap' });
  assert.deepEqual(paperAnswer(paper, {}, 'en'), { problem: 'empty' });
  // The working rows: 15, then 12 under it, written from the left too.
  writing = chooseBox(paper, writing, 'minus1-0');
  writing = writeDigit(paper, writeDigit(paper, writing, '1'), '2');
  assert.deepEqual([writing.cells['minus1-0'], writing.cells['minus1-1'], writing.cursor], ['1', '2', 'minus1-2']);
  assert.equal(moveCursor(paper, writing, 'down').cursor, 'rest1-2');
});

test('a division\'s hints say where its answer goes and that it is written from the left', () => {
  const division = paperFor(makeQuestion('long-share', 1));
  const column = paperFor(makeQuestion('add-1000', 1));
  assert.deepEqual([paperHint(division, 'empty'), paperHint(division, 'gap')], ['math.paper.writeFirstShare', 'math.paper.gapShare']);
  assert.deepEqual([paperHint(column, 'empty'), paperHint(column, 'gap')], ['math.paper.writeFirst', 'math.paper.gap']);
  for (const key of ['math.paper.writeFirstShare', 'math.paper.gapShare']) {
    for (const locale of ['en', 'tr']) assert.equal(typeof MESSAGES[locale][key], 'string', `${key} ${locale}`);
  }
  assert.doesNotMatch(MESSAGES.en['math.paper.gapShare'], /right/u);
  assert.doesNotMatch(MESSAGES.en['math.paper.writeFirstShare'], /bottom/u);
  assert.doesNotMatch(MESSAGES.tr['math.paper.gapShare'], /sağ/u);
});

test('in a Turkish division the arrows go across between the first row taken away and the answer beside it', () => {
  const question = { topic: 'long-share', show: [{ n: 156 }, { op: '÷' }, { n: 6 }, { op: '=' }, { blank: true }] };
  const paper = paperFor(question, 'tr');
  const at = (cursor) => ({ cells: {}, cursor, back: cursor });
  assert.equal(moveCursor(paper, at('minus1-2'), 'right').cursor, 'answer-0');
  assert.equal(moveCursor(paper, at('answer-0'), 'left').cursor, 'minus1-2');
  assert.equal(moveCursor(paper, at('answer-0'), 'right').cursor, 'answer-1');
  for (const [from, direction] of [['answer-1', 'up'], ['answer-1', 'down'], ['minus1-0', 'up']]) {
    assert.equal(moveCursor(paper, at(from), direction).cursor, from, `${direction} from ${from} goes nowhere: nothing is drawn there`);
  }
  assert.equal(moveCursor(paper, at('minus1-1'), 'down').cursor, 'rest1-1');
  assert.equal(moveCursor(paper, at('rest1-1'), 'up').cursor, 'minus1-1');
  // In English the answer is the row above the number: up and down as drawn.
  const english = paperFor(question, 'en');
  assert.equal(moveCursor(english, at('minus1-1'), 'up').cursor, 'answer-1');
  assert.equal(moveCursor(english, at('minus1-2'), 'right').cursor, 'minus1-2');
});
