// Read-only JSON-RPC client. It only ever calls methods that read chain data.
//
// Several URLs are fallbacks, not a cross-check: the first endpoint that gives
// a usable answer is used. When `chainId` is given, the client asks each
// endpoint for its chain ID before it uses that endpoint for anything else, and
// skips an endpoint that reports another chain.

import { readJson } from './http.js';
import { redactUrl } from './text.js';

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
 * @param {{ fetch?: typeof fetch, timeoutMs?: number, chainId?: number }} [options]
 */
export function createRpcClient(urls, options = {}) {
  const doFetch = options.fetch || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  const expectedChainId = options.chainId;
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('At least one RPC URL is needed');
  if (typeof doFetch !== 'function') throw new Error('No fetch available. Use Node.js 18 or newer.');
  let nextId = 1;
  let lastUsedUrl = null;
  const usedUrls = new Set();
  // url -> chain ID that endpoint reported, or an Error if it could not say.
  const chainOf = new Map();

  async function send(url, method, params) {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await readJson(res);
    if (!body || typeof body !== 'object') throw new Error('The answer is not a JSON-RPC response');
    if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
    if (!('result' in body)) throw new Error('No result in response');
    return body.result;
  }

  // Makes sure an endpoint is on the expected chain before it is used for data.
  async function checkChain(url) {
    if (expectedChainId === undefined) return;
    if (!chainOf.has(url)) {
      try {
        chainOf.set(url, Number.parseInt(await send(url, 'eth_chainId', []), 16));
      } catch (err) {
        chainOf.set(url, err);
      }
    }
    const chain = chainOf.get(url);
    if (chain instanceof Error) throw new Error(`could not read its chain ID (${chain.message})`);
    if (chain !== expectedChainId) throw new Error(`it reports chain ID ${chain}, not ${expectedChainId}, so it was not used`);
  }

  async function call(method, params) {
    if (!READ_ONLY_METHODS.has(method)) throw new Error(`Refusing non read-only RPC method ${method}`);
    const failures = [];
    let nullCount = 0;
    for (const url of urls) {
      try {
        let result;
        if (method === 'eth_chainId') {
          result = await send(url, method, params);
          chainOf.set(url, Number.parseInt(result, 16));
        } else {
          await checkChain(url);
          result = await send(url, method, params);
        }
        if (result === null && NULL_MEANS_TRY_NEXT.has(method)) {
          nullCount++;
          failures.push(`${redactUrl(url)}: no result (null)`);
          continue;
        }
        lastUsedUrl = url;
        usedUrls.add(url);
        return result;
      } catch (err) {
        failures.push(`${redactUrl(url)}: ${err.message}`);
      }
    }
    if (nullCount > 0) {
      // Every endpoint answered null or failed. A node that keeps only recent
      // history answers null for an old transaction, so this is not proof that
      // the transaction does not exist. Report it as "could not check".
      throw new RpcError(
        `No RPC endpoint returned a result for ${method}. A node that keeps only recent history answers null for an` +
          ` old transaction, so this does not show that the transaction is missing. Try an RPC that keeps full history` +
          ` with --rpc <url>. Answers: ${failures.join('; ')}`,
      );
    }
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
