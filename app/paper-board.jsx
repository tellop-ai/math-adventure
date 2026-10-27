import { Button } from '@/components/ui/button';

import { t } from '../lib/i18n/index.js';
import { boxId, placeKey } from '../lib/math/paper.js';

/** Lets a key press reach the page, not a box that kept focus after a click. */
function letGo(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

/**
 * A row's name for a screen reader; a division's rows carry their step.
 *
 * @param {string} row
 * @param {'en' | 'tr'} locale
 */
function rowWords(row, locale) {
  const step = /^(minus|rest)(\d+)$/u.exec(row);
  return step === null ? t(`math.paper.row.${row}`, locale) : t(`math.paper.row.${step[1]}`, locale, { n: Number(step[2]) });
}

/**
 * One box of a paper. With `onChoose` it is pressed to put the cursor on it,
 * and the box at `cursor` is marked: it is where the next digit goes. Without
 * it, only the digit written in it is shown.
 *
 * @param {{
 *   paper: import('../lib/math/paper.js').Paper,
 *   row: string,
 *   place: number,
 *   cells: Readonly<Record<string, string>>,
 *   cursor: string | null,
 *   locale: 'en' | 'tr',
 *   onChoose?: (id: string) => void,
 * }} props
 */
function PaperBox({ paper, row, place, cells, cursor, locale, onChoose }) {
  const id = boxId(row, place);
  const digit = cells[id] ?? '';
  if (onChoose === undefined) return <span className="math-paper-written">{digit}</span>;
  // A Turkish division's answer is written from the left under the divisor: its boxes are counted, not places.
  const where = paper.kind === 'share' && paper.layout === 'tr' && row === 'answer'
    ? t('math.paper.digit', locale, { n: place + 1 })
    : t(`math.paper.place.${placeKey(paper, place)}`, locale);
  const words = t('math.paper.box', locale, {
    row: rowWords(row, locale),
    place: where,
    digit: digit === '' ? t('math.paper.empty', locale) : digit,
  });
  return (
    <Button
      variant="outline"
      className="math-paper-box"
      data-cursor={id === cursor ? 'true' : undefined}
      aria-label={words}
      aria-current={id === cursor ? 'true' : undefined}
      onClick={(event) => { letGo(event); onChoose(id); }}
    >
      {digit}
    </Button>
  );
}

/**
 * Squared paper on the screen, laid out by `lib/math/paper.js`: the small
 * boxes, the two numbers with the sign and a line under them, the part rows of
 * two-digit times with a second sign and line, and the answer row; a division
 * as the reader's school writes it (`ShareBoard`). Every row is one square high
 * and every place one square wide, so the digits stand in the paper's squares;
 * the decimal mark sits on the line after the ones. In taking away, a top digit
 * with a digit written above it is crossed out, as on paper after borrowing.
 *
 * With `onChoose` the boxes can be pressed, and the box at `cursor` is marked.
 * Without it the paper is only shown: the child's own once answered, or the
 * paper filled in right.
 *
 * @param {{
 *   paper: import('../lib/math/paper.js').Paper,
 *   cells: Readonly<Record<string, string>>,
 *   cursor?: string | null,
 *   label: string,
 *   locale: 'en' | 'tr',
 *   onChoose?: (id: string) => void,
 * }} props
 */
export function PaperBoard({ paper, cells, cursor = null, label, locale, onChoose }) {
  if (paper.kind === 'share') return <ShareBoard paper={paper} cells={cells} cursor={cursor} label={label} locale={locale} onChoose={onChoose} />;
  const mark = locale === 'tr' ? ',' : '.';
  const markAt = paper.tenths ? paper.places - 2 : -1;
  const places = Array.from({ length: paper.places }, (_, place) => place);

  /** @param {import('../lib/math/paper.js').PaperRow} row @param {string} sign @param {boolean} line */
  function writtenRow(row, sign = '', line = false) {
    return (
      <div key={row.id} className="math-paper-row" data-row={row.id === 'small' ? 'small' : 'write'} data-line={line ? 'under' : undefined}>
        <span className="math-paper-cell math-paper-sign" aria-hidden="true">{sign}</span>
        {places.map((place) => (
          <span key={place} className="math-paper-cell" data-mark={row.id === 'answer' && place === markAt ? mark : undefined}>
            {row.boxes[place] ? <PaperBox paper={paper} row={row.id} place={place} cells={cells} cursor={cursor} locale={locale} onChoose={onChoose} /> : null}
          </span>
        ))}
      </div>
    );
  }

  /** @param {readonly (string | null)[]} digits @param {string} sign @param {boolean} line @param {boolean} [top] */
  function numberRow(digits, sign, line, top = false) {
    const crossed = (place) => top && paper.kind === 'take' && digits[place] !== null && (cells[boxId('small', place)] ?? '') !== '';
    return (
      <div className="math-paper-row" data-line={line ? 'under' : undefined} aria-hidden="true">
        <span className="math-paper-cell math-paper-sign">{sign}</span>
        {places.map((place) => (
          <span key={place} className="math-paper-cell" data-mark={place === markAt ? mark : undefined} data-crossed={crossed(place) ? 'true' : undefined}>
            {digits[place] ?? ''}
          </span>
        ))}
      </div>
    );
  }

  const [small, ...rows] = paper.rows;
  return (
    <div className="math-paper" role="group" aria-label={label}>
      {writtenRow(small)}
      {numberRow(paper.top, '', false, true)}
      {numberRow(paper.bottom, paper.sign, true)}
      {rows.map((row) => writtenRow(row, row.id === 'part2' ? '+' : '', row.id === 'part2'))}
    </div>
  );
}

/**
 * A division on squared paper, as the reader's school writes it. Turkish: the
 * number, a vertical line, the divisor on its right with a line under it, and
 * the answer's boxes under the divisor. English: the answer's boxes on top, one
 * above each place, over a bracket around the number, the divisor on the
 * bracket's left. Under the number, in both, each step's row of what is taken
 * away (a minus sign on its left, a line under it) and its row of what is left.
 *
 * @param {{
 *   paper: import('../lib/math/paper.js').Paper,
 *   cells: Readonly<Record<string, string>>,
 *   cursor: string | null,
 *   label: string,
 *   locale: 'en' | 'tr',
 *   onChoose?: (id: string) => void,
 * }} props
 */
function ShareBoard({ paper, cells, cursor, label, locale, onChoose }) {
  const places = Array.from({ length: paper.places }, (_, place) => place);
  const boxes = (row) => places.map((place) => (
    <span key={place} className="math-paper-cell">
      <PaperBox paper={paper} row={row} place={place} cells={cells} cursor={cursor} locale={locale} onChoose={onChoose} />
    </span>
  ));
  const digits = places.map((place) => <span key={place} className="math-paper-cell">{paper.top[place]}</span>);
  const sign = (text) => <span className="math-paper-cell math-paper-sign" aria-hidden="true">{text}</span>;
  const [, ...steps] = paper.rows;

  /** @param {import('../lib/math/paper.js').PaperRow} row @param {import('react').ReactNode} [side] */
  function stepRow(row, side = null) {
    const minus = row.id.startsWith('minus');
    return (
      <div key={row.id} className="math-paper-row">
        <span className="math-paper-part" data-line={minus ? 'under' : undefined}>
          {sign(minus ? '−' : '')}
          {boxes(row.id)}
        </span>
        {side}
      </div>
    );
  }

  if (paper.layout === 'tr') {
    const [first, ...rest] = steps;
    return (
      <div className="math-paper" role="group" aria-label={label}>
        <div className="math-paper-row" aria-hidden="true">
          <span className="math-paper-part">{sign('')}{digits}</span>
          <span className="math-paper-part" data-edge="left" data-line="under">
            <span className="math-paper-cell">{paper.divisor}</span>
            {places.slice(1).map((place) => <span key={place} className="math-paper-cell" />)}
          </span>
        </div>
        {stepRow(first, <span className="math-paper-part" data-edge="left">{boxes('answer')}</span>)}
        {rest.map((row) => stepRow(row))}
      </div>
    );
  }
  return (
    <div className="math-paper" role="group" aria-label={label}>
      <div className="math-paper-row">
        {sign('')}
        {boxes('answer')}
      </div>
      <div className="math-paper-row" aria-hidden="true">
        <span className="math-paper-cell">{paper.divisor}</span>
        <span className="math-paper-part" data-bracket="true">{digits}</span>
      </div>
      {steps.map((row) => stepRow(row))}
    </div>
  );
}
