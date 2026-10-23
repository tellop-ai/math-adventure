/**
 * The bounds on what the game saves, checked before anything is saved.
 *
 * Each check refuses with a `DataError` whose `messageKey` names words in
 * `lib/i18n/locales/`, so an address answers a key and the page shows the words in
 * the reader's language. Anything that is not exactly the expected shape refuses:
 * a string where a number belongs, a fraction, a value outside its range, a
 * missing field, an extra field or a nested value.
 *
 * Pure: nothing here touches stored information.
 */

import { DataError } from '../data/refusal.js';

import { ANIMAL_KEYS } from './animals.js';
import { FIRST_LEVEL, LAST_LEVEL, ROUND_LENGTH, TOPIC_IDS } from './topics.js';

/** The most players one family keeps (one seat each). */
export const MAX_PLAYERS = 6;
/** The longest name, in characters. */
export const MAX_NAME = 20;
/** The largest whole number the store keeps; no total grows past it. */
export const COUNT_CAP = 2147483647;

/** The words for a request the game does not accept. */
export const REFUSED = 'math.problem.refused';

/**
 * @param {unknown} value
 * @param {readonly string[]} keys
 * @returns {value is Record<string, unknown>}
 */
function exactObject(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {value is number}
 */
function wholeNumberIn(value, min, max) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * A player's name: trimmed, 1 to 20 characters, no control characters.
 *
 * @param {unknown} value
 * @returns {string}
 */
function checkName(value) {
  if (typeof value !== 'string') throw new DataError(REFUSED);
  const name = value.trim();
  const length = [...name].length;
  if (length < 1 || length > MAX_NAME || /\p{Cc}/u.test(name)) throw new DataError(REFUSED);
  return name;
}

/** @param {unknown} value @returns {string} */
function checkAnimal(value) {
  if (typeof value !== 'string' || !ANIMAL_KEYS.includes(value)) throw new DataError(REFUSED);
  return value;
}

/** @param {unknown} value @returns {number} */
function checkLevel(value) {
  if (!wholeNumberIn(value, FIRST_LEVEL, LAST_LEVEL)) throw new DataError(REFUSED);
  return value;
}

/** @param {unknown} value @returns {number} */
function checkId(value) {
  if (!wholeNumberIn(value, 1, COUNT_CAP)) throw new DataError(REFUSED);
  return value;
}

/**
 * A new player: a name, an animal and a starting level.
 *
 * @param {unknown} input
 * @returns {{ name: string, animal: string, level: number }}
 */
export function checkNewPlayer(input) {
  if (!exactObject(input, ['name', 'animal', 'level'])) throw new DataError(REFUSED);
  return { name: checkName(input.name), animal: checkAnimal(input.animal), level: checkLevel(input.level) };
}

/**
 * A change to a player: every field the player has, sent whole.
 *
 * @param {unknown} input
 * @returns {{ playerId: number, name: string, animal: string, level: number, soundOn: boolean }}
 */
export function checkPlayerChange(input) {
  if (!exactObject(input, ['playerId', 'name', 'animal', 'level', 'soundOn'])) throw new DataError(REFUSED);
  if (typeof input.soundOn !== 'boolean') throw new DataError(REFUSED);
  return {
    playerId: checkId(input.playerId),
    name: checkName(input.name),
    animal: checkAnimal(input.animal),
    level: checkLevel(input.level),
    soundOn: input.soundOn,
  };
}

/**
 * Which player, and nothing else.
 *
 * @param {unknown} input
 * @returns {{ playerId: number }}
 */
export function checkPlayerChoice(input) {
  if (!exactObject(input, ['playerId'])) throw new DataError(REFUSED);
  return { playerId: checkId(input.playerId) };
}

/**
 * One finished round: the player, the topic and how many of the 10 were right.
 *
 * @param {unknown} input
 * @returns {{ playerId: number, topic: string, correct: number }}
 */
export function checkRound(input) {
  if (!exactObject(input, ['playerId', 'topic', 'correct'])) throw new DataError(REFUSED);
  if (typeof input.topic !== 'string' || !TOPIC_IDS.includes(input.topic)) throw new DataError(REFUSED);
  if (!wholeNumberIn(input.correct, 0, ROUND_LENGTH)) throw new DataError(REFUSED);
  return { playerId: checkId(input.playerId), topic: input.topic, correct: input.correct };
}
