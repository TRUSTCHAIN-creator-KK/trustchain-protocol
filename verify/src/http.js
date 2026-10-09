// Reads a JSON response body with a size limit, so a hostile or broken server
// cannot make the tool use up memory by sending a huge answer.

/** The largest answer the tool reads: 5 MB. Real answers are a few kilobytes. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function tooLarge(maxBytes) {
  return new Error(`The answer is larger than ${maxBytes} bytes, so it was not read`);
}

/**
 * @param {Response | {json: () => Promise<unknown>}} res a fetch Response, or a
 *   test double that only has json()
 * @param {number} [maxBytes]
 * @returns {Promise<unknown>}
 */
export async function readJson(res, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel?.().catch(() => {});
    throw tooLarge(maxBytes);
  }

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  if (typeof res.text === 'function') {
    const text = await res.text();
    if (text.length > maxBytes) throw tooLarge(maxBytes);
    return JSON.parse(text);
  }

  // Test doubles in this repository only provide json().
  return res.json();
}
