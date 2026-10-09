// Read-only JSON-RPC client. It only ever calls methods that read chain data.

const READ_ONLY_METHODS = new Set([
  'eth_chainId',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_call',
]);

// For these, a null result can mean "this node does not keep that history",
// so the client asks the next endpoint before accepting null.
const NULL_MEANS_TRY_NEXT = new Set(['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber']);

export class RpcError extends Error {}

/**
 * Creates a client that tries each RPC URL in order until one answers.
 * @param {string[]} urls
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createRpcClient(urls, options = {}) {
  const doFetch = options.fetch || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('At least one RPC URL is needed');
  if (typeof doFetch !== 'function') throw new Error('No fetch available. Use Node.js 18 or newer.');
  let nextId = 1;
  let lastUsedUrl = null;
  const usedUrls = new Set();

  async function call(method, params) {
    if (!READ_ONLY_METHODS.has(method)) throw new Error(`Refusing non read-only RPC method ${method}`);
    const failures = [];
    let sawNull = false;
    for (const url of urls) {
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
        if (!('result' in body)) throw new Error('No result in response');
        if (body.result === null && NULL_MEANS_TRY_NEXT.has(method)) {
          sawNull = true;
          continue;
        }
        lastUsedUrl = url;
        usedUrls.add(url);
        return body.result;
      } catch (err) {
        failures.push(`${url}: ${err.message}`);
      }
    }
    if (sawNull) return null;
    throw new RpcError(`${method} failed on every RPC endpoint. ${failures.join('; ')}`);
  }

  return {
    call,
    get lastUsedUrl() {
      return lastUsedUrl;
    },
    get usedUrls() {
      return [...usedUrls];
    },
  };
}
