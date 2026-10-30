/**
 * Who is using the game in this visit, for the server's pages only.
 *
 * `currentPerson()` (`lib/data/person.js`) asks Tellop, never the browser. When
 * Tellop cannot say (an answer of the wrong shape, or a Tellop with no way to
 * say), it refuses with a `DataError` rather than guessing the owner; the game
 * then answers `null`, and `controlsFor(null)` (`./roles.js`) draws the page
 * with nothing that saves and a line that says why. Anything else (Next's own
 * signal that the page is drawn for each visit) goes on as it is, so it is
 * never mistaken for a person.
 */

import { currentPerson } from '../data/person.js';
import { DataError } from '../data/refusal.js';

/**
 * @returns {Promise<null | { id: string, name: string | null, role: 'owner' | 'member' | 'viewer' | 'helper', preview: boolean }>}
 */
export async function personOrNull() {
  try {
    return await currentPerson();
  } catch (error) {
    if (error instanceof DataError) return null;
    throw error;
  }
}
