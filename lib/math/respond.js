/**
 * How the game's addresses answer and refuse, shared by all four.
 *
 * **Sharing with other websites is off, and it is off by omission.** No answer
 * here carries `Access-Control-Allow-Origin`, so a browser refuses to hand this
 * app's answers to a page on another site. Answers are never kept by a cache.
 *
 * Refusals travel as message keys, never as sentences: the words are chosen in
 * the reader's language where they are displayed.
 */

import { DataError } from '../data/refusal.js';

import { REFUSED } from './limits.js';
import { currentOwner } from './owner.js';
import { readSmallJson } from './request.js';

/**
 * @param {unknown} body
 * @param {number} status
 */
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** @param {unknown} error */
export function refusal(error) {
  if (error instanceof DataError) return json({ problem: error.messageKey }, error.messageKey === 'error.saveUnconfirmed' ? 503 : 400);
  return json({ problem: 'error.saveFailed' }, 500);
}

/**
 * Answers a `POST` that carries a small JSON body: `save(owner, payload)` runs
 * for the owner chosen here, and its result is sent under `name`.
 *
 * @param {Request} request
 * @param {string} name
 * @param {(owner: string, payload: unknown) => Promise<unknown>} save
 */
export async function answerPost(request, name, save) {
  const payload = await readSmallJson(request);
  if (payload === undefined) return json({ problem: REFUSED }, 400);
  try {
    return json({ [name]: await save(currentOwner(), payload) });
  } catch (error) {
    return refusal(error);
  }
}

/** No cross-origin preflight is answered: another site's request gets no sharing header. */
export function refusePreflight() {
  return new Response(null, { status: 405, headers: { allow: 'POST' } });
}
