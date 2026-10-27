import { AiProblem, transcribe } from '../../../../lib/ai.js';
import { discardFile } from '../../../../lib/data/files.js';
import { getLocale } from '../../../../lib/i18n/index.js';
import { HELPER_REFUSED, heardText } from '../../../../lib/math/helper.js';
import { readSmallJson } from '../../../../lib/math/request.js';
import { json, refusePreflight } from '../../../../lib/math/respond.js';

/**
 * A question asked out loud, written down: `{ file }`, sent after the child's
 * Stop press, once the page kept the recording (`sendFile`, kit rule 6c). AI
 * writes it down in the app's language through the kit's helper, on the
 * person's allowance inside Tellop. The answer `{ heard }` goes into the
 * question field, and nothing is asked of the helper until the child presses
 * Send. Nothing is saved here, and the recording goes right after, written
 * down or refused (`discardFile`; a Tellop that cannot discard keeps it).
 * `{ file, drop: true }` only discards: the page sends it when the question
 * went before the recording was written down.
 */
export const dynamic = 'force-dynamic';

const DIGEST = /^[0-9a-f]{64}$/u;

/** @param {Request} request */
export async function POST(request) {
  const body = await readSmallJson(request);
  const file = body !== null && typeof body === 'object' ? /** @type {{ file?: unknown }} */ (body).file : undefined;
  if (typeof file !== 'string' || !DIGEST.test(file)) return json({ problem: HELPER_REFUSED }, 400);
  if (/** @type {{ drop?: unknown }} */ (body).drop === true) return json({ dropped: await discardFile(file) });
  let written;
  try {
    written = await transcribe({ file, language: getLocale() });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  } finally {
    await discardFile(file);
  }
  return json({ heard: heardText(written?.text) });
}

export const OPTIONS = refusePreflight;
