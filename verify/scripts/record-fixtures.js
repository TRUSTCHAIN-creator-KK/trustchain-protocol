// Records the offline test fixture from the live public sample record.
// Read-only: one GET to TrustChain's public record endpoint and a few
// read-only Polygon RPC calls. Run from the verify folder:
//
//   node scripts/record-fixtures.js [--rpc <url>]
//
// It records the founder's own sample record, 5c79fbb0, and nothing else.
// A fixture is committed to a public repository, so recording someone else's
// record needs an explicit flag:
//
//   node scripts/record-fixtures.js <registry-id> --allow-other-record
//
// Only the endpoint fields the verifier reads are kept (see
// test-support/fixture-shape.js). Only RPC answers the verifier accepted are
// kept: a null from a node without old history, or an error, is not recorded.
// For the steadiest result, pass one RPC that keeps full history with --rpc.

import { writeFileSync } from 'node:fs';
import { PUBLIC_RECORD_ENDPOINT } from '../src/constants.js';
import { verifyRecord } from '../src/verify.js';
import { trimPublicRecord } from '../test-support/fixture-shape.js';

const SAMPLE_ID = '5c79fbb0';
const NULL_MEANS_TRY_NEXT = new Set(['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber']);

const args = process.argv.slice(2);
const allowOther = args.includes('--allow-other-record');
const rpcAt = args.indexOf('--rpc');
const rpcUrls = rpcAt > -1 ? [args[rpcAt + 1]] : undefined;
if (rpcAt > -1 && (!rpcUrls[0] || rpcUrls[0].startsWith('-'))) {
  console.error('--rpc needs a URL');
  process.exit(2);
}
const positional = args.filter((a, i) => !a.startsWith('--') && !(rpcAt > -1 && i === rpcAt + 1));
const publicId = positional[0] || SAMPLE_ID;
if (publicId !== SAMPLE_ID && !allowOther) {
  console.error(
    `Refusing to record ${publicId}. Fixtures go into a public repository, and only the founder's sample record` +
      ` ${SAMPLE_ID} is meant to be there. Pass --allow-other-record if you are sure.`,
  );
  process.exit(2);
}

const fixture = {
  publicId,
  recordedOn: new Date().toISOString().slice(0, 10),
  publicRecord: null,
  rpc: [],
};

async function recordingFetch(url, init = {}) {
  const res = await fetch(url, init);
  let body;
  try {
    body = await res.json();
  } catch {
    // Not JSON: hand the verifier something it treats as a failed endpoint.
    return { ok: false, status: res.status, json: async () => ({}) };
  }
  if (String(url).startsWith(PUBLIC_RECORD_ENDPOINT)) {
    fixture.publicRecord = { url: String(url), body: trimPublicRecord(body) };
  } else {
    const req = JSON.parse(init.body);
    const accepted =
      res.ok &&
      body &&
      !body.error &&
      'result' in body &&
      !(body.result === null && NULL_MEANS_TRY_NEXT.has(req.method));
    const already = fixture.rpc.some(
      (r) => r.method === req.method && JSON.stringify(r.params) === JSON.stringify(req.params),
    );
    if (accepted && !already) {
      let result = body.result;
      // Keep only the block fields the verifier reads, so the fixture stays small.
      if (req.method === 'eth_getBlockByNumber' && result) {
        result = { number: result.number, hash: result.hash, timestamp: result.timestamp };
      }
      fixture.rpc.push({ method: req.method, params: req.params, result });
    }
  }
  return { ok: res.ok, status: res.status, json: async () => body };
}

const result = await verifyRecord(publicId, { fetch: recordingFetch, rpcUrls });
if (!result.ok) {
  console.error('The live check did not pass, so no fixture was written.');
  process.exit(1);
}
const out = new URL(`../test/fixtures/sample-${publicId}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log(`ok=${result.ok}. Wrote ${out.pathname}`);
