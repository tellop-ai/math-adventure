import { Star } from 'lucide-react';

import { t } from '../lib/i18n/index.js';
import { formatNumber } from '../lib/math/numbers.js';
import { LANDS, roundWords } from '../lib/math/path.js';
import { answerText, bracketsAfter, numberText, sumText, timesText } from '../lib/math/words.js';

export { answerText, askText, sumText } from '../lib/math/words.js';

/** A round's name in the reader's language: a topic, or a level's big challenge. @param {string} id @param {'en' | 'tr'} locale */
export function roundName(id, locale) {
  const words = roundWords(id);
  return t(words.key, locale, words.values);
}

/** A level's name with its land, "Level 3 · River". @param {number} level @param {'en' | 'tr'} locale */
export function levelName(level, locale) {
  const land = LANDS[level - 1] ?? LANDS[0];
  return t('math.level.land', locale, { level, land: t(`math.land.${land.key}`, locale) });
}

/**
 * The pieces every screen draws: a sum, the picture beside a question, a row of
 * stars, the words of a question, and the names of rounds and levels. Plain components with no state, used by
 * the game's screens.
 *
 * A sum is a list of pieces (see `lib/math/topics.js`). Each piece is drawn by
 * a class the stylesheet knows; nothing here writes a style.
 */

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
 * (a fraction stacked, like the fractions in the sum) with its unit, if any.
 *
 * @param {{ small?: boolean, answer: any, locale: 'en' | 'tr', unit?: string }} props
 */
function Box({ small = false, answer, locale, unit }) {
  const shape = small ? 'math-box math-box-small rounded-sm' : 'math-box rounded-sm';
  if (answer === null) return <span className={shape} />;
  return (
    <span className={`${shape} math-box-filled`}>
      {answer.kind === 'fraction' ? <Fraction top={answer.top} bottom={answer.bottom} locale={locale} /> : `${answerText(answer, locale)}${unit ?? ''}`}
    </span>
  );
}

/** The class of a sign: brackets and commas sit against the number beside them; the dots that end a pattern are ink. */
const SIGN_CLASS = Object.freeze({ '(': 'math-op math-open', ')': 'math-op math-close', ',': 'math-op math-comma', '…': 'math-op math-dots' });

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
  if ('n' in piece) return <span className="math-n">{numberText(piece.n, locale, bracketsAfter(before))}{piece.unit ?? null}</span>;
  if ('op' in piece) return <span className={SIGN_CLASS[piece.op] ?? 'math-op'}>{piece.op}</span>;
  if ('f' in piece) return <Fraction top={piece.f[0]} bottom={piece.f[1]} locale={locale} />;
  if ('blank' in piece) return <Box answer={answer} locale={locale} unit={piece.unit} />;
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
        <span className="math-x">{piece.letter ?? 'x'}</span>
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
  // Three angles with their degree marks make the widest sum of the game.
  const long = pieces.filter((piece) => 'n' in piece && piece.unit !== undefined).length >= 3;
  return (
    <span className={`math-sum math-sum-${size}`} data-long={long ? 'true' : undefined} role="img" aria-label={sumText(pieces, locale, answer)}>
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
 * Number blocks, drawn by the stylesheet: a block is a small square, a ten is
 * a rod of ten blocks, a hundred is a flat of ten rods. Nothing here draws a
 * number: the child counts or reads the blocks.
 */

/**
 * A tower of up to ten blocks, built from the bottom: the first five one
 * colour and the next five another, so five is seen at a glance.
 *
 * @param {{ count: number }} props
 */
function Tower({ count }) {
  return (
    <span className="math-tower">
      {Array.from({ length: count }, (_, at) => (
        <span key={at} className="math-block" data-fill={at >= 5 ? 'more' : 'first'} />
      ))}
    </span>
  );
}

/**
 * A ten frame: ten places in two rows of five, the first `filled` holding a
 * block, filled along the top row first, as in a school's ten frame.
 *
 * @param {{ filled: number }} props
 */
function TenFrame({ filled }) {
  return (
    <span className="math-frame rounded-sm">
      {Array.from({ length: 10 }, (_, at) => (
        <span key={at} className="math-block" data-fill={at >= filled ? 'empty' : at >= 5 ? 'more' : 'first'} />
      ))}
    </span>
  );
}

/**
 * A number as hundreds, tens and ones: flats, then rods, then single blocks
 * in a column (shorter than a rod, so nine never looks like ten). With
 * `locale`, each group says under it what one of its pieces is worth ("100
 * each"), as a child must know it to read the number.
 *
 * @param {{ hundreds?: number, tens: number, ones: number, locale?: 'en' | 'tr' }} props
 */
function PlaceBlocks({ hundreds = 0, tens, ones, locale }) {
  const group = (count, className, piece, worth) => {
    if (count === 0) return null;
    const pieces = <span className={className}>{Array.from({ length: count }, (_, at) => <span key={at} className={piece} />)}</span>;
    if (locale === undefined) return pieces;
    return (
      <span className="math-place-group">
        {pieces}
        <span className="math-place-each">{t('math.picture.each', locale, { n: worth })}</span>
      </span>
    );
  };
  return (
    <span className="math-place">
      {group(hundreds, 'math-flats', 'math-flat', 100)}
      {group(tens, 'math-rods', 'math-rod', 10)}
      {group(ones, 'math-ones', 'math-one', 1)}
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
  if (picture.kind === 'tower') {
    // Up to ten in one tower; for the teens a full tower of ten and a second one.
    return (
      <div className="math-picture" role="img" aria-label={t('math.picture.tower', locale)}>
        <span className="math-blocks" aria-hidden="true">
          {picture.count > 10 ? <Tower count={10} /> : null}
          <Tower count={picture.count > 10 ? picture.count - 10 : picture.count} />
        </span>
      </div>
    );
  }
  if (picture.kind === 'ten-places') {
    return (
      <div className="math-picture" role="img" aria-label={t('math.picture.tenPlaces', locale, { filled: picture.filled })}>
        <span className="math-blocks" data-size="frame" aria-hidden="true">
          <TenFrame filled={picture.filled} />
        </span>
      </div>
    );
  }
  if (picture.kind === 'blocks') {
    const label = picture.hundreds > 0
      ? t('math.picture.blocksHundreds', locale, { hundreds: picture.hundreds, tens: picture.tens, ones: picture.ones })
      : t('math.picture.blocksTens', locale, { tens: picture.tens, ones: picture.ones });
    return (
      <div className="math-picture" role="img" aria-label={label}>
        <span className="math-blocks" data-size={picture.hundreds > 0 ? 'small' : 'big'} aria-hidden="true">
          <PlaceBlocks hundreds={picture.hundreds} tens={picture.tens} ones={picture.ones} locale={locale} />
        </span>
      </div>
    );
  }
  if (picture.kind === 'blocks-sum') {
    const [first, second] = picture.groups;
    return (
      <div className="math-picture math-picture-groups" role="img" aria-label={t('math.picture.blocksSum', locale)}>
        <span className="math-group math-blocks" data-size="mid" aria-hidden="true"><PlaceBlocks tens={first.tens} ones={first.ones} /></span>
        <span className="math-op" aria-hidden="true">+</span>
        <span className="math-group math-blocks" data-size="mid" aria-hidden="true"><PlaceBlocks tens={second.tens} ones={second.ones} /></span>
      </div>
    );
  }
  if (picture.kind === 'marbles') {
    return (
      <div className="math-picture" role="img" aria-label={t('math.picture.marbles', locale, { red: picture.red, blue: picture.blue })}>
        <span className="math-bag" aria-hidden="true">
          {Array.from({ length: picture.red + picture.blue }, (_, at) => (
            <span key={at} className="math-marble rounded-full" data-colour={at < picture.red ? 'red' : 'blue'} />
          ))}
        </span>
      </div>
    );
  }
  if (picture.kind === 'equations') {
    const [first, second] = picture.lines;
    return (
      <div
        className="math-picture"
        role="img"
        aria-label={t('math.picture.equations', locale, { first: sumText(first, locale), second: sumText(second, locale) })}
      >
        <span className="math-equations" aria-hidden="true">
          {picture.lines.map((line, at) => <Sum key={at} pieces={line} locale={locale} />)}
        </span>
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
