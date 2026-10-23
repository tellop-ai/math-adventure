import { removePlayerFor } from '../../../../lib/data/players.js';
import { answerPost, refusePreflight } from '../../../../lib/math/respond.js';

/**
 * Removes a player and every result they have.
 *
 * Only `POST` is answered, and the owner is chosen on the server, never taken
 * from the request (`lib/math/respond.js`). There is no read here: the page
 * reads the players on the server as it opens.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export function POST(request) {
  return answerPost(request, 'removed', removePlayerFor);
}

export const OPTIONS = refusePreflight;
