/**
 * The game's words: every key the game asks for has words in both languages,
 * no sentence puts a Turkish suffix on a number, and no word comes from the
 * list of words a person should never meet.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MESSAGES } from '../lib/i18n/index.js';
import { ANIMAL_KEYS } from '../lib/math/animals.js';
import { LEVELS, makeQuestion, starsFor, TOPIC_IDS } from '../lib/math/topics.js';

/** Every word key the game builds from a name rather than writing out. */
function builtKeys() {
  const keys = new Set();
  for (const id of TOPIC_IDS) {
    keys.add(`math.topic.${id}`);
    for (let seed = 0; seed < 300; seed += 1) {
      const question = makeQuestion(id, seed);
      if (question.ask !== null) keys.add(question.ask.key);
    }
  }
  for (const key of ANIMAL_KEYS) keys.add(`math.animal.${key}`);
  for (const level of LEVELS) keys.add(`math.level.hint${level.level}`);
  for (let correct = 0; correct <= 10; correct += 1) keys.add(`math.end.title${starsFor(correct)}`);
  for (let at = 1; at <= 4; at += 1) keys.add(`math.round.right${at}`);
  return keys;
}

test('every word the game builds a key for is there in both languages', () => {
  for (const key of builtKeys()) {
    assert.equal(typeof MESSAGES.en[key], 'string', `${key} in English`);
    assert.equal(typeof MESSAGES.tr[key], 'string', `${key} in Turkish`);
  }
});

test('a question sentence names the same values in both languages, and every value it is given', () => {
  for (const id of TOPIC_IDS) {
    for (let seed = 0; seed < 300; seed += 1) {
      const { ask } = makeQuestion(id, seed);
      if (ask === null) continue;
      for (const locale of ['en', 'tr']) {
        const named = new Set([...MESSAGES[locale][ask.key].matchAll(/\{(\w+)\}/gu)].map((match) => match[1]));
        assert.deepEqual(named, new Set(Object.keys(ask.values ?? {})), `${ask.key} in ${locale}`);
      }
    }
  }
});

test('no Turkish sentence puts a suffix straight onto a value', () => {
  for (const [key, words] of Object.entries(MESSAGES.tr)) {
    assert.doesNotMatch(words, /\{\w+\}['’]/u, key);
  }
});

test('no word from the banned list, in either language', () => {
  const banned = /\b(table|column|migration|sql|schema|constraint|index|transaction|rollback|branch|commit|merge)s?\b/iu;
  for (const locale of ['en', 'tr']) {
    for (const [key, words] of Object.entries(MESSAGES[locale])) {
      if (!key.startsWith('math.') && key !== 'app.title') continue;
      assert.doesNotMatch(words, banned, `${key} in ${locale}`);
    }
  }
});

test('no game word is written in capitals only', () => {
  for (const locale of ['en', 'tr']) {
    for (const [key, words] of Object.entries(MESSAGES[locale])) {
      if (!key.startsWith('math.')) continue;
      assert.doesNotMatch(words, /\b\p{Lu}{4,}\b/u, `${key} in ${locale}`);
    }
  }
});
