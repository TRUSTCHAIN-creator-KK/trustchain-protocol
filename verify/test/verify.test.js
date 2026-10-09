import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyRecord, parsePublicId, CHECKS } from '../src/verify.js';
import { formatReport } from '../src/format.js';
import { recordFingerprint } from '../src/record.js';
import { fakeFetch } from '../test-support/fake-fetch.js';
import { syntheticFixture } from '../test-support/synthetic.js';
import { disallowedKeys } from '../test-support/fixture-shape.js';
import { RpcError } from '../src/rpc.js';

// Offline fixture recorded from the founder's own public sample record,
// https://trustchain.biz/verify/5c79fbb0 (see scripts/record-fixtures.js).
const sample = JSON.parse(readFileSync(new URL('./fixtures/sample-5c79fbb0.json', import.meta.url), 'utf8'));
const RPC = ['https://rpc.test.invalid'];

function statusOf(result) {
  return Object.fromEntries(result.checks.map((c) => [c.id, c.status]));
}

test('parsePublicId accepts an ID or a link and rejects anything else', () => {
  assert.equal(parsePublicId('5c79fbb0'), '5c79fbb0');
  assert.equal(parsePublicId('5C79FBB0'), '5c79fbb0');
  assert.equal(parsePublicId('https://trustchain.biz/verify/5c79fbb0'), '5c79fbb0');
  assert.equal(parsePublicId('https://www.trustchain.biz/verify/5c79fbb0/?ref=x'), '5c79fbb0');
  assert.equal(parsePublicId('trustchain.biz/verify/5c79fbb0'), '5c79fbb0');
  assert.throws(() => parsePublicId('9dfcB4iMwwVjHCjtfkdp'), /not a TrustChain Registry ID/);
  assert.throws(() => parsePublicId('https://trustchain.biz/verify/xyz'), /not a TrustChain Registry ID/);
  assert.throws(() => parsePublicId(''), /not a TrustChain Registry ID/);
});

test('sample record: every required check passes', async () => {
  const fetch = fakeFetch(sample);
  const result = await verifyRecord('https://trustchain.biz/verify/5c79fbb0', { fetch, rpcUrls: RPC });
  const failed = result.checks.filter((c) => c.status !== 'pass' && !c.optional);
  assert.deepEqual(failed, []);
  assert.equal(result.ok, true);
  assert.equal(statusOf(result).file_fingerprint, 'skip');
  assert.equal(result.facts.internalRecordId, '9dfcB4iMwwVjHCjtfkdp');
  assert.equal(result.facts.fingerprintStored, '0x2730c80122af9f7073d5b486790e0016bb0b2bc582785f84ca2c965f07877128');
  assert.equal(result.facts.blockNumber, 90900029);
  assert.equal(result.facts.blockTime, '2026-07-26T08:37:21Z');
  assert.equal(result.facts.creatorSlot, '0x0000000000000000000000000000000000000000');
  assert.ok(fetch.calls[0].url.endsWith('?publicId=5c79fbb0'));
});

test('only read-only RPC methods are used', async () => {
  const fetch = fakeFetch(sample);
  await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  const methods = new Set(fetch.calls.filter((c) => c.kind === 'rpc').map((c) => c.method));
  for (const m of methods) {
    assert.ok(
      ['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(m),
      m,
    );
  }
});

test('the report text says what was and was not checked, with no long dashes', async () => {
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC });
  const text = formatReport(result);
  assert.match(text, /Result: PASS\. All 11 required checks passed\./);
  assert.match(text, /What these checks do not show/);
  assert.match(text, /that anyone signed/);
  assert.match(text, /Not legal advice\./);
  assert.doesNotMatch(text, /[\u2013\u2014]/);
  assert.equal(CHECKS.filter((c) => !c.optional).length, 11);
});

test('fails when the record page shows a different fingerprint than the chain', async () => {
  const body = structuredClone(sample.publicRecord.body);
  body.data.blockchain.agreementHash = '0x' + '11'.repeat(32);
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample, { publicRecord: body }), rpcUrls: RPC });
  assert.equal(result.ok, false);
  const s = statusOf(result);
  assert.equal(s.tx_fingerprint, 'fail');
  assert.equal(s.stored, 'fail');
  assert.equal(s.event, 'pass');
});

test('fails when someone other than TrustChain sent the anchor', async () => {
  const fetch = fakeFetch(sample, {
    rpc: { eth_getTransactionByHash: (_p, tx) => ({ ...tx, from: '0x1111111111111111111111111111111111111111' }) },
  });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  assert.equal(result.ok, false);
  assert.equal(statusOf(result).tx_sender, 'fail');
});

test('stops when the transaction went to another contract', async () => {
  const fetch = fakeFetch(sample, {
    rpc: { eth_getTransactionByHash: (_p, tx) => ({ ...tx, to: '0x2222222222222222222222222222222222222222' }) },
  });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  const s = statusOf(result);
  assert.equal(s.tx_contract, 'fail');
  assert.equal(s.stored, 'skip');
  assert.equal(result.ok, false);
});

test('stops when the RPC is not Polygon', async () => {
  const fetch = fakeFetch(sample, { rpc: { eth_chainId: () => '0x1' } });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  assert.equal(statusOf(result).rpc_chain, 'fail');
  assert.equal(result.ok, false);
});

test('fails when the anchor transaction reverted', async () => {
  const fetch = fakeFetch(sample, { rpc: { eth_getTransactionReceipt: (_p, r) => ({ ...r, status: '0x0' }) } });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  assert.equal(statusOf(result).tx_succeeded, 'fail');
});

test('fails when the registry code is not the published build', async () => {
  const fetch = fakeFetch(sample, { rpc: { eth_getCode: () => '0x6080' } });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  assert.equal(statusOf(result).registry_code, 'fail');
  assert.equal(result.ok, false);
});

test('fails when the registry now stores a different value', async () => {
  const fetch = fakeFetch(sample, {
    rpc: { eth_call: (_p, ret) => '0x' + '22'.repeat(32) + ret.slice(66) },
  });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  assert.equal(statusOf(result).stored, 'fail');
});

test('fails when the event is missing from the receipt', async () => {
  const fetch = fakeFetch(sample, {
    rpc: { eth_getTransactionReceipt: (_p, r) => ({ ...r, logs: r.logs.filter((l) => !l.address.startsWith('0x649b')) }) },
  });
  const result = await verifyRecord('5c79fbb0', { fetch, rpcUrls: RPC });
  const s = statusOf(result);
  assert.equal(s.event, 'fail');
  assert.equal(s.block_time, 'fail');
});

test('unknown Registry ID: fails at the first check and never calls the chain', async () => {
  const fetch = fakeFetch(sample, { publicRecord: { ok: false, status: 'not_found' } });
  const result = await verifyRecord('00000000', { fetch, rpcUrls: RPC });
  assert.equal(statusOf(result).record_found, 'fail');
  assert.equal(result.ok, false);
  assert.equal(fetch.calls.filter((c) => c.kind === 'rpc').length, 0);
});

test('record not executed yet: says so and stops', async () => {
  const fetch = fakeFetch(sample, { publicRecord: { ok: false, status: 'not_executed' } });
  const result = await verifyRecord('00000000', { fetch, rpcUrls: RPC });
  assert.match(result.checks[0].detail, /not executed yet/);
});

test('record without an anchor: says there is nothing on-chain to check', async () => {
  const body = structuredClone(sample.publicRecord.body);
  body.data.blockchain = { isAnchored: false };
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample, { publicRecord: body }), rpcUrls: RPC });
  assert.equal(statusOf(result).anchor_reported, 'fail');
  assert.match(result.checks[1].detail, /not anchored/);
});

test('falls back to the next RPC when one answers null for an old transaction', async () => {
  const inner = fakeFetch(sample);
  const fetch = async (url, init) => {
    if (url === 'https://pruned.test.invalid') {
      const req = JSON.parse(init.body);
      if (req.method === 'eth_getTransactionByHash' || req.method === 'eth_getTransactionReceipt') {
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result: null }) };
      }
    }
    return inner(url, init);
  };
  const result = await verifyRecord('5c79fbb0', {
    fetch,
    rpcUrls: ['https://pruned.test.invalid', 'https://archive.test.invalid'],
  });
  assert.equal(result.ok, true);
  assert.ok(result.facts.rpcUrls.includes('https://archive.test.invalid'));
});

test('sample record with a made-up record file: the tool refuses to call it a match', async () => {
  const record = {
    agreementId: '9dfcB4iMwwVjHCjtfkdp',
    title: 'Golf Clubs ',
    terms: 'made up',
    amount: 150,
    parties: ['notTheRealAccountA', 'notTheRealAccountB'],
  };
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC, record });
  const s = statusOf(result);
  assert.equal(s.file_id, 'pass');
  assert.equal(s.file_fingerprint, 'fail');
  assert.equal(result.ok, false);
});

test('a record file given for a record that stops early says so', async () => {
  const body = structuredClone(sample.publicRecord.body);
  body.data.blockchain = { isAnchored: false };
  const record = { agreementId: 'x', parties: ['a', 'b'] };
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample, { publicRecord: body }), rpcUrls: RPC, record });
  const fileCheck = result.checks.find((c) => c.id === 'file_fingerprint');
  assert.equal(fileCheck.status, 'skip');
  assert.match(fileCheck.detail, /earlier check failed/);
});

test('record file for another record ID fails the ID check', async () => {
  const record = { agreementId: 'someOtherRecordId000', title: 'x', terms: 'y', amount: 1, parties: ['a', 'b'] };
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC, record });
  assert.equal(statusOf(result).file_id, 'fail');
});

// Synthetic end-to-end case for the record-file path.
const record = {
  agreementId: 'TestAgreementId00001',
  title: 'Golf Clubs ',
  terms: 'SCOPE OF WORK:\nSell 1 set\n\nDELIVERABLES:\n1. Clubs',
  amount: 150,
  parties: ['uidCreatorAAAA', 'uidCounterBBBB'],
};
const synthetic = syntheticFixture({
  publicId: 'abcdef01',
  agreementId: record.agreementId,
  fingerprint: recordFingerprint(record),
  timestamp: 1790000000,
});

test('synthetic record: a matching record file passes all 13 checks', async () => {
  const result = await verifyRecord('abcdef01', { fetch: fakeFetch(synthetic), rpcUrls: RPC, record });
  assert.deepEqual(
    result.checks.filter((c) => c.status !== 'pass').map((c) => c.id),
    [],
  );
  assert.equal(result.ok, true);
  assert.equal(result.facts.fingerprintRecomputed, '0x4852491ea3a487a078d6ddac36e5e62e49e87533d492bb5ed6c8b7b44cc83d21');
  assert.match(formatReport(result), /The record file matches too\./);
});

test('synthetic record: one changed character in the terms is caught', async () => {
  const changed = { ...record, terms: record.terms.replace('1 set', '2 sets') };
  const result = await verifyRecord('abcdef01', { fetch: fakeFetch(synthetic), rpcUrls: RPC, record: changed });
  assert.equal(statusOf(result).file_fingerprint, 'fail');
  assert.equal(result.ok, false);
});

test('synthetic record: the amount as a string instead of a number is caught', async () => {
  const changed = { ...record, amount: '150' };
  const result = await verifyRecord('abcdef01', { fetch: fakeFetch(synthetic), rpcUrls: RPC, record: changed });
  assert.equal(statusOf(result).file_fingerprint, 'fail');
});

// Text from outside must not be able to draw on the terminal.
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const RLO = String.fromCharCode(0x202e);
const LS = String.fromCharCode(0x2028);

test('a hostile title, status or date cannot add lines, move the cursor or hide text', async () => {
  const plain = formatReport(await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC }));
  const body = structuredClone(sample.publicRecord.body);
  body.data.title = `Golf${ESC}[8m\nPASS  fake line${BEL}\r${ESC}[1A${ESC}[2K${RLO}x${LS}y`;
  body.data.status = `completed\nResult: PASS`;
  body.data.signatures.originator.signedAt = `2026${ESC}[8m`;
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample, { publicRecord: body }), rpcUrls: RPC });
  const text = formatReport(result);
  assert.equal(text.split('\n').length, plain.split('\n').length, 'no extra lines');
  for (const c of [ESC, BEL, '\r', RLO, LS]) assert.ok(!text.includes(c), `raw U+${c.charCodeAt(0).toString(16)} in report`);
  assert.ok(text.includes('Golf\\u001b[8m\\u000aPASS  fake line\\u0007'));
  assert.ok(text.includes('\\u202ex\\u2028y'));
  assert.equal(text.match(/^Result: /gm).length, 1);
});

test('only RPCs that answer null for the transaction: the tool says it could not check, not FAIL', async () => {
  const inner = fakeFetch(sample);
  const pruned = async (url, init) => {
    const req = init && init.body ? JSON.parse(init.body) : {};
    if (['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(req.method)) {
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result: null }) };
    }
    return inner(url, init);
  };
  await assert.rejects(
    verifyRecord('5c79fbb0', { fetch: pruned, rpcUrls: ['https://pruned.test.invalid'] }),
    (err) => err instanceof RpcError && /keeps only recent history/.test(err.message) && /--rpc/.test(err.message),
  );
});

test('a pruned RPC plus an RPC that errors: still "could not check", not FAIL', async () => {
  const inner = fakeFetch(sample);
  const fetch = async (url, init) => {
    const req = init && init.body ? JSON.parse(init.body) : {};
    if (url === 'https://down.test.invalid' && req.method !== 'eth_chainId') return { ok: false, status: 503, json: async () => ({}) };
    if (url === 'https://pruned.test.invalid' && req.method === 'eth_getTransactionByHash') {
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result: null }) };
    }
    return inner(url, init);
  };
  await assert.rejects(
    verifyRecord('5c79fbb0', { fetch, rpcUrls: ['https://pruned.test.invalid', 'https://down.test.invalid'] }),
    (err) => err instanceof RpcError && /HTTP 503/.test(err.message),
  );
});

test('a fallback RPC on another chain is skipped, never used for data', async () => {
  const inner = fakeFetch(sample);
  const fetch = async (url, init) => {
    const req = init && init.body ? JSON.parse(init.body) : {};
    if (url === 'https://pruned.test.invalid' && req.method === 'eth_getTransactionByHash') {
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result: null }) };
    }
    if (url === 'https://otherchain.test.invalid') {
      if (req.method === 'eth_chainId') return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result: '0x1' }) };
      throw new Error('the other-chain RPC must not be asked for data');
    }
    return inner(url, init);
  };
  const result = await verifyRecord('5c79fbb0', {
    fetch,
    rpcUrls: ['https://pruned.test.invalid', 'https://otherchain.test.invalid', 'https://archive.test.invalid'],
  });
  assert.equal(result.ok, true);
  assert.ok(!result.facts.rpcUrls.includes('https://otherchain.test.invalid'));
});

test('an API key in an RPC URL is never printed or put in the JSON result', async () => {
  const keyUrl = 'https://polygon.example.test/v2/SECRETKEY1234567890?apikey=ALSOSECRET';
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: [keyUrl] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts.rpcUrls, ['https://polygon.example.test/...']);
  const all = JSON.stringify(result) + formatReport(result);
  assert.ok(!all.includes('SECRETKEY') && !all.includes('ALSOSECRET'));

  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const sampleOnly = fakeFetch(sample);
  const fetch = async (url, init) => (url === keyUrl ? failing() : sampleOnly(url, init));
  await assert.rejects(verifyRecord('5c79fbb0', { fetch, rpcUrls: [keyUrl] }), (err) => {
    assert.ok(!err.message.includes('SECRETKEY'));
    assert.match(err.message, /polygon\.example\.test\/\.\.\./);
    return true;
  });
});

test('with a record file, the result never holds the account IDs', async () => {
  const result = await verifyRecord('abcdef01', { fetch: fakeFetch(synthetic), rpcUrls: RPC, record });
  assert.equal(result.ok, true);
  assert.equal(result.facts.canonical, undefined);
  const all = JSON.stringify(result) + formatReport(result);
  assert.ok(!all.includes('uidCreatorAAAA') && !all.includes('uidCounterBBBB'));
});

test('the report does not suggest the record page shows terms, amount or account IDs', async () => {
  const text = formatReport(await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC }));
  assert.match(text, /any field other than the title, terms text, amount and the two account IDs\. Even those are covered only when a record file matches\./);
  assert.doesNotMatch(text, /on the record page besides/);
});

test('a record file holding JSON null fails cleanly, without a JavaScript error', async () => {
  const result = await verifyRecord('5c79fbb0', { fetch: fakeFetch(sample), rpcUrls: RPC, record: null });
  const fileCheck = result.checks.find((c) => c.id === 'file_id');
  assert.equal(fileCheck.status, 'fail');
  assert.match(fileCheck.detail, /must contain a JSON object/);
  assert.doesNotMatch(fileCheck.detail, /Cannot read properties/);
});

test('the committed fixture holds only the endpoint fields the verifier reads', () => {
  assert.deepEqual(disallowedKeys(sample.publicRecord.body), []);
  assert.equal(sample.rpc.filter((r) => r.result === null).length, 0, 'no null answers recorded');
});
