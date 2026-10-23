/**
 * The game's saved records, checked by calling the real code.
 *
 * - The bounds on what a request may carry, at every edge and one step past it.
 * - Players and round results, against a throwaway store: `APP_DATA_FILE`
 *   points at a fresh temporary folder, removed afterwards, exactly as
 *   `tests/data.test.mjs` does, so no check ever touches the store a person is
 *   using.
 * - Tellop's records bounds, measured on every read and save
 *   (`tests/records-bounds.mjs`).
 * - The four addresses, called with real requests.
 *
 * Nothing here reaches the network.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'math-checks-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const { COUNT_CAP, MAX_NAME, MAX_PLAYERS, REFUSED, checkNewPlayer, checkPlayerChange, checkPlayerChoice, checkRound } =
  await import('../lib/math/limits.js');
const { ANIMAL_KEYS } = await import('../lib/math/animals.js');
const { ROUND_LENGTH, TOPIC_IDS } = await import('../lib/math/topics.js');
const { currentOwner } = await import('../lib/math/owner.js');
const { MAX_BODY_BYTES } = await import('../lib/math/request.js');
const { DataError, closeStorage, modelAction } = await import('../lib/data/index.js');
const { COUNT_FULL, FULL, NO_PLAYER, addPlayerFor, changePlayerFor, listPlayersFor, readPlayerFor, removePlayerFor, saveRoundFor } =
  await import('../lib/data/players.js');
const addRoute = await import('../app/api/players/add/route.js');
const changeRoute = await import('../app/api/players/change/route.js');
const removeRoute = await import('../app/api/players/remove/route.js');
const roundRoute = await import('../app/api/rounds/route.js');
const { bounded, measured, mostInFlight } = await import('./records-bounds.mjs');

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

/** @param {string} key */
function refusedWith(key) {
  return (error) => error instanceof DataError && error.messageKey === key;
}

/** A good new player. @param {Record<string, unknown>} [change] */
const newPlayer = (change = {}) => ({ name: 'Deniz', animal: 'fox', level: 3, ...change });

/* ---------- what a request may carry ---------- */

test('a name is 1 to 20 characters after trimming, with no control characters', () => {
  assert.equal(MAX_NAME, 20);
  assert.equal(checkNewPlayer(newPlayer({ name: 'A' })).name, 'A');
  assert.equal(checkNewPlayer(newPlayer({ name: '  Ece  ' })).name, 'Ece');
  assert.equal(checkNewPlayer(newPlayer({ name: 'x'.repeat(20) })).name, 'x'.repeat(20));
  assert.equal(checkNewPlayer(newPlayer({ name: 'İ'.repeat(20) })).name, 'İ'.repeat(20));
  assert.equal(checkNewPlayer(newPlayer({ name: '🦊'.repeat(20) })).name, '🦊'.repeat(20), 'a picture counts as one');
  for (const name of ['', '   ', 'x'.repeat(21), '🦊'.repeat(21), 'a\nb', 'a\tb', 'a\u0000b', 7, null]) {
    assert.throws(() => checkNewPlayer(newPlayer({ name })), refusedWith(REFUSED), JSON.stringify(name));
  }
});

test('a level is a whole number from 1 to 8, and an animal one of the twelve', () => {
  assert.equal(ANIMAL_KEYS.length, 12);
  for (const level of [1, 8]) assert.equal(checkNewPlayer(newPlayer({ level })).level, level);
  for (const level of [0, 9, 1.5, '3', null, Number.NaN]) {
    assert.throws(() => checkNewPlayer(newPlayer({ level })), refusedWith(REFUSED), String(level));
  }
  for (const animal of ANIMAL_KEYS) assert.equal(checkNewPlayer(newPlayer({ animal })).animal, animal);
  for (const animal of ['dragon', 'Fox', '', 1]) {
    assert.throws(() => checkNewPlayer(newPlayer({ animal })), refusedWith(REFUSED), String(animal));
  }
});

test('every request is exactly its own fields: no missing, extra or nested ones', () => {
  const refused = [
    { name: 'A', animal: 'fox' },
    { ...newPlayer(), extra: 1 },
    Object.assign(Object.create({ level: 1 }), { name: 'A', animal: 'fox' }),
    [1, 2, 3],
    null,
    'Deniz',
  ];
  for (const input of refused) assert.throws(() => checkNewPlayer(input), refusedWith(REFUSED), JSON.stringify(input));
  const change = { playerId: 1, name: 'A', animal: 'fox', level: 1, soundOn: true };
  assert.deepEqual(checkPlayerChange(change), change);
  assert.throws(() => checkPlayerChange({ ...change, soundOn: 'yes' }), refusedWith(REFUSED));
  assert.throws(() => checkPlayerChange({ ...change, soundOn: undefined }), refusedWith(REFUSED));
  assert.throws(() => checkPlayerChoice({ playerId: 1, more: 2 }), refusedWith(REFUSED));
});

test('a player number is a whole number from 1 to the largest the store keeps', () => {
  assert.equal(COUNT_CAP, 2147483647);
  for (const playerId of [1, COUNT_CAP]) assert.equal(checkPlayerChoice({ playerId }).playerId, playerId);
  for (const playerId of [0, -1, COUNT_CAP + 1, 1.5, '1', null]) {
    assert.throws(() => checkPlayerChoice({ playerId }), refusedWith(REFUSED), String(playerId));
  }
});

test('a round names a known topic and 0 to 10 right answers', () => {
  for (const correct of [0, 10]) assert.equal(checkRound({ playerId: 1, topic: 'count', correct }).correct, correct);
  for (const correct of [-1, 11, 2.5, '5']) {
    assert.throws(() => checkRound({ playerId: 1, topic: 'count', correct }), refusedWith(REFUSED), String(correct));
  }
  for (const topic of TOPIC_IDS) assert.equal(checkRound({ playerId: 1, topic, correct: 5 }).topic, topic);
  for (const topic of ['', 'Count', 'counting', 7]) {
    assert.throws(() => checkRound({ playerId: 1, topic, correct: 5 }), refusedWith(REFUSED), String(topic));
  }
  assert.throws(() => checkRound({ playerId: 1, topic: 'count', correct: 5, stars: 3 }), refusedWith(REFUSED), 'stars are never sent');
});

/* ---------- players ---------- */

test('with nothing saved, the reads answer nothing and create nothing', async () => {
  const owner = 'empty-owner';
  assert.deepEqual(await listPlayersFor(owner), []);
  assert.equal(await readPlayerFor(owner, 1), null);
  assert.equal(await modelAction('Player', 'count', { where: { ownerId: owner } }), 0);
  await assert.rejects(() => listPlayersFor('  '), refusedWith('error.ownerMissing'));
});

test('six players take seats 1 to 6, a seventh is refused, and a freed seat is taken again', async () => {
  const owner = 'seats-owner';
  assert.equal(MAX_PLAYERS, 6);
  const made = [];
  for (let at = 0; at < MAX_PLAYERS; at += 1) made.push(await addPlayerFor(owner, newPlayer({ name: `P${at}` })));
  assert.deepEqual(made.map((player) => player.seat), [1, 2, 3, 4, 5, 6]);
  assert.equal(made[0].soundOn, true, 'Sound starts on');
  await assert.rejects(() => addPlayerFor(owner, newPlayer()), refusedWith(FULL));
  assert.equal(await modelAction('Player', 'count', { where: { ownerId: owner } }), 6);
  await removePlayerFor(owner, { playerId: made[1].id });
  const again = await addPlayerFor(owner, newPlayer({ name: 'New' }));
  assert.equal(again.seat, 2);
  assert.notEqual(again.id, made[1].id, 'a new player is never the old one');
  assert.deepEqual((await listPlayersFor(owner)).map((player) => player.name), ['P0', 'New', 'P2', 'P3', 'P4', 'P5']);
});

test('two adds at once for the last seat make one player, never a seventh', async () => {
  const owner = 'race-owner';
  for (let at = 0; at < MAX_PLAYERS - 1; at += 1) await addPlayerFor(owner, newPlayer({ name: `P${at}` }));
  const results = await Promise.allSettled([addPlayerFor(owner, newPlayer({ name: 'A' })), addPlayerFor(owner, newPlayer({ name: 'B' }))]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failed = results.find((result) => result.status === 'rejected');
  assert.ok(failed.reason instanceof DataError, 'the second add is refused with words');
  assert.equal(await modelAction('Player', 'count', { where: { ownerId: owner } }), MAX_PLAYERS);
});

test('a change saves the name, animal, level and Sound, for the owner\'s player only', async () => {
  const owner = 'change-owner';
  const player = await addPlayerFor(owner, newPlayer());
  const changed = await changePlayerFor(owner, { playerId: player.id, name: 'Ada', animal: 'owl', level: 8, soundOn: false });
  assert.deepEqual(changed, { id: player.id, seat: 1, name: 'Ada', animal: 'owl', level: 8, soundOn: false });
  assert.equal(Object.getPrototypeOf(changed), Object.prototype, 'the answer is a plain object');
  await assert.rejects(
    () => changePlayerFor('other-owner', { playerId: player.id, name: 'X', animal: 'cat', level: 1, soundOn: true }),
    refusedWith(NO_PLAYER),
  );
  assert.deepEqual((await readPlayerFor(owner, player.id)).player, changed, 'another owner changed nothing');
  await assert.rejects(
    () => changePlayerFor(owner, { playerId: player.id, name: '', animal: 'cat', level: 1, soundOn: true }),
    refusedWith(REFUSED),
  );
  assert.deepEqual((await readPlayerFor(owner, player.id)).player, changed, 'a refused change changed nothing');
});

test('removing a player removes their results, and another owner cannot remove them', async () => {
  const owner = 'remove-owner';
  const player = await addPlayerFor(owner, newPlayer());
  await saveRoundFor(owner, { playerId: player.id, topic: 'count', correct: 9 });
  await assert.rejects(() => removePlayerFor('other-owner', { playerId: player.id }), refusedWith(NO_PLAYER));
  assert.notEqual(await readPlayerFor(owner, player.id), null);
  assert.deepEqual(await removePlayerFor(owner, { playerId: player.id }), { removed: 1 });
  assert.equal(await readPlayerFor(owner, player.id), null);
  assert.equal(await modelAction('TopicScore', 'count', { where: { playerId: player.id } }), 0);
  await assert.rejects(() => removePlayerFor(owner, { playerId: player.id }), refusedWith(NO_PLAYER));
});

/* ---------- rounds ---------- */

test('rounds add up, the higher best stays, and the stars are worked out here', async () => {
  const owner = 'rounds-owner';
  const player = await addPlayerFor(owner, newPlayer());
  const first = await saveRoundFor(owner, { playerId: player.id, topic: 'times-hard', correct: 8 });
  assert.deepEqual(first, { topic: 'times-hard', stars: 2, correct: 8, score: { rounds: 1, bestStars: 2, bestCorrect: 8, answered: 10, correct: 8 } });
  const lower = await saveRoundFor(owner, { playerId: player.id, topic: 'times-hard', correct: 5 });
  assert.deepEqual(lower.score, { rounds: 2, bestStars: 2, bestCorrect: 8, answered: 20, correct: 13 }, 'a lower round keeps the best');
  const higher = await saveRoundFor(owner, { playerId: player.id, topic: 'times-hard', correct: 10 });
  assert.equal(higher.stars, 3);
  assert.deepEqual(higher.score, { rounds: 3, bestStars: 3, bestCorrect: 10, answered: 30, correct: 23 });
  await saveRoundFor(owner, { playerId: player.id, topic: 'count', correct: 6 });
  const read = await readPlayerFor(owner, player.id);
  assert.deepEqual(Object.keys(read.scores).sort(), ['count', 'times-hard']);
  assert.equal(read.scores.count.bestStars, 1);
  assert.equal((await listPlayersFor(owner))[0].stars, 4, 'the home card adds the best stars of every topic');
});

test('a round for another owner\'s player, or a refused round, saves nothing', async () => {
  const owner = 'round-refused-owner';
  const player = await addPlayerFor(owner, newPlayer());
  await assert.rejects(() => saveRoundFor('other-owner', { playerId: player.id, topic: 'count', correct: 10 }), refusedWith(NO_PLAYER));
  await assert.rejects(() => saveRoundFor(owner, { playerId: player.id, topic: 'count', correct: 11 }), refusedWith(REFUSED));
  await assert.rejects(() => saveRoundFor(owner, { playerId: 999999, topic: 'count', correct: 10 }), refusedWith(NO_PLAYER));
  assert.equal(await modelAction('TopicScore', 'count', { where: { playerId: player.id } }), 0);
});

test('a player\'s totals never grow past the largest whole number the store keeps', async () => {
  const owner = 'cap-owner';
  const player = await addPlayerFor(owner, newPlayer());
  const set = (answered) => modelAction('TopicScore', 'upsert', {
    where: { playerId_topic: { playerId: player.id, topic: 'count' } },
    create: { playerId: player.id, ownerId: owner, topic: 'count', answered, correct: 0, rounds: 1, bestStars: 0, bestCorrect: 0 },
    update: { answered, correct: 0, rounds: 1, bestStars: 0, bestCorrect: 0 },
  });
  await set(COUNT_CAP - ROUND_LENGTH + 1);
  await assert.rejects(() => saveRoundFor(owner, { playerId: player.id, topic: 'count', correct: 10 }), refusedWith(COUNT_FULL), 'one past the cap');
  const unchanged = (await readPlayerFor(owner, player.id)).scores.count;
  assert.deepEqual(unchanged, { rounds: 1, bestStars: 0, bestCorrect: 0, answered: COUNT_CAP - ROUND_LENGTH + 1, correct: 0 }, 'the bests stay too');
  await set(COUNT_CAP - ROUND_LENGTH);
  const full = await saveRoundFor(owner, { playerId: player.id, topic: 'count', correct: 10 });
  assert.equal(full.score.answered, COUNT_CAP, 'exactly on the cap');
  assert.equal(full.score.bestStars, 3);
});

/* ---------- Tellop's records bounds ---------- */

test('every read and save stays inside Tellop\'s records bounds, even with six players who played every topic', async () => {
  const owner = 'bounds-owner';
  const players = [];
  for (let at = 0; at < MAX_PLAYERS; at += 1) players.push(await addPlayerFor(owner, newPlayer({ name: 'x'.repeat(MAX_NAME) })));
  for (const player of players) {
    for (const topic of TOPIC_IDS) await saveRoundFor(owner, { playerId: player.id, topic, correct: 10 });
  }
  const list = await measured(() => listPlayersFor(owner));
  bounded(list, 'the players', 2);
  assert.equal(list.value.length, MAX_PLAYERS);
  assert.ok(list.value.every((player) => player.stars === 3 * TOPIC_IDS.length));
  assert.ok(mostInFlight(list) <= 1);

  const read = await measured(() => readPlayerFor(owner, players[0].id));
  bounded(read, 'one player', 2);
  assert.equal(Object.keys(read.value.scores).length, TOPIC_IDS.length);

  bounded(await measured(() => saveRoundFor(owner, { playerId: players[0].id, topic: 'using-x', correct: 7 })), 'a round', 2);
  bounded(
    await measured(() => changePlayerFor(owner, { playerId: players[0].id, name: 'B', animal: 'cat', level: 2, soundOn: false })),
    'a change',
    1,
  );
  bounded(await measured(() => removePlayerFor(owner, { playerId: players[5].id })), 'a removal', 1);
  bounded(await measured(() => addPlayerFor(owner, newPlayer())), 'an add', 2);
});

/* ---------- the four addresses ---------- */

/**
 * @param {string} address
 * @param {BodyInit} body
 * @param {Record<string, string>} [headers]
 */
function request(address, body, headers = {}) {
  return new Request(`http://localhost${address}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

/** @param {Response} response */
function assertPrivate(response) {
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

const ROUTES = [addRoute, changeRoute, removeRoute, roundRoute];

test('the addresses answer POST only and choose the owner themselves', () => {
  assert.equal(currentOwner(), 'local-owner');
  for (const route of ROUTES) {
    assert.equal(typeof route.POST, 'function');
    assert.equal(route.GET, undefined);
    assert.equal(route.PUT, undefined);
    assert.equal(route.DELETE, undefined);
    const preflight = route.OPTIONS();
    assert.equal(preflight.status, 405);
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  }
});

test('a whole game goes through the addresses, for the app\'s own owner', async () => {
  const added = await addRoute.POST(request('/api/players/add', JSON.stringify(newPlayer({ name: 'Mert', level: 1 }))));
  assertPrivate(added);
  assert.equal(added.status, 200);
  const { player } = await added.json();
  assert.equal(player.name, 'Mert');
  assert.notEqual(await readPlayerFor('local-owner', player.id), null, 'saved for the app\'s own owner');

  const round = await roundRoute.POST(request('/api/rounds', JSON.stringify({ playerId: player.id, topic: 'add-10', correct: 10 })));
  assertPrivate(round);
  assert.equal(round.status, 200);
  assert.equal((await round.json()).round.stars, 3);

  const changed = await changeRoute.POST(
    request('/api/players/change', JSON.stringify({ playerId: player.id, name: 'Mert', animal: 'lion', level: 2, soundOn: false })),
  );
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).player.level, 2);

  const removed = await removeRoute.POST(request('/api/players/remove', JSON.stringify({ playerId: player.id })));
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { removed: { removed: 1 } });
  const again = await removeRoute.POST(request('/api/players/remove', JSON.stringify({ playerId: player.id })));
  assert.equal(again.status, 400);
  assert.deepEqual(await again.json(), { problem: NO_PLAYER });
});

test('only a small JSON request is read: plain text, bad JSON and an oversized body are refused', async () => {
  const body = JSON.stringify(newPlayer());
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    const response = await addRoute.POST(request('/api/players/add', body, { 'content-type': type }));
    assert.equal(response.status, 400, type || 'no type');
    assert.deepEqual(await response.json(), { problem: REFUSED });
  }
  const broken = await addRoute.POST(request('/api/players/add', '{"name":'));
  assert.deepEqual(await broken.json(), { problem: REFUSED });
  // A good request padded with spaces: read at the limit, refused one byte past it.
  const exactly = body.padEnd(MAX_BODY_BYTES, ' ');
  const atLimit = await addRoute.POST(request('/api/players/add', exactly));
  assert.equal(atLimit.status, 200, 'a body exactly at the limit is read');
  const over = await addRoute.POST(request('/api/players/add', `${exactly} `));
  assert.equal(over.status, 400);
  assert.deepEqual(await over.json(), { problem: REFUSED });
  const { player } = await atLimit.json();
  await removePlayerFor('local-owner', { playerId: player.id });
});
