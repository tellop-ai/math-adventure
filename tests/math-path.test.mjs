/**
 * The adventure's path (`lib/math/path.js`): what is open, what comes next, the
 * badges, a big challenge's questions, and the one moment a round's end shows.
 *
 * Each rule is checked at its edge and one step past it: 5 and 6 right on a
 * stop, 7 and 8 right on a big challenge, all stops but the last and every
 * stop done.
 *
 * Pure: nothing here touches stored information.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

const {
  BADGE_TOTAL,
  GATE_IDS,
  LANDS,
  MOST_LINES,
  ROUND_IDS,
  challengeShares,
  gateId,
  isOpen,
  levelOfRound,
  makeRoundFor,
  nextAfter,
  pointOf,
  progressOf,
  rewardsFor,
  rightFor,
  roundWords,
} = await import('../lib/math/path.js');
const { LEVELS, ROUND_LENGTH, TOPICS, TOPIC_IDS, answersByChoice, starsFor } = await import('../lib/math/topics.js');

/** Best stars from right answers, by round name. @param {Record<string, number>} rights */
function scoresFrom(rights) {
  return Object.fromEntries(Object.entries(rights).map(([id, correct]) => [id, { bestStars: starsFor(correct) }]));
}

/** Every stop of a level with `correct` right. @param {number} level @param {number} correct */
function levelDone(level, correct = 6) {
  return Object.fromEntries(LEVELS[level - 1].topics.map((id) => [id, correct]));
}

/** @param {ReturnType<typeof progressOf>} progress @param {number} level */
function states(progress, level) {
  return progress.levels[level - 1].points.map((point) => point.state);
}

/** A level just reached: its first stop next, every other stop and its big challenge locked. @param {number} level */
function justReached(level) {
  return ['next', ...Array(LEVELS[level - 1].topics.length).fill('locked')];
}

/* ---------- the order and the names ---------- */

test('each level\'s path holds its own topics, each once, and every topic is on the path', () => {
  const onPath = LEVELS.flatMap((entry) => entry.topics);
  assert.deepEqual(LEVELS.map((entry) => entry.topics.length), [7, 7, 6, 5, 5, 7, 7, 7]);
  assert.equal(onPath.length, 51);
  assert.deepEqual([...onPath].sort(), [...TOPIC_IDS].sort());
  for (const entry of LEVELS) {
    assert.equal(new Set(entry.topics).size, entry.topics.length, `level ${entry.level}`);
    for (const id of entry.topics) assert.equal(TOPICS[id].level, entry.level, id);
  }
});

test('the old stops keep their order, and the block stops come where they teach', () => {
  const oldOnly = (level, added) => LEVELS[level - 1].topics.filter((id) => !added.includes(id));
  assert.deepEqual(oldOnly(1, ['blocks-tower', 'make-10']), ['count', 'compare', 'add-10', 'take-away-10', 'add-20']);
  assert.deepEqual(oldOnly(2, ['blocks-tens', 'blocks-add']), ['tens-ones', 'skip-count', 'add-100', 'take-away-100', 'doubles-halves']);
  assert.deepEqual(oldOnly(3, ['blocks-hundreds']), ['add-1000', 'times-easy', 'times-hard', 'share', 'missing-factor']);
  assert.equal(LEVELS[0].topics[0], 'count', 'a new player still starts by counting');
  assert.deepEqual(LEVELS[5].topics.slice(-2), ['angles', 'mean']);
  assert.deepEqual(LEVELS[6].topics.slice(-2), ['brackets', 'chance']);
  assert.deepEqual(LEVELS[7].topics.slice(-2), ['two-equations', 'patterns'], 'the top levels\' new stops come last');
});

test('59 rounds can be kept: the 51 stops and a big challenge a level, each with its level and words', () => {
  assert.deepEqual(GATE_IDS, ['gate-1', 'gate-2', 'gate-3', 'gate-4', 'gate-5', 'gate-6', 'gate-7', 'gate-8']);
  assert.equal(ROUND_IDS.length, 59);
  assert.equal(new Set(ROUND_IDS).size, 59);
  assert.equal(BADGE_TOTAL, 16);
  assert.equal(LANDS.length, 8);
  for (const land of LANDS) assert.equal(land.level, LANDS.indexOf(land) + 1);
  assert.equal(levelOfRound('gate-3'), 3);
  assert.equal(levelOfRound('area'), 5);
  for (const unknown of ['gate-0', 'gate-9', 'gate-', 'dragon', '', '__proto__', 'constructor']) {
    assert.equal(levelOfRound(unknown), null, unknown);
  }
  assert.deepEqual(roundWords('gate-4'), { key: 'math.gate.name', values: { level: 4 } });
  assert.deepEqual(roundWords('count'), { key: 'math.topic.count' });
});

test('a stop needs 6 right and a big challenge 8 right', () => {
  assert.equal(rightFor(1), 6);
  assert.equal(rightFor(2), 8);
  assert.equal(rightFor(3), 10);
});

/* ---------- what is open ---------- */

test('a new player at level 1: only the first stop is open, and it is where they stand', () => {
  const progress = progressOf(1, {});
  assert.equal(progress.current, 1);
  assert.equal(progress.finished, false);
  assert.deepEqual(states(progress, 1), justReached(1));
  for (let level = 2; level <= 8; level += 1) {
    assert.equal(progress.levels[level - 1].open, false, `level ${level}`);
    assert.ok(states(progress, level).every((state) => state === 'locked'), `level ${level}`);
  }
  assert.equal(progress.badges, 0);
});

test('the next stop opens at 6 right on the one before, not at 5', () => {
  const [first, second, third] = LEVELS[0].topics;
  assert.equal(pointOf(progressOf(1, scoresFrom({ [first]: 5 })), second).state, 'locked');
  assert.equal(pointOf(progressOf(1, scoresFrom({ [first]: 5 })), first).state, 'next', 'played but not done is still the next');
  const opened = progressOf(1, scoresFrom({ [first]: 6 }));
  assert.equal(pointOf(opened, first).state, 'done');
  assert.equal(pointOf(opened, second).state, 'next');
  assert.equal(pointOf(opened, third).state, 'locked');
});

test('the big challenge opens when every stop is done, not all but the last', () => {
  for (const level of [1, 3, 4, 8]) {
    const allButLast = levelDone(level);
    delete allButLast[LEVELS[level - 1].topics.at(-1)];
    assert.equal(pointOf(progressOf(level, scoresFrom(allButLast)), gateId(level)).state, 'locked', `level ${level}`);
    assert.equal(pointOf(progressOf(level, scoresFrom(levelDone(level))), gateId(level)).state, 'next', `level ${level}`);
  }
});

test('a player who had every old stop of a level waits for its new stops; nothing they had is taken away', () => {
  // Played before the block stops came: the five old stops of level 1 have stars, the challenge not yet.
  const old = Object.fromEntries(['count', 'compare', 'add-10', 'take-away-10', 'add-20'].map((id) => [id, 8]));
  const progress = progressOf(1, scoresFrom(old));
  assert.equal(pointOf(progress, 'blocks-tower').state, 'next', 'the first new stop is where they stand');
  assert.equal(pointOf(progress, 'make-10').state, 'open', 'the stop before it (add-10) has a star, so it is open too');
  for (const id of Object.keys(old)) assert.equal(pointOf(progress, id).state, 'done', id);
  assert.equal(pointOf(progress, 'gate-1').state, 'locked');
  // A level already passed stays passed, and every stop in it is open.
  const passed = progressOf(1, scoresFrom({ ...old, 'gate-1': 9 }));
  assert.equal(passed.levels[0].passed, true);
  assert.equal(passed.current, 2);
  assert.equal(isOpen(passed, 'make-10'), true);
});

test('8 right on the big challenge passes the level and opens the next; 7 does not', () => {
  const seven = progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 7 }));
  assert.equal(seven.levels[0].passed, false);
  assert.equal(seven.levels[1].open, false);
  assert.equal(pointOf(seven, 'gate-1').state, 'next');
  const eight = progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 8 }));
  assert.equal(eight.levels[0].passed, true);
  assert.equal(eight.levels[0].badge, true);
  assert.equal(eight.current, 2);
  assert.deepEqual(states(eight, 2), justReached(2));
  assert.equal(eight.levels[2].open, false);
  assert.equal(eight.badges, 1);
});

test('a passed level is open to play in any order, with no stop marked as next', () => {
  const progress = progressOf(1, scoresFrom({ 'gate-1': 8, [LEVELS[0].topics[0]]: 2 }));
  assert.ok(states(progress, 1).every((state) => state === 'open' || state === 'done'));
  assert.ok(!states(progress, 1).includes('next'));
});

test('a starting level of 5 opens levels 1 to 4 to play, starts the path at 5, and wins no badge for it', () => {
  const progress = progressOf(5, {});
  assert.equal(progress.current, 5);
  assert.deepEqual(progress.levels.map((entry) => entry.open), [true, true, true, true, true, false, false, false]);
  assert.deepEqual(progress.levels.map((entry) => entry.passed), [true, true, true, true, false, false, false, false]);
  for (let level = 1; level <= 4; level += 1) assert.ok(states(progress, level).every((state) => state === 'open'), `level ${level}`);
  assert.deepEqual(states(progress, 5), justReached(5));
  assert.equal(progress.badges, 0);
  assert.equal(isOpen(progress, 'gate-2'), true, 'a skipped level\'s challenge can still be played for its badge');
  assert.equal(isOpen(progress, LEVELS[5].topics[0]), false);
});

test('a starting level outside 1 to 8 reads as the nearest end', () => {
  assert.equal(progressOf(0, {}).placement, 1);
  assert.equal(progressOf(12, {}).placement, 8);
  assert.equal(progressOf(Number.NaN, {}).placement, 1);
});

test('passing the last big challenge finishes the adventure', () => {
  const almost = progressOf(8, scoresFrom({ ...levelDone(8), 'gate-8': 7 }));
  assert.equal(almost.finished, false);
  assert.equal(almost.current, 8);
  const done = progressOf(8, scoresFrom({ ...levelDone(8), 'gate-8': 8 }));
  assert.equal(done.finished, true);
  assert.equal(done.current, 8);
  assert.ok(done.levels.every((entry) => entry.open && entry.passed));
});

test('a lowered starting level closes what was above it again, until it is passed on the path', () => {
  // Placed at 3 once and passed level 3's challenge; then the starting level went back to 2.
  const rights = { ...levelDone(3), 'gate-3': 10 };
  const progress = progressOf(2, scoresFrom(rights));
  assert.equal(progress.current, 2);
  assert.equal(progress.levels[2].open, false);
  assert.equal(isOpen(progress, 'gate-3'), false, 'a won badge opens nothing');
  assert.equal(pointOf(progress, 'gate-3').state, 'locked');
  assert.equal(isOpen(progress, LEVELS[2].topics[0]), false);
  assert.equal(progress.badges, 1, 'a badge once won stays won');
  const back = progressOf(2, scoresFrom({ ...rights, ...levelDone(2), 'gate-2': 8 }));
  assert.equal(back.levels[2].passed, true);
  assert.equal(back.current, 4);
});

test('a stop that already has a star stays open, whatever comes before it', () => {
  const [first, second, third, fourth] = LEVELS[0].topics;
  const progress = progressOf(1, scoresFrom({ [first]: 6, [third]: 6 }));
  assert.equal(pointOf(progress, second).state, 'next');
  assert.equal(pointOf(progress, third).state, 'done');
  assert.equal(pointOf(progress, fourth).state, 'open');
  assert.equal(states(progress, 1).filter((state) => state === 'next').length, 1);
});

test('a gold badge needs 3 stars on every stop and the big challenge', () => {
  const all = { ...levelDone(1, 10), 'gate-1': 10 };
  const gold = progressOf(1, scoresFrom(all));
  assert.equal(gold.levels[0].gold, true);
  assert.equal(gold.badges, 2);
  const short = progressOf(1, scoresFrom({ ...all, [LEVELS[0].topics[2]]: 9 }));
  assert.equal(short.levels[0].gold, false);
  assert.equal(short.badges, 1);
  const missing = { ...all };
  delete missing['make-10'];
  assert.equal(progressOf(1, scoresFrom(missing)).levels[0].gold, false, 'a new stop not yet played holds gold back');
});

test('only an open point may be played; an unknown name never', () => {
  const progress = progressOf(1, scoresFrom({ [LEVELS[0].topics[0]]: 6 }));
  assert.equal(isOpen(progress, LEVELS[0].topics[0]), true);
  assert.equal(isOpen(progress, LEVELS[0].topics[1]), true);
  assert.equal(isOpen(progress, LEVELS[0].topics[2]), false);
  assert.equal(isOpen(progress, 'gate-1'), false);
  for (const unknown of ['dragon', 'gate-9', '']) assert.equal(isOpen(progress, unknown), false, unknown);
});

/* ---------- what comes next ---------- */

test('after a round the path goes on: the next stop, then the big challenge, then the next level', () => {
  const [first, second] = LEVELS[0].topics;
  const last = LEVELS[0].topics.at(-1);
  assert.equal(nextAfter(progressOf(1, {}), first), null, 'the next stop is still locked');
  assert.deepEqual(nextAfter(progressOf(1, scoresFrom({ [first]: 6 })), first), { id: second, kind: 'stop', level: 1 });
  assert.deepEqual(nextAfter(progressOf(1, scoresFrom(levelDone(1))), last), { id: 'gate-1', kind: 'gate', level: 1 });
  assert.equal(nextAfter(progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 7 })), 'gate-1'), null);
  assert.deepEqual(
    nextAfter(progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 8 })), 'gate-1'),
    { id: LEVELS[1].topics[0], kind: 'level', level: 2 },
  );
  assert.equal(nextAfter(progressOf(8, scoresFrom({ ...levelDone(8), 'gate-8': 10 })), 'gate-8'), null, 'nothing after the last');
  assert.equal(nextAfter(progressOf(1, {}), 'dragon'), null);
});

/* ---------- a big challenge's questions ---------- */

test('a big challenge\'s ten questions are shared over its stops, the last stops one more when ten does not divide', () => {
  assert.deepEqual(challengeShares(5), [2, 2, 2, 2, 2]);
  assert.deepEqual(challengeShares(6), [1, 1, 2, 2, 2, 2]);
  assert.deepEqual(challengeShares(7), [1, 1, 1, 1, 2, 2, 2]);
  for (let stops = 1; stops <= ROUND_LENGTH; stops += 1) {
    const shares = challengeShares(stops);
    assert.equal(shares.reduce((sum, share) => sum + share, 0), ROUND_LENGTH, `${stops} stops`);
    assert.ok(shares.every((share, at) => share >= 1 && (at === 0 || share >= shares[at - 1])), `${stops} stops climb`);
  }
});

test('a big challenge takes its questions from each stop, in the order of the path, and replays from its seed', () => {
  for (const entry of LEVELS) {
    const shares = challengeShares(entry.topics.length);
    for (const seed of [0, 1, 2026, 4294967295]) {
      const round = makeRoundFor(gateId(entry.level), seed);
      assert.equal(round.length, ROUND_LENGTH);
      assert.deepEqual(
        round.map((question) => question.topic),
        entry.topics.flatMap((id, at) => Array(shares[at]).fill(id)),
        `level ${entry.level}`,
      );
      for (let at = 1; at < round.length; at += 1) {
        if (round[at].topic !== round[at - 1].topic) continue;
        assert.notDeepEqual(
          [round[at].ask, round[at].show, round[at].answer],
          [round[at - 1].ask, round[at - 1].show, round[at - 1].answer],
          `level ${entry.level} seed ${seed} question ${at + 1}`,
        );
      }
      assert.deepEqual(makeRoundFor(gateId(entry.level), seed), round);
      for (const question of round) {
        assert.equal(question.choices !== null, answersByChoice(entry.level), `${question.topic} answers like its level`);
      }
    }
  }
  assert.deepEqual(makeRoundFor('count', 7).map((question) => question.topic), Array(10).fill('count'));
});

test('a five-stop big challenge makes exactly the questions it made before the new stops came', () => {
  // Digests of `makeRoundFor` taken from the game before this change (master 72c4ae4).
  const before = {
    'gate-4': ['894776a0a7e04c27b7876a62dd7f52379681520344b600daa5d86e341adfd33b', '2bfb5067dfade2325d58c5b7977b2fab758548ffb4196639ac0723f1915bbbf2', '35e4e36998350bb6df41e57eeeec4f4c287d0ef53314413a0e03cfe1796d3a07', '0dee33fae63e7bd52eb01bdf345d3cd979d54e8a163db67d2f9f368f55e803cc'],
    'gate-5': ['5da9c1d51ebed4dd8773ced6df56f3d990787e02dad2ca1e6ed4df5e8dc4ad63', '691b5fa028ef24e470575a36943b41bdb6a35662ba7ccec15f293d59f08d50a6', 'ca8a37361f34dc3e8b19bdf8e19bc6f8f860b1924892fe46b6ceb306b85df3dc', '7e825cb9d105f9ff7dc9d980c33aff63174d5f3d5dcbbf72ded9e84663a56f7a'],
  };
  for (const [gate, digests] of Object.entries(before)) {
    for (const [at, seed] of [0, 1, 2026, 4294967295].entries()) {
      const digest = createHash('sha256').update(JSON.stringify(makeRoundFor(gate, seed))).digest('hex');
      assert.equal(digest, digests[at], `${gate} seed ${seed}`);
    }
  }
});

/* ---------- the moment a round's end shows ---------- */

const ROUND = { stars: 1, newBest: false };

test('opening the next stop is the headline, and 6 right is the mark until then', () => {
  const [first] = LEVELS[0].topics;
  const before = progressOf(1, {});
  const missed = rewardsFor(before, progressOf(1, scoresFrom({ [first]: 5 })), first, { stars: 0, newBest: false });
  assert.equal(missed.headline, 'tryAgain');
  assert.deepEqual(missed.mark, { right: 6, opens: 'stop' });
  assert.equal(missed.next, null);
  const made = rewardsFor(before, progressOf(1, scoresFrom({ [first]: 6 })), first, ROUND);
  assert.equal(made.headline, 'stopOpened');
  assert.equal(made.mark, null);
  assert.equal(made.next?.id, LEVELS[0].topics[1]);
});

test('the last stop opens the big challenge, which opens the next level with its badge', () => {
  const four = levelDone(1);
  const fifth = LEVELS[0].topics.at(-1);
  delete four[fifth];
  const missed = rewardsFor(progressOf(1, scoresFrom(four)), progressOf(1, scoresFrom(four)), fifth, { stars: 0, newBest: false });
  assert.deepEqual(missed.mark, { right: 6, opens: 'gate' });
  const opened = rewardsFor(progressOf(1, scoresFrom(four)), progressOf(1, scoresFrom(levelDone(1))), fifth, ROUND);
  assert.equal(opened.headline, 'gateOpened');
  assert.equal(opened.next?.kind, 'gate');

  const ready = progressOf(1, scoresFrom(levelDone(1)));
  const failed = rewardsFor(ready, progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 7 })), 'gate-1', ROUND);
  assert.equal(failed.headline, 'stars');
  assert.deepEqual(failed.mark, { right: 8, opens: 'level' });
  const passed = rewardsFor(ready, progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 8 })), 'gate-1', { stars: 2, newBest: true });
  assert.equal(passed.headline, 'levelOpened');
  assert.equal(passed.level, 2);
  assert.deepEqual(passed.lines, ['newBest'], 'the badge comes with the level, not as a line of its own');
  assert.equal(passed.next?.kind, 'level');
});

test('the last big challenge finishes the adventure', () => {
  const ready = progressOf(8, scoresFrom(levelDone(8)));
  const failed = rewardsFor(ready, progressOf(8, scoresFrom({ ...levelDone(8), 'gate-8': 7 })), 'gate-8', ROUND);
  assert.deepEqual(failed.mark, { right: 8, opens: 'finish' });
  const done = rewardsFor(ready, progressOf(8, scoresFrom({ ...levelDone(8), 'gate-8': 10 })), 'gate-8', { stars: 3, newBest: false });
  assert.equal(done.headline, 'finished');
  assert.deepEqual(done.lines, []);
  assert.equal(done.next, null);
});

test('one headline, the biggest; at most two small lines; nothing on a replay that opens nothing', () => {
  // A skipped level's challenge passed with 3 stars, completing its gold: the badge leads, gold and best follow.
  const golden = { ...levelDone(1, 10) };
  const before = progressOf(3, scoresFrom({ ...golden, 'gate-1': 9 }));
  const after = progressOf(3, scoresFrom({ ...golden, 'gate-1': 10 }));
  const moment = rewardsFor(before, after, 'gate-1', { stars: 3, newBest: true });
  assert.equal(moment.headline, 'gold');
  assert.deepEqual(moment.lines, ['newBest']);
  const first = progressOf(3, scoresFrom(golden));
  const both = rewardsFor(first, after, 'gate-1', { stars: 3, newBest: true });
  assert.equal(both.headline, 'badge');
  assert.deepEqual(both.lines, ['gold', 'newBest']);
  assert.ok(both.lines.length <= MOST_LINES);
  assert.equal(both.mark, null, 'no mark in a level that is already passed');

  const [first1] = LEVELS[0].topics;
  const replay = progressOf(1, scoresFrom({ [first1]: 8 }));
  assert.equal(rewardsFor(replay, progressOf(1, scoresFrom({ [first1]: 9 })), first1, { stars: 2, newBest: true }).headline, 'newBest');
  const quiet = rewardsFor(replay, replay, first1, { stars: 2, newBest: false });
  assert.equal(quiet.headline, 'stars');
  assert.deepEqual(quiet.lines, []);
  assert.equal(quiet.mark, null);
  assert.equal(quiet.cleared, true);
});

test('the next step leads only when this round reached its point\'s mark', () => {
  const [first] = LEVELS[0].topics;
  const done = progressOf(1, scoresFrom({ [first]: 8 }));
  const missed = rewardsFor(done, done, first, { stars: 0, newBest: false });
  assert.equal(missed.cleared, false, 'a done stop replayed with 5 right does not lead on');
  assert.equal(missed.next?.id, LEVELS[0].topics[1], 'but the next step is still offered');
  assert.equal(rewardsFor(done, done, first, { stars: 1, newBest: false }).cleared, true);
  const gate = progressOf(1, scoresFrom({ ...levelDone(1), 'gate-1': 9 }));
  assert.equal(rewardsFor(gate, gate, 'gate-1', { stars: 1, newBest: false }).cleared, false, '7 right on a passed challenge');
  assert.equal(rewardsFor(gate, gate, 'gate-1', { stars: 2, newBest: false }).cleared, true);
});

test('a passed level\'s challenge without its badge says that 8 right wins it', () => {
  const skipped = progressOf(3, {});
  const failed = rewardsFor(skipped, progressOf(3, scoresFrom({ 'gate-1': 7 })), 'gate-1', { stars: 1, newBest: false });
  assert.deepEqual(failed.mark, { right: 8, opens: 'badge' });
  const won = progressOf(3, scoresFrom({ 'gate-1': 8 }));
  assert.equal(rewardsFor(won, won, 'gate-1', { stars: 2, newBest: false }).mark, null);
});
