import { saveRoundFor } from '../../../lib/data/players.js';
import { answerPost, refusePreflight } from '../../../lib/math/respond.js';

/**
 * One finished round: the player, the topic and how many of the 10 were right.
 * The stars are worked out on the server.
 *
 * Only `POST` is answered, and the owner is chosen on the server, never taken
 * from the request (`lib/math/respond.js`).
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export function POST(request) {
  return answerPost(request, 'round', saveRoundFor);
}

export const OPTIONS = refusePreflight;
