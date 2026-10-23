/**
 * Reading a small JSON request without reading a large one.
 *
 * The game's addresses take a few short fields, so anything over 2 KB is refused
 * before it is parsed: first by the size the request declares, then by counting
 * what actually arrives, which stops reading as soon as the count passes the
 * limit.
 */

/** The largest request body the game's addresses read, in bytes. */
export const MAX_BODY_BYTES = 2048;

/**
 * The parsed body, or `undefined` when it is not sent as JSON, is too large, is
 * unreadable or does not parse.
 *
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
export async function readSmallJson(request) {
  // Only a JSON request. A page on another site can send a plain-text request
  // without asking first; a JSON one makes the browser ask, and this app never
  // says yes (no sharing header), so such a request never arrives.
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return undefined;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^[0-9]{1,9}$/u.test(declared.trim()) || Number(declared.trim()) > MAX_BODY_BYTES)) return undefined;
  if (request.body === null) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
