import { AiProblem, speak } from '../../../../lib/ai.js';
import { fileResponse } from '../../../../lib/data/files.js';
import { HELPER_LIMITS, HELPER_REFUSED, HELPER_VOICE, readSpokenText } from '../../../../lib/math/helper.js';
import { readSmallJson } from '../../../../lib/math/request.js';
import { json, refusePreflight } from '../../../../lib/math/respond.js';

/**
 * The AI voice, on the person's AI allowance inside Tellop.
 *
 * POST `{ text }`, sent by a press of Listen or Read it to me: AI reads the
 * text aloud through the kit's helper, and the answer is `{ sound }`, the
 * kept reading's digest. The page keeps it while the round screen is open, so
 * a second press of the same text pays nothing. A refusal answers the kit's
 * words for it, and the page then reads with the Mac's own voice; nothing is
 * retried here.
 *
 * GET `?sound=` plays a reading, and only one this address made since the app
 * started: no record names the readings (the game's records stay as they
 * are), so this address remembers the newest it made, in memory, and plays no
 * other kept file.
 */
export const dynamic = 'force-dynamic';

/** The most readings remembered; the oldest is forgotten first. */
const REMEMBERED = 200;

/** The largest body read: the longest text in four-byte letters, and room for its field. */
const BODY_BYTES = HELPER_LIMITS.spoken * 4 + 64;

/** The readings this address made, oldest first. */
const made = new Set();

/** @param {string} sound */
function remember(sound) {
  made.delete(sound);
  made.add(sound);
  while (made.size > REMEMBERED) made.delete(made.values().next().value);
}

/** @param {Request} request */
export async function POST(request) {
  const body = await readSmallJson(request, BODY_BYTES);
  const text = readSpokenText(body !== null && typeof body === 'object' ? /** @type {{ text?: unknown }} */ (body).text : undefined);
  if (text === null) return json({ problem: HELPER_REFUSED }, 400);
  let spoken;
  try {
    spoken = await speak({ text, voice: HELPER_VOICE });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  }
  if (typeof spoken?.file !== 'string') return json({ problem: 'ai.unavailable' }, 503);
  remember(spoken.file);
  return json({ sound: spoken.file });
}

/** @param {Request} request */
export async function GET(request) {
  const sound = new URL(request.url).searchParams.get('sound');
  if (sound === null || !made.has(sound)) return json({ problem: HELPER_REFUSED }, 404);
  return await fileResponse(sound, request);
}

/** @param {Request} request */
export async function HEAD(request) {
  return GET(request);
}

export const OPTIONS = refusePreflight;
