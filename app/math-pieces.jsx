import { Star } from 'lucide-react';

import { t } from '../lib/i18n/index.js';
import { formatNumber, MINUS } from '../lib/math/numbers.js';

/**
 * The pieces every screen draws: a sum, the picture beside a question, a row of
 * stars, and the words of a question. Plain components with no state, used by
 * the game's screens.
 *
 * A sum is a list of pieces (see `lib/math/topics.js`). Each piece is drawn by
 * a class the stylesheet knows; nothing here writes a style.
 */

const BRACKET_AFTER = new Set(['+', MINUS, '×', '÷']);

/**
 * Whether a negative number needs brackets: right after a sign, so that
 * `4 − (−3)` never reads as `4 − −3`.
 *
 * @param {any} before
 */
function bracketsAfter(before) {
  return before !== undefined && typeof before.op === 'string' && BRACKET_AFTER.has(before.op);
}

/**
 * A number as text, in brackets when it is negative and asked to be.
 *
 * @param {number} value
 * @param {'en' | 'tr'} locale
 * @param {boolean} bracket
 */
function numberText(value, locale, bracket) {
  const text = formatNumber(value, locale);
  return bracket && value < 0 ? `(${text})` : text;
}

/**
 * The letter x with its number in front and its power: `3x²`, `−x`, `x`.
 *
 * @param {number} times
 * @param {'en' | 'tr'} locale
 */
function timesText(times, locale) {
  if (times === 1) return '';
  if (times === -1) return MINUS;
  return formatNumber(times, locale);
}

/**
 * A sum as words for a screen reader: powers and roots said in the reader's
 * language, and the box said as "box" or, once answered, as the answer.
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
      if ('n' in piece) return numberText(piece.n, locale, bracketsAfter(pieces[at - 1]));
      if ('op' in piece) return piece.op;
      if ('f' in piece) return `${formatNumber(piece.f[0], locale)}/${formatNumber(piece.f[1], locale)}`;
      if ('blank' in piece) return box;
      if ('pow' in piece) return power(numberText(piece.pow[0], locale, true), piece.pow[1]);
      if ('sqrt' in piece) return t('math.read.root', locale, { n: formatNumber(piece.sqrt, locale) });
      if ('x' in piece) {
        const letter = `${timesText(piece.x[0], locale)}x`;
        return piece.x[1] === 1 ? letter : power(letter, piece.x[1]);
      }
      if ('sup' in piece) return t('math.read.raised', locale, { power: piece.sup === null ? box : String(piece.sup) });
      return '';
    })
    .join(' ');
}

/**
 * A fraction, its top number over its bottom one.
 *
 * @param {{ top: number, bottom: number, locale: 'en' | 'tr' }} props
 */
function Fraction({ top, bottom, locale }) {
  return (
    <span className="math-frac">
      <span className="math-frac-top">{formatNumber(top, locale)}</span>
      <span className="math-frac-bottom">{formatNumber(bottom, locale)}</span>
    </span>
  );
}

/**
 * The answer box: empty while the question waits, then holding the answer
 * (a fraction stacked, like the fractions in the sum).
 *
 * @param {{ small?: boolean, answer: any, locale: 'en' | 'tr' }} props
 */
function Box({ small = false, answer, locale }) {
  const shape = small ? 'math-box math-box-small rounded-sm' : 'math-box rounded-sm';
  if (answer === null) return <span className={shape} />;
  return (
    <span className={`${shape} math-box-filled`}>
      {answer.kind === 'fraction' ? <Fraction top={answer.top} bottom={answer.bottom} locale={locale} /> : answerText(answer, locale)}
    </span>
  );
}

/** The class of a sign: brackets and commas sit against the number beside them. */
const SIGN_CLASS = Object.freeze({ '(': 'math-op math-open', ')': 'math-op math-close', ',': 'math-op math-comma' });

/**
 * One piece of a sum.
 *
 * A raised power is placed from the line the numbers stand on (`.math-sup`),
 * and a square root draws its sign and its top line as one shape around the
 * number (`.math-root`), so neither depends on how a typeface draws them.
 *
 * @param {{ piece: any, before: any, locale: 'en' | 'tr', answer: any }} props
 */
function Piece({ piece, before, locale, answer }) {
  if ('n' in piece) return <span className="math-n">{numberText(piece.n, locale, bracketsAfter(before))}</span>;
  if ('op' in piece) return <span className={SIGN_CLASS[piece.op] ?? 'math-op'}>{piece.op}</span>;
  if ('f' in piece) return <Fraction top={piece.f[0]} bottom={piece.f[1]} locale={locale} />;
  if ('blank' in piece) return <Box answer={answer} locale={locale} />;
  if ('pow' in piece) {
    return (
      <span className="math-n">
        {numberText(piece.pow[0], locale, true)}
        <sup className="math-sup">{piece.pow[1] === null ? <Box small answer={answer} locale={locale} /> : piece.pow[1]}</sup>
      </span>
    );
  }
  if ('sqrt' in piece) {
    return (
      <span className="math-n">
        <span className="math-root">{formatNumber(piece.sqrt, locale)}</span>
      </span>
    );
  }
  if ('x' in piece) {
    return (
      <span className="math-n">
        {timesText(piece.x[0], locale)}
        <span className="math-x">x</span>
        {piece.x[1] === 1 ? null : <sup className="math-sup math-sup-x">{piece.x[1]}</sup>}
      </span>
    );
  }
  if ('sup' in piece) {
    return (
      <span className="math-n math-after-bracket">
        <sup className="math-sup">{piece.sup === null ? <Box small answer={answer} locale={locale} /> : piece.sup}</sup>
      </span>
    );
  }
  return null;
}

/**
 * A sum, drawn big for a question or small for a card or a worked line. Once
 * the question is answered, `answer` goes in its box.
 *
 * @param {{ pieces: readonly any[], locale: 'en' | 'tr', size?: 'big' | 'small', answer?: any }} props
 */
export function Sum({ pieces, locale, size = 'big', answer = null }) {
  return (
    <span className={`math-sum math-sum-${size}`} role="img" aria-label={sumText(pieces, locale, answer)}>
      {pieces.map((piece, at) => (
        <Piece key={at} piece={piece} before={pieces[at - 1]} locale={locale} answer={answer} />
      ))}
    </span>
  );
}

/**
 * Things to count: a row of the same picture, some crossed out.
 *
 * @param {{ thing: string, count: number, crossed?: number }} props
 */
function Things({ thing, count, crossed = 0 }) {
  return (
    <span className="math-things" aria-hidden="true">
      {Array.from({ length: count }, (_, at) => (
        <span key={at} className={at >= count - crossed ? 'math-thing math-thing-crossed' : 'math-thing'}>
          {thing}
        </span>
      ))}
    </span>
  );
}

/**
 * The shape class for a rectangle, from how much longer than wide it is.
 *
 * @param {number} long
 * @param {number} wide
 */
function rectangleShape(long, wide) {
  const ratio = long / wide;
  if (ratio <= 1) return 'math-rect-square';
  if (ratio < 1.6) return 'math-rect-near';
  if (ratio < 2.5) return 'math-rect-mid';
  return 'math-rect-wide';
}

/**
 * The picture beside a question, or nothing.
 *
 * @param {{ picture: any, locale: 'en' | 'tr' }} props
 */
export function QuestionPicture({ picture, locale }) {
  if (picture === null) return null;
  if (picture.kind === 'things') {
    return (
      <div className="math-picture" role="img" aria-label={t(picture.crossed > 0 ? 'math.picture.crossed' : 'math.picture.count', locale)}>
        <Things thing={picture.thing} count={picture.count} crossed={picture.crossed} />
      </div>
    );
  }
  if (picture.kind === 'groups') {
    return (
      <div className="math-picture math-picture-groups" role="img" aria-label={t('math.picture.groups', locale)}>
        <span className="math-group"><Things thing={picture.thing} count={picture.groups[0]} /></span>
        <span className="math-op" aria-hidden="true">+</span>
        <span className="math-group"><Things thing={picture.thing} count={picture.groups[1]} /></span>
      </div>
    );
  }
  if (picture.kind === 'rectangle') {
    const cm = t('math.unit.cm', locale);
    return (
      <div className="math-picture" role="img" aria-label={t('math.picture.rectangle', locale, { a: picture.long, b: picture.wide })}>
        <span className="math-rect-frame" aria-hidden="true">
          <span className={`math-rect ${rectangleShape(picture.long, picture.wide)}`} />
          <span className="math-rect-side">{`${formatNumber(picture.wide, locale)} ${cm}`}</span>
          <span className="math-rect-bottom">{`${formatNumber(picture.long, locale)} ${cm}`}</span>
        </span>
      </div>
    );
  }
  return null;
}

/**
 * Three stars, `count` of them won, with words for a screen reader.
 *
 * @param {{ count: number, locale: 'en' | 'tr', size?: 'small' | 'big' }} props
 */
export function Stars({ count, locale, size = 'small' }) {
  return (
    <span className={`math-stars math-stars-${size}`} role="img" aria-label={t('math.map.stars', locale, { count })}>
      {[0, 1, 2].map((at) => (
        <Star key={at} aria-hidden="true" className={at < count ? 'math-star math-star-on' : 'math-star'} />
      ))}
    </span>
  );
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
