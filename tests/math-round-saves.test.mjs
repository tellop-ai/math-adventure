/**
 * A round's save, whatever the player does while it is on its way: a
 * confirmed save always reaches the scores, and a refusal is shown on its
 * own round or, once that round is gone, on the topics screen. Never nowhere,
 * and never on a newer round as if it were that round's.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { roundSaves } from '../lib/math/round-saves.js';

/** A fake address: the save waits until the test answers it. */
function pendingSave() {
  let answer = () => {};
  const promise = new Promise((resolve) => { answer = resolve; });
  return {
    send: () => promise,
    accept: (score) => answer({ value: score }),
    refuse: (problem) => answer({ problem }),
  };
}

function screens() {
  const seen = { scores: [], round: [], late: [] };
  return {
    seen,
    show: {
      scores: (score) => seen.scores.push(score),
      round: (problem) => seen.round.push(problem),
      late: (problem) => seen.late.push(problem),
    },
  };
}

const SCORE = Object.freeze({ rounds: 1, bestStars: 2, bestCorrect: 8, answered: 10, correct: 8 });

test('a save answered while its round is on the screen is shown on that round', async () => {
  const { seen, show } = screens();
  const saves = roundSaves(show);
  saves.begin();
  const saved = pendingSave();
  const done = saves.save(saved.send);
  saved.accept(SCORE);
  await done;
  assert.deepEqual(seen, { scores: [SCORE], round: [''], late: [] });

  const refused = pendingSave();
  const second = saves.save(refused.send);
  refused.refuse('error.saveFailed');
  await second;
  assert.deepEqual(seen.round, ['', 'error.saveFailed']);
  assert.deepEqual(seen.late, [], 'a refusal on the screen is not shown twice');
});

test('a refusal that comes back after Stop goes to the topics screen', async () => {
  const { seen, show } = screens();
  const saves = roundSaves(show);
  saves.begin();
  const save = pendingSave();
  const done = saves.save(save.send);
  saves.leave();
  save.refuse('math.problem.countFull');
  await done;
  assert.deepEqual(seen, { scores: [], round: [], late: ['math.problem.countFull'] });
});

test('a refusal that comes back after Play again is not shown as the new round\'s own', async () => {
  const { seen, show } = screens();
  const saves = roundSaves(show);
  saves.begin();
  const save = pendingSave();
  const done = saves.save(save.send);
  saves.begin();
  save.refuse('error.saveUnconfirmed');
  await done;
  assert.deepEqual(seen, { scores: [], round: [], late: ['error.saveUnconfirmed'] });
});

test('a save confirmed after Stop or Play again still reaches the scores, and says nothing on another round', async () => {
  for (const moveOn of ['leave', 'begin']) {
    const { seen, show } = screens();
    const saves = roundSaves(show);
    saves.begin();
    const save = pendingSave();
    const done = saves.save(save.send);
    saves[moveOn]();
    save.accept(SCORE);
    await done;
    assert.deepEqual(seen, { scores: [SCORE], round: [], late: [] }, moveOn);
  }
});

test('a save sent while no round is on the screen is never shown as a round\'s', async () => {
  const { seen, show } = screens();
  const saves = roundSaves(show);
  const save = pendingSave();
  const done = saves.save(save.send);
  saves.begin();
  save.refuse('error.saveFailed');
  await done;
  assert.deepEqual(seen, { scores: [], round: [], late: ['error.saveFailed'] });
});
