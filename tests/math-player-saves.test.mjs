/**
 * Quick presses on the level buttons and Sound: whatever the answers, the
 * screen ends on what is saved, and only the newest press is sent once an
 * earlier save is on its way.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { playerSaves } from '../lib/math/player-saves.js';

/** A fake address: each send waits until the test answers it. */
function fakeAddress(start) {
  const sent = [];
  let stored = start;
  return {
    sent,
    stored: () => stored,
    send(wanted) {
      return new Promise((resolve) => {
        sent.push({
          wanted,
          accept: () => {
            stored = wanted;
            resolve({ value: wanted });
          },
          refuse: () => resolve({ problem: 'error.saveFailed' }),
        });
      });
    },
  };
}

/** Lets queued saves start. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function screen() {
  const shown = { player: null, problem: '' };
  return { shown, show: (player, problem) => Object.assign(shown, { player, problem }) };
}

const SAVED = Object.freeze({ id: 1, level: 1, soundOn: true });

test('two quick level presses, both refused: the screen goes back to the saved level', async () => {
  const address = fakeAddress(SAVED);
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, address.send, show);
  saves.change({ level: 3 }, 'math.map.levelNotSaved');
  await settle();
  const last = saves.change({ level: 5 }, 'math.map.levelNotSaved');
  assert.equal(shown.player.level, 5, 'the screen shows the press at once');
  address.sent[0].refuse();
  await settle();
  address.sent[1].refuse();
  await last;
  assert.equal(shown.player.level, 1);
  assert.equal(address.stored().level, 1);
  assert.equal(shown.problem, 'math.map.levelNotSaved');
});

test('the first refused and the second accepted: the screen and the store both hold the second', async () => {
  const address = fakeAddress(SAVED);
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, address.send, show);
  saves.change({ level: 3 }, 'math.map.levelNotSaved');
  await settle();
  const last = saves.change({ level: 5 }, 'math.map.levelNotSaved');
  address.sent[0].refuse();
  await settle();
  address.sent[1].accept();
  await last;
  assert.equal(shown.player.level, 5);
  assert.equal(address.stored().level, 5);
  assert.equal(shown.problem, '');
});

test('the first accepted and the second refused: the screen goes back to the first', async () => {
  const address = fakeAddress(SAVED);
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, address.send, show);
  saves.change({ level: 3 }, 'math.map.levelNotSaved');
  await settle();
  const last = saves.change({ level: 5 }, 'math.map.levelNotSaved');
  address.sent[0].accept();
  await settle();
  address.sent[1].refuse();
  await last;
  assert.equal(shown.player.level, 3);
  assert.equal(address.stored().level, 3);
});

test('a level and Sound pressed together: the newest save carries both, and a refusal puts both back', async () => {
  const address = fakeAddress(SAVED);
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, address.send, show);
  saves.change({ level: 4 }, 'math.map.levelNotSaved');
  await settle();
  const last = saves.change({ soundOn: false }, 'error.saveFailed');
  address.sent[0].refuse();
  await settle();
  assert.deepEqual(address.sent[1].wanted, { id: 1, level: 4, soundOn: false }, 'the newest save sends every field as shown');
  address.sent[1].refuse();
  await last;
  assert.deepEqual(shown.player, SAVED);
  assert.equal(shown.problem, 'error.saveFailed');
});

test('presses made while a save is on its way send only the newest one', async () => {
  const address = fakeAddress(SAVED);
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, address.send, show);
  saves.change({ level: 2 }, 'math.map.levelNotSaved');
  await settle();
  saves.change({ level: 3 }, 'math.map.levelNotSaved');
  saves.change({ level: 4 }, 'math.map.levelNotSaved');
  const last = saves.change({ level: 6 }, 'math.map.levelNotSaved');
  address.sent[0].accept();
  await settle();
  assert.equal(address.sent.length, 2, 'levels 3 and 4 are never sent');
  address.sent[1].accept();
  await last;
  assert.equal(address.sent[1].wanted.level, 6);
  assert.equal(shown.player.level, 6);
  assert.equal(address.stored().level, 6);
});

test('a player removed meanwhile says so, in its own words', async () => {
  const { shown, show } = screen();
  const saves = playerSaves(SAVED, async () => ({ problem: 'math.problem.noPlayer' }), show);
  await saves.change({ level: 2 }, 'math.map.levelNotSaved');
  assert.equal(shown.problem, 'math.problem.noPlayer');
  assert.equal(shown.player.level, 1);
});
