/**
 * Squared paper to work a big sum out on, as on a real page: the two numbers
 * stand in places (ones on the right, one digit a square), with the sign at
 * the left and a line under them, and the child writes the answer one digit a
 * box, from the right. Small boxes above the top number take what is carried
 * (adding, times) or a digit after borrowing (taking away, up to two digits,
 * like 12). Two-digit times has two rows of part answers, the second one place
 * to the left with no box under the ones, and the sum under a second line, as
 * taught in Turkish schools (alt alta çarpma). Decimals keep the decimal mark
 * on the line after the ones.
 *
 * Long division (Bigger sharing) is laid out as the reader's school writes it:
 * in Turkish the number, a vertical line, the divisor on its right and the
 * answer under the divisor, written from the left (bölme işlemi); in English
 * the answer on top, each digit above its place, over a bracket around the
 * number with the divisor on its left. Under the number stand two rows for each
 * of its digits, so the paper never shows how many steps the sum takes: what
 * is taken away, and what is left with the next digit brought down. A division
 * is written to the right, as its answer is found from the left.
 *
 * A paper is the child's own working: nothing on it is checked or saved. Only
 * its answer row is read back (`paperAnswer`) and checked like a typed answer.
 * After the answer, `solvedPaper` fills the same paper in right.
 *
 * A box is named `<row>-<place>`, the places counted from the left. Rows, top
 * to bottom: `small`, then `part1` and `part2` for two-digit times, then
 * `answer`; for a division `answer`, then `minus1`, `rest1`, `minus2`, … one
 * pair for each digit of the number.
 *
 * Pure: the round screen draws a paper from this (`app/paper-board.jsx`).
 */

/** The topics whose sums can be worked out on paper. */
export const PAPER_TOPICS = Object.freeze(['add-1000', 'long-times', 'big-times', 'decimals', 'long-share']);

const SIGN_KIND = Object.freeze({ '+': 'add', '−': 'take', '×': 'times', '÷': 'share' });

/** The words key part of each place, counted from the ones. */
const WHOLE_PLACES = Object.freeze(['ones', 'tens', 'hundreds', 'thousands']);

/**
 * @typedef {{ id: string, boxes: readonly boolean[], size: number }} PaperRow
 * @typedef {{
 *   kind: 'add' | 'take' | 'times' | 'long' | 'share',
 *   sign: string,
 *   places: number,
 *   tenths: boolean,
 *   top: readonly (string | null)[],
 *   bottom: readonly (string | null)[],
 *   divisor: string,
 *   layout: 'tr' | 'en',
 *   step: -1 | 1,
 *   start: string,
 *   rows: readonly PaperRow[],
 * }} Paper
 * `step` is where the cursor goes after a digit: one box left, or right in a
 * division. `divisor` and `layout` are a division's; `bottom` is empty there.
 * @typedef {{ cells: Readonly<Record<string, string>>, cursor: string, back: string }} Writing
 */

/**
 * The digits of a number as a whole number of its smallest place: tenths for
 * a decimals sum, so 7.6 is `76`.
 *
 * @param {number} value
 * @param {boolean} tenths
 */
function placeDigits(value, tenths) {
  return scaledDigits(Math.round(tenths ? value * 10 : value), tenths);
}

/**
 * The digits of a whole number of the smallest place, with the ones written
 * in a decimals sum: `5` tenths is `05`, 0.5.
 *
 * @param {number} whole
 * @param {boolean} tenths
 */
function scaledDigits(whole, tenths) {
  return String(whole).padStart(tenths ? 2 : 1, '0');
}

/**
 * Digits standing right-aligned in `places` places, `null` where the number
 * has none; `shift` places left of the right edge.
 *
 * @param {string} digits
 * @param {number} places
 * @param {number} [shift]
 * @returns {(string | null)[]}
 */
function aligned(digits, places, shift = 0) {
  const row = Array(places).fill(null);
  for (let at = 0; at < digits.length; at += 1) row[places - shift - digits.length + at] = digits[at];
  return row;
}

/**
 * The paper for a question, or `null` when its sum is not one to write in
 * places: one of `PAPER_TOPICS`, shown as `a sign b = box`. A division is laid
 * out as `locale`'s schools write it.
 *
 * @param {{ topic: string, show: null | readonly any[] }} question
 * @param {'en' | 'tr'} [locale]
 * @returns {Paper | null}
 */
export function paperFor(question, locale = 'en') {
  if (!PAPER_TOPICS.includes(question.topic) || question.show === null || question.show.length !== 5) return null;
  const [first, sign, second, equals, box] = question.show;
  if (typeof first?.n !== 'number' || typeof second?.n !== 'number' || equals?.op !== '=' || box?.blank !== true) return null;
  if (!Object.hasOwn(SIGN_KIND, sign?.op) || first.n < 0 || second.n < 0) return null;
  const tenths = question.topic === 'decimals';
  const a = placeDigits(first.n, tenths);
  const b = placeDigits(second.n, tenths);
  let kind = SIGN_KIND[sign.op];
  if (kind === 'share') return sharePaper(a, b, locale);
  if (kind === 'times' && b.length > 1) kind = 'long';
  const widest = Math.max(a.length, b.length);
  // Room for the longest answer such a sum can have, never the answer's own length.
  const places = kind === 'take' ? widest : kind === 'long' ? a.length + b.length : widest + 1;
  const every = Array(places).fill(true);
  const butOnes = every.map((_, at) => at < places - 1);
  const rows = [{ id: 'small', boxes: kind === 'take' ? every : butOnes, size: kind === 'take' ? 2 : 1 }];
  if (kind === 'long') rows.push({ id: 'part1', boxes: every, size: 1 }, { id: 'part2', boxes: butOnes, size: 1 });
  rows.push({ id: 'answer', boxes: every, size: 1 });
  return Object.freeze({
    kind,
    sign: sign.op,
    places,
    tenths,
    top: Object.freeze(aligned(a, places)),
    bottom: Object.freeze(aligned(b, places)),
    divisor: '',
    layout: locale === 'tr' ? 'tr' : 'en',
    step: -1,
    start: boxId(rows[1].id, places - 1),
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row, boxes: Object.freeze(row.boxes) }))),
  });
}

/**
 * A division's paper: the number's digits, the divisor, the answer's boxes
 * (as many as the number has digits) and two rows for each of those digits.
 *
 * @param {string} number
 * @param {string} divisor
 * @param {'en' | 'tr'} locale
 * @returns {Paper}
 */
function sharePaper(number, divisor, locale) {
  const places = number.length;
  const every = Object.freeze(Array(places).fill(true));
  const rows = [{ id: 'answer', boxes: every, size: 1 }];
  for (let step = 1; step <= places; step += 1) rows.push({ id: `minus${step}`, boxes: every, size: 1 }, { id: `rest${step}`, boxes: every, size: 1 });
  return Object.freeze({
    kind: 'share',
    sign: '÷',
    places,
    tenths: false,
    top: Object.freeze([...number]),
    bottom: Object.freeze(Array(places).fill(null)),
    divisor,
    layout: locale === 'tr' ? 'tr' : 'en',
    step: 1,
    start: boxId('answer', 0),
    rows: Object.freeze(rows.map((row) => Object.freeze(row))),
  });
}

/** @param {string} row @param {number} place */
export function boxId(row, place) {
  return `${row}-${place}`;
}

/** @param {Paper} paper @param {string} id */
function rowAndPlace(paper, id) {
  const cut = id.lastIndexOf('-');
  const row = paper.rows.findIndex((entry) => entry.id === id.slice(0, cut));
  return { row, place: Number(id.slice(cut + 1)) };
}

/** Whether a name is a box of the paper. @param {Paper} paper @param {string} id */
export function isBox(paper, id) {
  const { row, place } = rowAndPlace(paper, id);
  return row >= 0 && Number.isInteger(place) && paper.rows[row].boxes[place] === true;
}

/**
 * The words key of a place, counted from the left: `ones`, `tens`, … or
 * `tenths`.
 *
 * @param {Paper} paper
 * @param {number} place
 */
export function placeKey(paper, place) {
  const fromRight = paper.places - 1 - place;
  if (paper.tenths) return fromRight === 0 ? 'tenths' : WHOLE_PLACES[fromRight - 1];
  return WHOLE_PLACES[fromRight];
}

/**
 * An empty paper, the cursor on the first box to write: the answer's ones, the
 * first part row's ones in two-digit times, or a division's first answer box.
 *
 * @param {Paper} paper
 * @returns {Writing}
 */
export function startWriting(paper) {
  return Object.freeze({ cells: Object.freeze({}), cursor: paper.start, back: paper.start });
}

/** @param {Paper} paper @param {string} id */
function isSmall(paper, id) {
  const { row } = rowAndPlace(paper, id);
  return row >= 0 && paper.rows[row].id === 'small';
}

/**
 * The next box in a row from a place, going left (`-1`) or right (`+1`), or
 * `null` at the row's end.
 *
 * @param {Paper} paper
 * @param {number} row
 * @param {number} place
 * @param {number} step
 */
function along(paper, row, place, step) {
  for (let at = place + step; at >= 0 && at < paper.places; at += step) {
    if (paper.rows[row].boxes[at]) return boxId(paper.rows[row].id, at);
  }
  return null;
}

/**
 * The cursor moved to a box. A small box remembers the box of a row the cursor
 * came from, to go back to.
 *
 * @param {Paper} paper
 * @param {Writing} writing
 * @param {string} id
 * @returns {Writing}
 */
export function chooseBox(paper, writing, id) {
  if (!isBox(paper, id)) return writing;
  const back = isSmall(paper, writing.cursor) ? writing.back : writing.cursor;
  return Object.freeze({ ...writing, cursor: id, back: isSmall(paper, id) ? back : id });
}

/**
 * A digit written in the box at the cursor. In a row, the cursor then goes one
 * box left, as a sum is written from the right (one box right in a division,
 * written from the left). A small box takes one digit
 * and the cursor goes back to the row it came from, except when taking away a
 * first 1, which waits for a second digit: a digit after borrowing is 10 to 18,
 * or one digit lowered by one (6 to 5), so only a 1 can start two digits. A
 * digit typed in a small box that already has one replaces it, except after
 * that waiting 1.
 *
 * @param {Paper} paper
 * @param {Writing} writing
 * @param {string} digit
 * @returns {Writing}
 */
export function writeDigit(paper, writing, digit) {
  if (!/^[0-9]$/u.test(digit)) return writing;
  const { row, place } = rowAndPlace(paper, writing.cursor);
  if (isSmall(paper, writing.cursor)) {
    const now = writing.cells[writing.cursor] ?? '';
    const two = paper.rows[0].size === 2;
    const written = two && now === '1' ? `${now}${digit}` : digit;
    const cells = Object.freeze({ ...writing.cells, [writing.cursor]: written });
    return Object.freeze({ cells, cursor: two && written === '1' ? writing.cursor : writing.back, back: writing.back });
  }
  const cells = Object.freeze({ ...writing.cells, [writing.cursor]: digit });
  const next = along(paper, row, place, paper.step) ?? writing.cursor;
  return Object.freeze({ cells, cursor: next, back: next });
}

/**
 * Backspace: the box at the cursor emptied (a small box loses its last
 * digit). On an empty box of a row, the box the cursor came from (to its
 * right, or its left in a division) is emptied and the cursor goes there,
 * undoing the last digit written; on an empty small box, the cursor goes back
 * to its row.
 *
 * @param {Paper} paper
 * @param {Writing} writing
 * @returns {Writing}
 */
export function eraseDigit(paper, writing) {
  const now = writing.cells[writing.cursor] ?? '';
  const { row, place } = rowAndPlace(paper, writing.cursor);
  if (now !== '') {
    const cells = { ...writing.cells };
    if (now.length > 1) cells[writing.cursor] = now.slice(0, -1);
    else delete cells[writing.cursor];
    return Object.freeze({ ...writing, cells: Object.freeze(cells) });
  }
  if (isSmall(paper, writing.cursor)) return Object.freeze({ ...writing, cursor: writing.back });
  const before = along(paper, row, place, -paper.step);
  if (before === null) return writing;
  const cells = { ...writing.cells };
  delete cells[before];
  return Object.freeze({ cells: Object.freeze(cells), cursor: before, back: before });
}

/**
 * The cursor moved by an arrow key: along its row, or to the nearest box of
 * the row above or below. A Turkish division's answer is drawn to the right of
 * the first row taken away, so the arrows go across between them, and up or
 * down from either of them goes only where a row is drawn.
 *
 * @param {Paper} paper
 * @param {Writing} writing
 * @param {'left' | 'right' | 'up' | 'down'} direction
 * @returns {Writing}
 */
export function moveCursor(paper, writing, direction) {
  const { row, place } = rowAndPlace(paper, writing.cursor);
  if (paper.kind === 'share' && paper.layout === 'tr' && (row === 0 || row === 1)) {
    const last = paper.places - 1;
    if (row === 0 && direction === 'left' && place === 0) return chooseBox(paper, writing, boxId('minus1', last));
    if (row === 1 && direction === 'right' && place === last) return chooseBox(paper, writing, boxId('answer', 0));
    if (direction === 'up' || (row === 0 && direction === 'down')) return writing;
  }
  if (direction === 'left' || direction === 'right') {
    const next = along(paper, row, place, direction === 'left' ? -1 : 1);
    return next === null ? writing : chooseBox(paper, writing, next);
  }
  const target = row + (direction === 'up' ? -1 : 1);
  if (target < 0 || target >= paper.rows.length) return writing;
  const boxes = paper.rows[target].boxes;
  let best = -1;
  for (let at = 0; at < paper.places; at += 1) {
    if (boxes[at] && (best === -1 || Math.abs(at - place) < Math.abs(best - place))) best = at;
  }
  return best === -1 ? writing : chooseBox(paper, writing, boxId(paper.rows[target].id, best));
}

/**
 * The words key of the hint for an answer row that cannot be read: a
 * division's answer is not the bottom row and is written from the left.
 *
 * @param {Paper} paper
 * @param {'empty' | 'gap'} problem
 */
export function paperHint(paper, problem) {
  const share = paper.kind === 'share' ? 'Share' : '';
  return problem === 'empty' ? `math.paper.writeFirst${share}` : `math.paper.gap${share}`;
}

/**
 * The answer row read back as typed text, the decimal mark as the reader's
 * language writes it: `{ text }`, or `{ problem }` when it is `empty` or has a
 * `gap` (an empty box between its digits, or an empty ones box after them).
 * Empty boxes on its left are not part of it; in a decimals sum an empty
 * tenths box reads as a whole number. A division's answer is written from the
 * left (Turkish) or above its places (English), so empty boxes on either side
 * of it are not part of it.
 *
 * @param {Paper} paper
 * @param {Readonly<Record<string, string>>} cells
 * @param {'en' | 'tr'} locale
 * @returns {{ text: string } | { problem: 'empty' | 'gap' }}
 */
export function paperAnswer(paper, cells, locale) {
  const digits = Array.from({ length: paper.places }, (_, place) => cells[boxId('answer', place)] ?? '');
  const first = digits.findIndex((digit) => digit !== '');
  if (first === -1) return { problem: 'empty' };
  const last = digits.findLastIndex((digit) => digit !== '');
  if (paper.kind === 'share') return digits.slice(first, last + 1).includes('') ? { problem: 'gap' } : { text: digits.slice(first, last + 1).join('') };
  const ones = paper.tenths ? paper.places - 2 : paper.places - 1;
  if (digits.slice(first, last + 1).includes('') || last < ones) return { problem: 'gap' };
  const whole = first > ones ? '0' : digits.slice(first, ones + 1).join('');
  if (!paper.tenths || digits[paper.places - 1] === '') return { text: whole };
  return { text: `${whole}${locale === 'tr' ? ',' : '.'}${digits[paper.places - 1]}` };
}

/**
 * The paper filled in right: the answer, the carries of adding and one-digit
 * times above the places they go to, the digits after borrowing in taking
 * away above the places that changed, and the part rows of two-digit times.
 * A division, from the left: once the digits taken reach the divisor, each step
 * writes its answer digit, what it takes away under the digits it is taken
 * from, and what is left with the next digit brought down beside it (a 0 left
 * is written, as `04`). A 0 inside the answer (412 ÷ 4 = 103) takes a step of
 * its own, taking away 0.
 *
 * @param {Paper} paper
 * @param {{ show: readonly any[] }} question
 * @returns {Readonly<Record<string, string>>}
 */
export function solvedPaper(paper, question) {
  const a = Number(placeDigits(question.show[0].n, paper.tenths));
  const b = Number(placeDigits(question.show[2].n, paper.tenths));
  /** @type {Record<string, string>} */
  const cells = {};
  const write = (row, digits, shift = 0) => {
    aligned(digits, paper.places, shift).forEach((digit, place) => {
      if (digit !== null) cells[boxId(row, place)] = digit;
    });
  };
  const digitAt = (row, place) => Number(row[place] ?? '0');
  if (paper.kind === 'share') {
    const divisor = Number(paper.divisor);
    let current = 0;
    let step = 0;
    for (let place = 0; place < paper.places; place += 1) {
      current = current * 10 + digitAt(paper.top, place);
      if (step === 0 && current < divisor && place < paper.places - 1) continue;
      step += 1;
      const digit = Math.floor(current / divisor);
      cells[boxId('answer', paper.layout === 'en' ? place : step - 1)] = String(digit);
      write(`minus${step}`, String(digit * divisor), paper.places - 1 - place);
      current -= digit * divisor;
      if (place < paper.places - 1) write(`rest${step}`, `${current}${paper.top[place + 1]}`, paper.places - 2 - place);
      else write(`rest${step}`, String(current));
    }
    return Object.freeze(cells);
  }
  const hasDigit = (place) => place >= 0 && (paper.top[place] !== null || paper.bottom[place] !== null);
  if (paper.kind === 'add') {
    let carry = 0;
    for (let place = paper.places - 1; place >= 0; place -= 1) {
      const total = digitAt(paper.top, place) + digitAt(paper.bottom, place) + carry;
      carry = Math.floor(total / 10);
      if (carry > 0 && hasDigit(place - 1)) cells[boxId('small', place - 1)] = String(carry);
    }
    write('answer', scaledDigits(a + b, paper.tenths));
  } else if (paper.kind === 'take') {
    let borrow = 0;
    for (let place = paper.places - 1; place >= 0; place -= 1) {
      const top = digitAt(paper.top, place);
      let value = top - borrow;
      borrow = 0;
      if (value < digitAt(paper.bottom, place)) {
        value += 10;
        borrow = 1;
      }
      if (value !== top && paper.top[place] !== null) cells[boxId('small', place)] = String(value);
    }
    write('answer', scaledDigits(a - b, paper.tenths));
  } else if (paper.kind === 'times') {
    let carry = 0;
    for (let place = paper.places - 1; place >= 0; place -= 1) {
      const total = digitAt(paper.top, place) * b + carry;
      carry = Math.floor(total / 10);
      if (carry > 0 && place > 0 && paper.top[place - 1] !== null) cells[boxId('small', place - 1)] = String(carry);
    }
    write('answer', String(a * b));
  } else {
    write('part1', String(a * (b % 10)));
    write('part2', String(a * Math.floor(b / 10)), 1);
    write('answer', String(a * b));
  }
  return Object.freeze(cells);
}
