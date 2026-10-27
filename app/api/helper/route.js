import { AiProblem, askAI } from '../../../lib/ai.js';
import { getLocale } from '../../../lib/i18n/index.js';
import { clipped, givesAway, HELPER_LIMITS, helperMessages, helperReply, readHelperRequest } from '../../../lib/math/helper.js';
import { readSmallJson } from '../../../lib/math/request.js';
import { json, refusePreflight } from '../../../lib/math/respond.js';
import { makeQuestion } from '../../../lib/math/topics.js';

/**
 * The helper on the round screen: `{ kind, topic, seed, given?, asked?, history? }`,
 * sent by a press of Give me a hint, Explain it or Send (`lib/math/helper.js`
 * says what each carries). The question is made again here from its topic and
 * seed, so AI hears the game's own question (and, once the child has answered,
 * its answer and worked steps). Before an answer, a reply that says the answer
 * is refused (`math.helper.gaveAway`) rather than shown.
 *
 * AI is asked at the `standard` level through the kit's helper, on the
 * person's allowance inside Tellop. The answer `{ reply }` is a proposal shown
 * as plain text; nothing here is saved. A refusal from AI answers the kit's
 * own words for it, and nothing is retried here.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const press = readHelperRequest(await readSmallJson(request, HELPER_LIMITS.bodyBytes));
  if (!press.ok) return json({ problem: press.problem }, 400);
  let answer;
  try {
    answer = await askAI({ level: 'standard', messages: helperMessages(press.value, getLocale()), max_tokens: 300, temperature: 0.3 });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  }
  const reply = helperReply(answer.text);
  if (reply === null) return json({ problem: 'math.helper.empty' }, 502);
  if (press.value.given === null && givesAway(reply, makeQuestion(press.value.topic, press.value.seed))) {
    return json({ problem: 'math.helper.gaveAway' }, 502);
  }
  // A reply the limit cut off says so, rather than ending mid-sentence as if it were whole.
  return json({ reply: answer.finishReason === 'length' && !reply.endsWith('…') ? clipped(`${reply}…`, HELPER_LIMITS.reply) : reply });
}

export const OPTIONS = refusePreflight;
