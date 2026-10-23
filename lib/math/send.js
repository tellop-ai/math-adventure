/**
 * Sends one save from the page. Never retried here: a save that may already
 * have happened is never sent twice by itself.
 */

import { MESSAGES } from '../i18n/index.js';

/**
 * A problem key the page has words for, or the general "could not be saved".
 *
 * @param {unknown} key
 */
function knownProblem(key) {
  return typeof key === 'string' && Object.hasOwn(MESSAGES.en, key) ? key : 'error.saveFailed';
}

/**
 * Sends `body` to `address` and answers `{ value }`, the saved value the
 * address sent under `name`, or `{ problem }`, a word key. When no answer
 * arrives, the save may or may not have happened, and the words say so.
 *
 * @param {string} address
 * @param {unknown} body
 * @param {string} name
 * @returns {Promise<{ value: any, problem?: undefined } | { value?: undefined, problem: string }>}
 */
export async function sendSave(address, body, name) {
  let response;
  try {
    response = await fetch(address, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { problem: 'error.saveUnconfirmed' };
  }
  const payload = await response.json().catch(() => null);
  if (response.ok && payload !== null && typeof payload === 'object' && payload[name] !== undefined && payload[name] !== null) {
    return { value: payload[name] };
  }
  if (response.ok) return { problem: 'error.saveUnconfirmed' };
  return { problem: knownProblem(payload?.problem) };
}
