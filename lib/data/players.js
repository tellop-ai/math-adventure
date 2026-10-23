/**
 * The game's saved records: the family's players and each player's results
 * for each topic.
 *
 * Every read and write names its owner, and every write goes through
 * `modelAction` or `modelBatch` from `./index.js`, never the generated client.
 * A read never creates a row: no player row means no player, and no score row
 * means a topic not played yet.
 *
 * Each read is sized for Tellop's records bounds (at most 256 rows a
 * statement and 2,048 values an answer): at most 6 players, read with a
 * `take`; their stars, two fields each, at most 240 rows; one player's 40
 * topics at a time.
 *
 * Values are copied into plain objects before they leave this file, because the
 * records route used inside Tellop answers objects with no prototype.
 */

import {
  checkNewPlayer,
  checkPlayerChange,
  checkPlayerChoice,
  checkRound,
  COUNT_CAP,
  MAX_PLAYERS,
} from '../math/limits.js';
import { ANIMAL_KEYS } from '../math/animals.js';
import { FIRST_LEVEL, LAST_LEVEL, ROUND_LENGTH, starsFor, TOPIC_IDS } from '../math/topics.js';

import { DataError, modelAction, modelBatch } from './index.js';

/** The words when every seat is taken. */
export const FULL = 'math.problem.full';
/** The words when the player is not (or no longer) there. */
export const NO_PLAYER = 'math.problem.noPlayer';
/** The words when a player's totals cannot grow any more. */
export const COUNT_FULL = 'math.problem.countFull';

/**
 * @typedef {{ id: number, seat: number, name: string, animal: string, level: number, soundOn: boolean }} PlayerView
 * @typedef {{ rounds: number, bestStars: number, bestCorrect: number, answered: number, correct: number }} ScoreView
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireOwner(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new DataError('error.ownerMissing');
  return value.trim();
}

/**
 * A saved whole number inside its range, or the storage is unreadable.
 *
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function whole(value, min = 0, max = COUNT_CAP) {
  const number = typeof value === 'bigint' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new DataError('error.storageUnreadable');
  }
  return number;
}

/**
 * A saved player as a plain view. An animal the game does not know reads as
 * the first one; a level outside the game reads as the nearest end.
 *
 * @param {any} row
 * @returns {PlayerView}
 */
function playerView(row) {
  if (row === null || row === undefined || typeof row !== 'object' || typeof row.name !== 'string') {
    throw new DataError('error.storageUnreadable');
  }
  const level = whole(row.level, -COUNT_CAP, COUNT_CAP);
  return {
    id: whole(row.id, 1),
    seat: whole(row.seat, 1, MAX_PLAYERS),
    name: row.name,
    animal: typeof row.animal === 'string' && ANIMAL_KEYS.includes(row.animal) ? row.animal : ANIMAL_KEYS[0],
    level: Math.min(LAST_LEVEL, Math.max(FIRST_LEVEL, level)),
    soundOn: row.soundOn === true || row.soundOn === 1,
  };
}

/**
 * A saved topic result as a plain view.
 *
 * @param {any} row
 * @returns {ScoreView}
 */
function scoreView(row) {
  if (row === null || row === undefined || typeof row !== 'object') throw new DataError('error.storageUnreadable');
  return {
    rounds: whole(row.rounds),
    bestStars: whole(row.bestStars, 0, 3),
    bestCorrect: whole(row.bestCorrect, 0, ROUND_LENGTH),
    answered: whole(row.answered),
    correct: whole(row.correct),
  };
}

const PLAYER_FIELDS = Object.freeze({ id: true, seat: true, name: true, animal: true, level: true, soundOn: true });
const SCORE_FIELDS = Object.freeze({ topic: true, rounds: true, bestStars: true, bestCorrect: true, answered: true, correct: true });

/**
 * Runs one records call and turns an unexpected failure into words a person can
 * read. A `DataError` passes through as it is.
 *
 * @template T
 * @param {() => Promise<T>} work
 * @param {string} failureKey
 * @returns {Promise<T>}
 */
async function guarded(work, failureKey) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError(failureKey);
  }
}

/**
 * The owner's players in seat order, each with the stars won in every topic
 * together.
 *
 * @param {unknown} ownerId
 * @returns {Promise<Array<PlayerView & { stars: number }>>}
 */
export async function listPlayersFor(ownerId) {
  const owner = requireOwner(ownerId);
  const rows = await guarded(
    () => modelAction('Player', 'findMany', {
      where: { ownerId: owner },
      orderBy: { seat: 'asc' },
      take: MAX_PLAYERS,
      select: PLAYER_FIELDS,
    }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(rows)) throw new DataError('error.storageUnreadable');
  const players = rows.map(playerView);
  if (players.length === 0) return [];
  const stars = await guarded(
    () => modelAction('TopicScore', 'findMany', {
      where: { ownerId: owner, playerId: { in: players.map((player) => player.id) }, bestStars: { gt: 0 } },
      select: { playerId: true, bestStars: true },
      take: MAX_PLAYERS * TOPIC_IDS.length,
    }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(stars)) throw new DataError('error.storageUnreadable');
  const totals = new Map();
  for (const row of stars) {
    const playerId = whole(row?.playerId, 1);
    totals.set(playerId, (totals.get(playerId) ?? 0) + whole(row?.bestStars, 0, 3));
  }
  return players.map((player) => ({ ...player, stars: totals.get(player.id) ?? 0 }));
}

/**
 * One of the owner's players with their result in every topic they played, or
 * `null` when the owner has no such player.
 *
 * @param {unknown} ownerId
 * @param {unknown} playerId
 * @returns {Promise<{ player: PlayerView, scores: Record<string, ScoreView> } | null>}
 */
export async function readPlayerFor(ownerId, playerId) {
  const owner = requireOwner(ownerId);
  const { playerId: id } = checkPlayerChoice({ playerId });
  const row = await guarded(
    () => modelAction('Player', 'findFirst', { where: { id, ownerId: owner }, select: PLAYER_FIELDS }),
    'error.storageUnreadable',
  );
  if (row === null || row === undefined) return null;
  const player = playerView(row);
  const rows = await guarded(
    () => modelAction('TopicScore', 'findMany', {
      where: { ownerId: owner, playerId: id },
      select: SCORE_FIELDS,
      take: TOPIC_IDS.length,
    }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(rows)) throw new DataError('error.storageUnreadable');
  /** @type {Record<string, ScoreView>} */
  const scores = {};
  for (const score of rows) {
    if (typeof score?.topic === 'string' && TOPIC_IDS.includes(score.topic)) scores[score.topic] = scoreView(score);
  }
  return { player, scores };
}

/**
 * Adds a player in the lowest free seat. The seat is unique for the owner, so
 * two adds at once cannot make a seventh player: the second one fails.
 *
 * @param {unknown} ownerId
 * @param {unknown} input
 * @returns {Promise<PlayerView>}
 */
export async function addPlayerFor(ownerId, input) {
  const owner = requireOwner(ownerId);
  const wanted = checkNewPlayer(input);
  const taken = await guarded(
    () => modelAction('Player', 'findMany', { where: { ownerId: owner }, select: { seat: true }, take: MAX_PLAYERS }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(taken)) throw new DataError('error.storageUnreadable');
  const used = new Set(taken.map((row) => whole(row?.seat, 1, MAX_PLAYERS)));
  let seat = 1;
  while (used.has(seat)) seat += 1;
  if (seat > MAX_PLAYERS) throw new DataError(FULL);
  const row = await guarded(
    () => modelAction('Player', 'create', {
      data: { ownerId: owner, seat, ...wanted, soundOn: true, createdAt: new Date().toISOString() },
      select: PLAYER_FIELDS,
    }),
    'error.saveFailed',
  );
  const saved = playerView(row);
  if (saved.seat !== seat || saved.name !== wanted.name || saved.animal !== wanted.animal || saved.level !== wanted.level) {
    throw new DataError('error.saveUnconfirmed');
  }
  return saved;
}

/**
 * Saves a player's name, animal, level and Sound, in one group of steps, and
 * answers what was saved.
 *
 * @param {unknown} ownerId
 * @param {unknown} input
 * @returns {Promise<PlayerView>}
 */
export async function changePlayerFor(ownerId, input) {
  const owner = requireOwner(ownerId);
  const { playerId, ...wanted } = checkPlayerChange(input);
  const results = await guarded(
    () => modelBatch([
      { model: 'Player', action: 'updateMany', args: { where: { id: playerId, ownerId: owner }, data: wanted } },
      { model: 'Player', action: 'findFirst', args: { where: { id: playerId, ownerId: owner }, select: PLAYER_FIELDS } },
    ]),
    'error.saveFailed',
  );
  if (!Array.isArray(results) || results.length !== 2) throw new DataError('error.saveUnconfirmed');
  if (Number(results[0]?.count) === 0 || results[1] === null || results[1] === undefined) throw new DataError(NO_PLAYER);
  const saved = playerView(results[1]);
  if (saved.name !== wanted.name || saved.animal !== wanted.animal || saved.level !== wanted.level || saved.soundOn !== wanted.soundOn) {
    throw new DataError('error.saveUnconfirmed');
  }
  return saved;
}

/**
 * Removes a player and every result they have, in one group of steps.
 *
 * @param {unknown} ownerId
 * @param {unknown} input
 * @returns {Promise<{ removed: number }>}
 */
export async function removePlayerFor(ownerId, input) {
  const owner = requireOwner(ownerId);
  const { playerId } = checkPlayerChoice(input);
  const results = await guarded(
    () => modelBatch([
      { model: 'TopicScore', action: 'deleteMany', args: { where: { ownerId: owner, playerId } } },
      { model: 'Player', action: 'deleteMany', args: { where: { id: playerId, ownerId: owner } } },
    ]),
    'error.saveFailed',
  );
  if (!Array.isArray(results) || results.length !== 2) throw new DataError('error.saveUnconfirmed');
  const removed = Number(results[1]?.count);
  if (removed === 0) throw new DataError(NO_PLAYER);
  if (removed !== 1) throw new DataError('error.saveUnconfirmed');
  return { removed };
}

/**
 * Saves one finished round: one more round, 10 more answers and the right
 * ones, and a higher best where this round beat it, in one group of steps that
 * is saved whole or not at all. The stars are worked out here, never taken from
 * the request.
 *
 * No total grows past the largest whole number the store keeps: when one
 * would, nothing changes, the bests included, and the save is refused.
 *
 * @param {unknown} ownerId
 * @param {unknown} input
 * @returns {Promise<{ topic: string, stars: number, correct: number, score: ScoreView }>}
 */
export async function saveRoundFor(ownerId, input) {
  const owner = requireOwner(ownerId);
  const { playerId, topic, correct } = checkRound(input);
  const stars = starsFor(correct);
  const found = await guarded(
    () => modelAction('Player', 'findFirst', { where: { id: playerId, ownerId: owner }, select: { id: true } }),
    'error.storageUnreadable',
  );
  if (found === null || found === undefined) throw new DataError(NO_PLAYER);
  const mine = { playerId, topic, ownerId: owner };
  const room = { lte: COUNT_CAP - ROUND_LENGTH };
  const results = await guarded(
    () => modelBatch([
      {
        model: 'TopicScore',
        action: 'upsert',
        args: { where: { playerId_topic: { playerId, topic }, ownerId: owner }, create: { playerId, topic, ownerId: owner }, update: {} },
      },
      // The bests first, under the same limit as the totals: a round the limit
      // refuses changes nothing.
      { model: 'TopicScore', action: 'updateMany', args: { where: { ...mine, answered: room, bestStars: { lt: stars } }, data: { bestStars: stars } } },
      { model: 'TopicScore', action: 'updateMany', args: { where: { ...mine, answered: room, bestCorrect: { lt: correct } }, data: { bestCorrect: correct } } },
      {
        model: 'TopicScore',
        action: 'updateMany',
        args: {
          where: { ...mine, answered: room },
          data: { rounds: { increment: 1 }, answered: { increment: ROUND_LENGTH }, correct: { increment: correct } },
        },
      },
      { model: 'TopicScore', action: 'findFirst', args: { where: mine, select: SCORE_FIELDS } },
    ]),
    'error.saveFailed',
  );
  if (!Array.isArray(results) || results.length !== 5) throw new DataError('error.saveUnconfirmed');
  const grew = Number(results[3]?.count);
  if (grew === 0) throw new DataError(COUNT_FULL);
  if (grew !== 1 || results[4] === null || results[4] === undefined) throw new DataError('error.saveUnconfirmed');
  const score = scoreView(results[4]);
  if (score.bestStars < stars || score.bestCorrect < correct || score.rounds < 1) throw new DataError('error.saveUnconfirmed');
  return { topic, stars, correct, score };
}
