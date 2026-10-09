// Records the offline test fixture from the live public sample record.
// Read-only: one GET to TrustChain's public record endpoint and a few
// read-only Polygon RPC calls. Run from the verify folder:
//
//   node scripts/record-fixtures.js [registry-id]
//
// The default is 5c79fbb0, the founder's own sample record.

import { writeFileSync } from 'node:fs';
import { PUBLIC_RECORD_ENDPOINT } from '../src/constants.js';
import { verifyRecord } from '../src/verify.js';

const publicId = process.argv[2] || '5c79fbb0';
const fixture = { publicId, recordedAt: new Date().toISOString(), publicRecord: null, rpc: [] };

async function recordingFetch(url, init = {}) {
  const res = await fetch(url, init);
  const body = await res.json();
  if (String(url).startsWith(PUBLIC_RECORD_ENDPOINT)) {
    fixture.publicRecord = { url: String(url), body };
  } else {
    const req = JSON.parse(init.body);
    let result = body.result;
    // Keep only the block fields the verifier reads, so the fixture stays small.
    if (req.method === 'eth_getBlockByNumber' && result) {
      result = { number: result.number, hash: result.hash, timestamp: result.timestamp };
    }
    fixture.rpc.push({ method: req.method, params: req.params, result });
  }
  return { ok: res.ok, status: res.status, json: async () => body };
}

const result = await verifyRecord(publicId, { fetch: recordingFetch });
const out = new URL(`../test/fixtures/sample-${publicId}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log(`ok=${result.ok}. Wrote ${out.pathname}`);
