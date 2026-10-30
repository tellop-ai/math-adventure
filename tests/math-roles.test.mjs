/**
 * Who may do what in the game, checked by calling the real code.
 *
 * - The rule itself (`lib/math/roles.js`): a row for each role Tellop names,
 *   and for a role it does not know.
 * - Who is using the game (`lib/math/person.js`): Tellop's answer as it is,
 *   nobody when Tellop cannot say, and Next's own signal passed on.
 * - Online, Tellop refuses a Viewer's every save and a Member's single-row
 *   write of a row someone else added (a round's `upsert`), and quietly skips
 *   a Member's `updateMany` or `deleteMany` of such rows (a change, a removal).
 *   Each reaches a person as "You cannot change this.", from the data
 *   functions, the four addresses and the page's send.
 *
 * Every records call here goes to a stand-in for Tellop's records door, the
 * way the kit's own `tests/person.test.mjs` does: no store is opened and
 * nothing reaches the network.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { afterEach, test } from 'node:test';

process.chdir(path.join(import.meta.dirname, '..'));

const { ROLES, canAdd, canChange, controlsFor } = await import('../lib/math/roles.js');
const { personOrNull } = await import('../lib/math/person.js');
const { DataError } = await import('../lib/data/index.js');
const { CANNOT_CHANGE, addPlayerFor, changePlayerFor, removePlayerFor, saveRoundFor } = await import('../lib/data/players.js');
const { ROUND_LENGTH } = await import('../lib/math/topics.js');
const { sendSave } = await import('../lib/math/send.js');
const { MESSAGES, t } = await import('../lib/i18n/index.js');
const addRoute = await import('../app/api/players/add/route.js');
const changeRoute = await import('../app/api/players/change/route.js');
const removeRoute = await import('../app/api/players/remove/route.js');
const roundRoute = await import('../app/api/rounds/route.js');

const PERSON = Symbol.for('tellop.person');
const ACTION = Symbol.for('tellop.internalRecordsAction');
const priorFlag = process.env.TELLOP_INTERNAL_RECORDS;
const priorNext = process.env.NEXT_RUNTIME;
const priorFetch = globalThis.fetch;

afterEach(() => {
  delete globalThis[PERSON];
  delete globalThis[ACTION];
  if (priorFlag === undefined) delete process.env.TELLOP_INTERNAL_RECORDS;
  else process.env.TELLOP_INTERNAL_RECORDS = priorFlag;
  if (priorNext === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = priorNext;
  globalThis.fetch = priorFetch;
});

/** @param {string} key */
const refusedWith = (key) => (error) => error instanceof DataError && error.messageKey === key;

/* ---------- the rule ---------- */

test('each role Tellop names may do what the game\'s one rule says', () => {
  assert.deepEqual(ROLES, ['owner', 'helper', 'member', 'viewer']);
  const rows = {
    owner: { canAdd: true, canChange: true, note: '' },
    helper: { canAdd: true, canChange: true, note: '' },
    member: { canAdd: true, canChange: false, note: 'math.role.notKept' },
    viewer: { canAdd: false, canChange: false, note: 'math.role.notKept' },
  };
  for (const role of ROLES) {
    assert.equal(canAdd(role), rows[role].canAdd, `${role} adds`);
    assert.equal(canChange(role), rows[role].canChange, `${role} changes`);
    assert.deepEqual(controlsFor({ id: 'owner', name: null, role, preview: false }), { ...rows[role], preview: false }, role);
  }
});

test('a role the game does not know, or nobody known, may do nothing that saves', () => {
  for (const role of ['admin', 'Owner', 'OWNER', ' owner', '', undefined, null, 1, {}]) {
    assert.equal(canAdd(role), false, String(role));
    assert.equal(canChange(role), false, String(role));
  }
  assert.deepEqual(controlsFor(null), { canAdd: false, canChange: false, preview: false, note: 'math.role.unknown' });
  assert.deepEqual(controlsFor({ role: 'admin' }), { canAdd: false, canChange: false, preview: false, note: 'math.role.notKept' });
});

test('only the owner looking as a Member or a Viewer is in a preview', () => {
  for (const role of ['member', 'viewer']) {
    assert.equal(controlsFor({ id: 'owner', name: 'Ayşe', role, preview: true }).preview, true, role);
  }
  assert.equal(controlsFor({ id: 'owner', name: 'Ayşe', role: 'owner', preview: false }).preview, false);
  // Only `true` itself counts.
  assert.equal(controlsFor({ id: 'owner', name: 'Ayşe', role: 'viewer', preview: 'yes' }).preview, false);
});

/* ---------- who is using the game ---------- */

test('outside Tellop the one person is the owner, and every control is drawn', async () => {
  const person = await personOrNull();
  assert.deepEqual(person, { id: 'owner', name: null, role: 'owner', preview: false });
  assert.deepEqual(controlsFor(person), { canAdd: true, canChange: true, preview: false, note: '' });
});

test('inside Tellop the person is the one Tellop names, never one the game guesses', async () => {
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  globalThis[PERSON] = async () => ({ id: 'p_abcdefghijklmnopqrstuv', name: 'Deniz', role: 'viewer' });
  assert.deepEqual(controlsFor(await personOrNull()), { canAdd: false, canChange: false, preview: false, note: 'math.role.notKept' });
  globalThis[PERSON] = async () => ({ id: 'owner', name: 'Ayşe', role: 'member', preview: true });
  assert.deepEqual(controlsFor(await personOrNull()), { canAdd: true, canChange: false, preview: true, note: 'math.role.notKept' });
});

test('when Tellop cannot say who it is, nobody is known and nothing saves', async () => {
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  // No way to ask, a way that fails, and an answer of the wrong shape.
  assert.equal(await personOrNull(), null);
  globalThis[PERSON] = async () => { throw new Error('records-delivery-uncertain'); };
  assert.equal(await personOrNull(), null);
  globalThis[PERSON] = async () => ({ id: 'owner', name: 'Ayşe', role: 'admin' });
  assert.equal(await personOrNull(), null);
  assert.deepEqual(controlsFor(await personOrNull()), { canAdd: false, canChange: false, preview: false, note: 'math.role.unknown' });
});

test('Next\'s own signal that a page is drawn for each visit is passed on, never taken for nobody', async () => {
  // Next names itself in NEXT_RUNTIME; with no visit (as in `next build`) its `connection()` refuses.
  process.env.NEXT_RUNTIME = 'nodejs';
  await assert.rejects(() => personOrNull(), (error) => !(error instanceof DataError) && /connection/u.test(String(error?.message)));
});

/* ---------- the host's refusal and its quiet skip ---------- */

const PLAYER_ROW = Object.freeze({ id: 7, seat: 1, name: 'Deniz', animal: 'fox', level: 1, soundOn: true });
const SCORE_ROW = Object.freeze({ topic: 'count', rounds: 1, bestStars: 0, bestCorrect: 0, answered: ROUND_LENGTH, correct: 0 });
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
/** The writes of one row by its unique where: Tellop refuses these, never skips them. */
const SINGLE_ROW_WRITES = new Set(['update', 'upsert', 'delete']);

/**
 * A stand-in for Tellop's records door as its online data service answers a
 * Viewer or a Member, with one player and their Counting result, both added
 * by someone else:
 *
 * - a Viewer: every call that writes is refused (`records-forbidden`) before
 *   anything is read;
 * - a Member: a single-row write of a row there (a round's `upsert`, even with
 *   an empty `update`) fails the whole call as `records-forbidden`, and
 *   nothing is kept; an `updateMany` or `deleteMany` skips those rows and
 *   counts nothing; a `create` is the Member's own.
 *
 * @param {'viewer' | 'member'} as
 */
function tellopAs(as) {
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  globalThis[ACTION] = async (steps) => {
    if (as === 'viewer' && steps.some((step) => WRITES.has(step.action))) throw new Error('records-forbidden');
    if (steps.some((step) => SINGLE_ROW_WRITES.has(step.action))) throw new Error('records-forbidden');
    return steps.map((step) => {
      if (step.model === 'Player' && step.action === 'findFirst') return { ...PLAYER_ROW };
      if (step.model === 'Player' && step.action === 'findMany') return [{ ...PLAYER_ROW }];
      if (step.model === 'TopicScore' && step.action === 'findMany') return [{ ...SCORE_ROW }];
      if (step.model === 'TopicScore' && step.action === 'findFirst') return { ...SCORE_ROW };
      if (step.action === 'updateMany' || step.action === 'deleteMany') return { count: 0 };
      if (step.model === 'Player' && step.action === 'create') return { id: 8, ...step.args.data };
      throw new Error(`no stand-in for ${step.model}.${step.action}`);
    });
  };
}

const CHANGE = Object.freeze({ playerId: PLAYER_ROW.id, name: 'Ada', animal: 'owl', level: 2, soundOn: false });

test('a Viewer\'s every save is refused with "You cannot change this."', async () => {
  tellopAs('viewer');
  await assert.rejects(() => addPlayerFor('local-owner', { name: 'Ada', animal: 'owl', level: 1 }), refusedWith(CANNOT_CHANGE));
  await assert.rejects(() => changePlayerFor('local-owner', CHANGE), refusedWith(CANNOT_CHANGE));
  await assert.rejects(() => removePlayerFor('local-owner', { playerId: PLAYER_ROW.id }), refusedWith(CANNOT_CHANGE));
  await assert.rejects(() => saveRoundFor('local-owner', { playerId: PLAYER_ROW.id, topic: 'count', correct: 9 }), refusedWith(CANNOT_CHANGE));
  assert.equal(CANNOT_CHANGE, 'error.cannotChange');
});

test('a Member\'s change or removal that Tellop skipped says so, never "not here any more"', async () => {
  tellopAs('member');
  // A Member may add.
  assert.equal((await addPlayerFor('local-owner', { name: 'Ada', animal: 'owl', level: 1 })).seat, 2);
  await assert.rejects(() => changePlayerFor('local-owner', CHANGE), refusedWith(CANNOT_CHANGE));
  await assert.rejects(() => removePlayerFor('local-owner', { playerId: PLAYER_ROW.id }), refusedWith(CANNOT_CHANGE));
});

test('a Member\'s round on a result someone else added is refused at its upsert, and nothing is kept', async () => {
  tellopAs('member');
  const sent = [];
  const door = globalThis[ACTION];
  globalThis[ACTION] = async (steps) => {
    sent.push(steps.map((step) => `${step.model}.${step.action}`).join(' '));
    return door(steps);
  };
  await assert.rejects(() => saveRoundFor('local-owner', { playerId: PLAYER_ROW.id, topic: 'count', correct: 9 }), refusedWith(CANNOT_CHANGE));
  // The two reads, then the one group of steps, refused whole at its first step.
  assert.deepEqual(sent, [
    'Player.findFirst',
    'TopicScore.findMany',
    'TopicScore.upsert TopicScore.updateMany TopicScore.updateMany TopicScore.updateMany TopicScore.findFirst',
  ]);
});

/**
 * @param {string} address
 * @param {unknown} body
 */
function post(address, body) {
  return new Request(`http://localhost${address}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('each address that saves answers a refused change with its own words, not "could not save"', async () => {
  const presses = [
    [addRoute, '/api/players/add', { name: 'Ada', animal: 'owl', level: 1 }],
    [changeRoute, '/api/players/change', CHANGE],
    [removeRoute, '/api/players/remove', { playerId: PLAYER_ROW.id }],
    [roundRoute, '/api/rounds', { playerId: PLAYER_ROW.id, topic: 'count', correct: 9 }],
  ];
  for (const as of ['viewer', 'member']) {
    tellopAs(as);
    for (const [route, address, body] of presses) {
      if (as === 'member' && route === addRoute) continue;
      const answer = await route.POST(post(address, body));
      assert.equal(answer.status, 403, `${as} ${address}`);
      assert.deepEqual(await answer.json(), { problem: 'error.cannotChange' }, `${as} ${address}`);
    }
  }
});

test('the page shows the refusal\'s own words, in both languages', async () => {
  globalThis.fetch = async () => Response.json({ problem: 'error.cannotChange' }, { status: 403 });
  assert.deepEqual(await sendSave('/api/players/change', CHANGE, 'player'), { problem: 'error.cannotChange' });
  assert.equal(t('error.cannotChange', 'en'), 'You cannot change this.');
  assert.equal(t('error.cannotChange', 'tr'), 'Bunu değiştiremezsiniz.');
  // A key the page has no words for is still "could not be saved".
  globalThis.fetch = async () => Response.json({ problem: 'error.somethingElse' }, { status: 400 });
  assert.deepEqual(await sendSave('/api/players/change', CHANGE, 'player'), { problem: 'error.saveFailed' });
});

test('every word the roles show is there in both languages', () => {
  for (const key of ['math.role.notKept', 'math.role.unknown', 'math.preview.back', 'math.home.noneTitle', 'math.home.noneBody', 'math.round.notKept', 'math.end.notKept', 'app.loading']) {
    for (const locale of ['en', 'tr']) assert.ok(typeof MESSAGES[locale][key] === 'string' && MESSAGES[locale][key].trim() !== '', `${locale} ${key}`);
  }
});
