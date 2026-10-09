import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeAnchorCalldata,
  decodeAnchoredData,
  decodeGetProofResult,
  encodeAnchor,
  encodeAnchoredData,
  encodeGetProof,
  encodeGetProofResult,
  topicToAddress,
} from '../src/abi.js';
import { REGISTRY_ADDRESS, TOPIC_ANCHORED, ZERO_ADDRESS } from '../src/constants.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-5c79fbb0.json', import.meta.url), 'utf8'));
const rpc = (method) => fixture.rpc.find((r) => r.method === method).result;

const SAMPLE_ID = '9dfcB4iMwwVjHCjtfkdp';
const SAMPLE_HASH = '0x2730c80122af9f7073d5b486790e0016bb0b2bc582785f84ca2c965f07877128';

test('decodes the real anchor() call of the sample record', () => {
  const call = decodeAnchorCalldata(rpc('eth_getTransactionByHash').input);
  assert.deepEqual(call, {
    agreementId: SAMPLE_ID,
    documentHash: SAMPLE_HASH,
    creator: ZERO_ADDRESS,
    counterparty: ZERO_ADDRESS,
  });
});

test('re-encoding the decoded call gives the same calldata', () => {
  const input = rpc('eth_getTransactionByHash').input;
  assert.equal(encodeAnchor(SAMPLE_ID, SAMPLE_HASH, ZERO_ADDRESS, ZERO_ADDRESS), input);
});

test('decodes the real Anchored event of the sample record', () => {
  const log = rpc('eth_getTransactionReceipt').logs.find(
    (l) => l.address.toLowerCase() === REGISTRY_ADDRESS.toLowerCase() && l.topics[0] === TOPIC_ANCHORED,
  );
  const event = decodeAnchoredData(log.data);
  assert.equal(event.agreementId, SAMPLE_ID);
  assert.equal(event.documentHash, SAMPLE_HASH);
  assert.equal(event.anchoredAt, 1785055041);
  assert.equal(topicToAddress(log.topics[2]), ZERO_ADDRESS);
  assert.equal(encodeAnchoredData(SAMPLE_ID, SAMPLE_HASH, 1785055041), log.data);
});

test('getProof calldata matches what was sent to the chain', () => {
  const recorded = fixture.rpc.find((r) => r.method === 'eth_call').params[0].data;
  assert.equal(encodeGetProof(SAMPLE_ID), recorded);
});

test('decodes the real getProof return value', () => {
  const proof = decodeGetProofResult(rpc('eth_call'));
  assert.deepEqual(proof, {
    documentHash: SAMPLE_HASH,
    creator: ZERO_ADDRESS,
    counterparty: ZERO_ADDRESS,
    anchoredAt: 1785055041,
  });
  assert.equal(encodeGetProofResult(SAMPLE_HASH, ZERO_ADDRESS, ZERO_ADDRESS, 1785055041), rpc('eth_call'));
});

test('round-trips a non-ASCII record ID', () => {
  const id = 'ID-Привет-é';
  const call = decodeAnchorCalldata(encodeAnchor(id, SAMPLE_HASH, ZERO_ADDRESS, ZERO_ADDRESS));
  assert.equal(call.agreementId, id);
});

test('refuses calldata that is not an anchor() call', () => {
  assert.throws(() => decodeAnchorCalldata('0xa9059cbb' + '00'.repeat(64)), /not an anchor/);
});

test('refuses truncated data', () => {
  const input = rpc('eth_getTransactionByHash').input;
  assert.throws(() => decodeAnchorCalldata(input.slice(0, 200)), /shorter|past the end/);
  assert.throws(() => decodeGetProofResult('0x1234'), /shorter/);
});
