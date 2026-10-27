/**
 * The adventure's path: which levels, stops and big challenges are open, what
 * comes after a round, the badges, and the one moment a round's end shows.
 *
 * Each level is a land on one path: its topics are its stops, in the
 * order `LEVELS` gives them, and its big challenge comes after the last stop.
 * A big challenge is kept like a topic, as a result whose topic is
 * `gate-<level>`, so nothing new is stored: what is open is worked out from the
 * player's starting level and their best stars, here and nowhere else (the
 * page shows it, the server checks it before a round is saved).
 *
 * - Level L is open when L is at most the starting level, or level L-1 is open
 *   and passed. It is passed when L is below the starting level, or its big
 *   challenge has 2 stars or more.
 * - In a passed level every stop and the big challenge are open.
 * - In the current level (the first open level not passed) the first stop is
 *   open; each next stop opens once the one before has a star; the big
 *   challenge opens once every stop has one. A stop that already has a
 *   star stays open, whatever came before it.
 * - When all eight levels are passed, the adventure is finished.
 * - A badge, once won, stays won, even when a lower starting level closes its
 *   level again; what is open never comes from a badge alone.
 *
 * Pure: nothing here touches stored information or the page.
 */

import { seededRandom } from './numbers.js';
import { FIRST_LEVEL, LAST_LEVEL, LEVELS, makeQuestion, makeRound, ROUND_LENGTH, sameness, starsFor, TOPICS, TOPIC_IDS } from './topics.js';

/** Each level's land: a picture the game shows and a word key, `math.land.<key>`. */
export const LANDS = Object.freeze([
  Object.freeze({ level: 1, key: 'meadow', picture: '🌼' }),
  Object.freeze({ level: 2, key: 'forest', picture: '🌲' }),
  Object.freeze({ level: 3, key: 'river', picture: '🛶' }),
  Object.freeze({ level: 4, key: 'desert', picture: '🌵' }),
  Object.freeze({ level: 5, key: 'island', picture: '🏝️' }),
  Object.freeze({ level: 6, key: 'mountains', picture: '🏔️' }),
  Object.freeze({ level: 7, key: 'volcano', picture: '🌋' }),
  Object.freeze({ level: 8, key: 'space', picture: '🚀' }),
]);

/** The stars a stop needs to open the next point, and a big challenge needs to pass its level. */
export const STOP_PASS = 1;
export const GATE_PASS = 2;

/** Every big challenge's stored name, in level order. */
export const GATE_IDS = Object.freeze(LEVELS.map((entry) => `gate-${entry.level}`));

/** Every round a result can be kept for: the 40 stops and the 8 big challenges. */
export const ROUND_IDS = Object.freeze([...TOPIC_IDS, ...GATE_IDS]);

/** Badges a player can win: a level badge and a gold badge for each level. */
export const BADGE_TOTAL = LEVELS.length * 2;

/** @param {number} level */
export function gateId(level) {
  return `gate-${level}`;
}

/** @param {string} id */
export function isGate(id) {
  return GATE_IDS.includes(id);
}

/**
 * The level a round belongs to, or `null` for a name the game does not know.
 *
 * @param {string} id
 */
export function levelOfRound(id) {
  if (isGate(id)) return Number(id.slice('gate-'.length));
  return Object.hasOwn(TOPICS, id) ? TOPICS[id].level : null;
}

/**
 * The fewest right answers that win `stars` stars (6 for one, 8 for two).
 *
 * @param {number} stars
 */
export function rightFor(stars) {
  let correct = 0;
  while (correct < ROUND_LENGTH && starsFor(correct) < stars) correct += 1;
  return correct;
}

/**
 * A round's name as a word key and its values.
 *
 * @param {string} id
 * @returns {{ key: string, values?: Record<string, number> }}
 */
export function roundWords(id) {
  if (isGate(id)) return { key: 'math.gate.name', values: { level: levelOfRound(id) ?? FIRST_LEVEL } };
  return { key: `math.topic.${id}` };
}

/**
 * @typedef {'locked' | 'open' | 'next' | 'done'} PointState
 *   `done`: it has the stars it needs; `next`: the first open point still to
 *   do on the current level (where the player's animal stands); `open`: open,
 *   not done; `locked`: not open yet.
 * @typedef {{ id: string, gate: boolean, stars: number, state: PointState }} Point
 * @typedef {{ level: number, open: boolean, passed: boolean, badge: boolean, gold: boolean, points: Point[] }} LevelProgress
 * @typedef {{ placement: number, current: number, finished: boolean, levels: LevelProgress[], badges: number }} Progress
 */

/**
 * @param {Record<string, { bestStars: number } | undefined>} scores
 * @param {string} id
 */
function starsOf(scores, id) {
  const stars = scores[id]?.bestStars;
  return Number.isSafeInteger(stars) && stars > 0 ? Math.min(3, stars) : 0;
}

/**
 * Where a player is on the path.
 *
 * @param {number} placement the starting level
 * @param {Record<string, { bestStars: number } | undefined>} scores best stars by round name
 * @returns {Progress}
 */
export function progressOf(placement, scores) {
  const start = Number.isSafeInteger(placement) ? Math.min(LAST_LEVEL, Math.max(FIRST_LEVEL, placement)) : FIRST_LEVEL;
  /** @type {LevelProgress[]} */
  const levels = [];
  let current = 0;
  let badges = 0;
  for (const entry of LEVELS) {
    const before = levels.at(-1);
    const open = entry.level <= start || (before !== undefined && before.open && before.passed);
    const gateStars = starsOf(scores, gateId(entry.level));
    const badge = gateStars >= GATE_PASS;
    const passed = open && (entry.level < start || badge);
    const isCurrent = open && !passed && current === 0;
    if (isCurrent) current = entry.level;

    const stopStars = entry.topics.map((id) => starsOf(scores, id));
    /** @type {Point[]} */
    const points = entry.topics.map((id, at) => {
      const stars = stopStars[at];
      let state = /** @type {PointState} */ ('locked');
      if (open && stars >= STOP_PASS) state = 'done';
      else if (passed || (open && (at === 0 || stopStars[at - 1] >= STOP_PASS))) state = 'open';
      return { id, gate: false, stars, state };
    });
    let gateState = /** @type {PointState} */ ('locked');
    if (open && badge) gateState = 'done';
    else if (passed || (open && stopStars.every((stars) => stars >= STOP_PASS))) gateState = 'open';
    points.push({ id: gateId(entry.level), gate: true, stars: gateStars, state: gateState });

    if (isCurrent) {
      const first = points.find((point) => point.state === 'open');
      if (first !== undefined) first.state = 'next';
    }
    const gold = badge && points.every((point) => point.stars === 3);
    if (badge) badges += 1;
    if (gold) badges += 1;
    levels.push({ level: entry.level, open, passed, badge, gold, points });
  }
  const finished = current === 0;
  return Object.freeze({ placement: start, current: finished ? LAST_LEVEL : current, finished, levels, badges });
}

/**
 * A round's point on the path, or `null` for a name the game does not know.
 *
 * @param {Progress} progress
 * @param {string} id
 */
export function pointOf(progress, id) {
  const level = levelOfRound(id);
  if (level === null) return null;
  return progress.levels[level - 1].points.find((point) => point.id === id) ?? null;
}

/**
 * Whether a round may be played (and saved) now.
 *
 * @param {Progress} progress
 * @param {string} id
 */
export function isOpen(progress, id) {
  const point = pointOf(progress, id);
  return point !== null && point.state !== 'locked';
}

/**
 * The point after a round on the path, when it is open: the next stop, the
 * big challenge after the last stop, or the next level's first stop after a
 * big challenge. `null` after the last one, or when the next point is locked.
 *
 * @param {Progress} progress
 * @param {string} id
 * @returns {null | { id: string, kind: 'stop' | 'gate' | 'level', level: number }}
 */
export function nextAfter(progress, id) {
  const level = levelOfRound(id);
  if (level === null) return null;
  const points = progress.levels[level - 1].points;
  const at = points.findIndex((point) => point.id === id);
  const following = points[at + 1];
  if (following !== undefined) {
    return following.state === 'locked' ? null : { id: following.id, kind: following.gate ? 'gate' : 'stop', level };
  }
  const nextLevel = progress.levels[level];
  if (nextLevel === undefined || !nextLevel.open) return null;
  return { id: nextLevel.points[0].id, kind: 'level', level: nextLevel.level };
}

/**
 * How many of a big challenge's ten questions each stop gives, in path order:
 * the same share each, and the last stops one more when ten does not divide
 * evenly, so the challenge still climbs to the hardest stops. Five stops give
 * two each; seven give 1, 1, 1, 1, 2, 2, 2.
 *
 * @param {number} stops
 * @returns {number[]}
 */
export function challengeShares(stops) {
  const each = Math.floor(ROUND_LENGTH / stops);
  const more = ROUND_LENGTH - each * stops;
  return Array.from({ length: stops }, (_, at) => each + (at >= stops - more ? 1 : 0));
}

/**
 * A big challenge's ten questions, spread over the stops of its level in the
 * order of the path (`challengeShares`), so it climbs from the first stop to
 * the last. A stop's round is `makeRound`. Every question keeps its own topic
 * and seed.
 *
 * @param {string} id
 * @param {number} seed
 */
export function makeRoundFor(id, seed) {
  if (!isGate(id)) return makeRound(id, seed);
  const stops = LEVELS[(levelOfRound(id) ?? FIRST_LEVEL) - 1].topics;
  const shares = challengeShares(stops.length);
  const random = seededRandom(seed);
  const questions = [];
  for (const [at, topic] of stops.entries()) {
    const each = shares[at];
    const seen = new Set();
    for (let tries = 0, made = 0; made < each; tries += 1) {
      const question = makeQuestion(topic, Math.floor(random() * 4294967296));
      const key = sameness(question);
      if (seen.has(key) && tries < each * 20) continue;
      seen.add(key);
      questions.push(question);
      made += 1;
    }
  }
  return Object.freeze(questions);
}

/**
 * @typedef {'finished' | 'levelOpened' | 'badge' | 'gateOpened' | 'stopOpened' | 'gold' | 'newBest' | 'stars' | 'tryAgain'} Moment
 */

/** The moments a round's end can show, the biggest first. */
export const MOMENTS = Object.freeze(['finished', 'levelOpened', 'badge', 'gateOpened', 'stopOpened', 'gold', 'newBest', 'stars', 'tryAgain']);

/** The big moments, at most nine in the whole game: the end card's highlighted panel and the one short tune. */
export const PANEL_MOMENTS = Object.freeze(['finished', 'levelOpened']);

/** The moments that are one headline line and one chime. */
export const CHIME_MOMENTS = Object.freeze(['badge', 'gateOpened', 'stopOpened', 'gold']);

/** The moments that may show as a small line under the headline, in this order. */
const LINE_MOMENTS = Object.freeze(['badge', 'gold', 'newBest']);

/** At most this many small lines under the headline. */
export const MOST_LINES = 2;

/**
 * What a round's end shows, from where the player was before the round's save
 * and after it: one headline (the biggest moment that happened), at most two
 * small lines for others, whether this round itself reached its point's mark
 * and the point is done (`cleared`: the end card then leads with the next
 * step), the next point on the path, and the mark still to reach: where the
 * path waits on this point, or the badge a passed level's challenge still
 * holds.
 *
 * Called only once the save is confirmed; until then the end card shows the
 * round's stars and nothing that the save would open.
 *
 * @param {Progress} before
 * @param {Progress} after
 * @param {string} id
 * @param {{ stars: number, newBest: boolean }} round
 * @returns {{
 *   headline: Moment,
 *   level: number,
 *   lines: Moment[],
 *   cleared: boolean,
 *   next: ReturnType<typeof nextAfter>,
 *   mark: null | { right: number, opens: 'stop' | 'gate' | 'level' | 'finish' | 'badge' },
 * }}
 */
export function rewardsFor(before, after, id, round) {
  const level = levelOfRound(id) ?? FIRST_LEVEL;
  const was = before.levels[level - 1];
  const now = after.levels[level - 1];
  const happened = new Set();
  if (after.finished && !before.finished) happened.add('finished');
  if (after.levels.some((entry, at) => entry.open && !before.levels[at].open)) happened.add('levelOpened');
  if (now.badge && !was.badge) happened.add('badge');
  const gateBefore = was.points[was.points.length - 1];
  const gateAfter = now.points[now.points.length - 1];
  if (gateBefore.state === 'locked' && gateAfter.state !== 'locked') happened.add('gateOpened');
  if (now.points.some((point, at) => !point.gate && point.state !== 'locked' && was.points[at].state === 'locked')) happened.add('stopOpened');
  if (now.gold && !was.gold) happened.add('gold');
  if (round.newBest) happened.add('newBest');

  const headline = MOMENTS.find((moment) => happened.has(moment)) ?? (round.stars > 0 ? 'stars' : 'tryAgain');
  // A level opened by a big challenge brings its badge: the headline says so,
  // and the line does not say it twice.
  const covered = new Set([headline, ...(headline === 'levelOpened' || headline === 'finished' ? ['badge'] : [])]);
  const lines = LINE_MOMENTS.filter((moment) => happened.has(moment) && !covered.has(moment)).slice(0, MOST_LINES);

  // The mark only where the path waits on this round: its point is still the
  // next one to do, so every point before it is done.
  const point = pointOf(after, id);
  let mark = null;
  if (point !== null && point.state === 'next') {
    mark = point.gate
      ? { right: rightFor(GATE_PASS), opens: level < LAST_LEVEL ? 'level' : 'finish' }
      : { right: rightFor(STOP_PASS), opens: point.id === now.points[now.points.length - 2].id ? 'gate' : 'stop' };
  } else if (point !== null && point.gate && now.passed && !now.badge) {
    mark = { right: rightFor(GATE_PASS), opens: 'badge' };
  }
  const openedLevel = after.levels.find((entry, at) => entry.open && !before.levels[at].open)?.level;
  return {
    headline,
    level: headline === 'levelOpened' && openedLevel !== undefined ? openedLevel : level,
    lines,
    cleared: point !== null && point.state === 'done' && round.stars >= (point.gate ? GATE_PASS : STOP_PASS),
    next: nextAfter(after, id),
    mark,
  };
}
