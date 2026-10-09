import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecord } from '../src/verify.js';

// Opt-in: runs against the live public endpoint and public Polygon RPCs.
// Read-only. Enable with TRUSTCHAIN_LIVE=1 (npm run test:live).
// Set TRUSTCHAIN_RPC to use your own RPC URL.
const live = process.env.TRUSTCHAIN_LIVE === '1';

test('live: the founder sample record 5c79fbb0 passes every required check', { skip: !live && 'set TRUSTCHAIN_LIVE=1 to run' }, async () => {
  const rpcUrls = process.env.TRUSTCHAIN_RPC ? [process.env.TRUSTCHAIN_RPC] : undefined;
  const result = await verifyRecord('https://trustchain.biz/verify/5c79fbb0', { rpcUrls, timeoutMs: 30000 });
  const notPassed = result.checks.filter((c) => !c.optional && c.status !== 'pass');
  assert.deepEqual(notPassed, []);
  assert.equal(result.facts.internalRecordId, '9dfcB4iMwwVjHCjtfkdp');
  assert.equal(result.facts.fingerprintStored, '0x2730c80122af9f7073d5b486790e0016bb0b2bc582785f84ca2c965f07877128');
  assert.equal(result.facts.blockTime, '2026-07-26T08:37:21Z');
});
