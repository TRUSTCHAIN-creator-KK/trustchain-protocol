// A fetch replacement that answers from a recorded fixture, so tests run offline.

import { PUBLIC_RECORD_ENDPOINT } from '../src/constants.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(JSON.stringify(body));
    },
  };
}

/**
 * @param {object} fixture { publicRecord: { body }, rpc: [{ method, params, result }] }
 * @param {object} [overrides] { publicRecord?: body, rpc?: { [method]: (params, recorded) => result } }
 */
export function fakeFetch(fixture, overrides = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    if (String(url).startsWith(PUBLIC_RECORD_ENDPOINT)) {
      calls.push({ kind: 'public', url: String(url) });
      return jsonResponse(overrides.publicRecord ?? fixture.publicRecord.body);
    }
    const req = JSON.parse(init.body);
    calls.push({ kind: 'rpc', url: String(url), method: req.method, params: req.params });
    const recorded = fixture.rpc.find(
      (r) => r.method === req.method && JSON.stringify(r.params) === JSON.stringify(req.params),
    );
    let result;
    if (overrides.rpc && overrides.rpc[req.method]) {
      result = overrides.rpc[req.method](req.params, recorded && recorded.result);
    } else if (recorded) {
      result = recorded.result;
    } else {
      return jsonResponse({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: `no fixture for ${req.method}` } });
    }
    return jsonResponse({ jsonrpc: '2.0', id: req.id, result: JSON.parse(JSON.stringify(result ?? null)) });
  };
  fetch.calls = calls;
  return fetch;
}
