import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, keccak256Bytes } from '../src/keccak.js';
import { SELECTOR_ANCHOR, SELECTOR_GET_PROOF, TOPIC_ANCHORED } from '../src/constants.js';

test('known Keccak-256 vectors (Ethereum padding, not NIST SHA3)', () => {
  assert.equal(keccak256(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccak256('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  // NIST SHA3-256('') is a7ffc6f8...; make sure we are not computing that.
  assert.notEqual(keccak256(''), '0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
});

test('inputs around and past the 136-byte block size', () => {
  // Cross-checked against ethers v6 keccak256 when this test was written.
  assert.equal(keccak256('a'.repeat(200)), '0x96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d');
  for (const n of [135, 136, 137, 272]) {
    assert.equal(keccak256Bytes('a'.repeat(n)).length, 32);
  }
  assert.notEqual(keccak256('a'.repeat(135)), keccak256('a'.repeat(136)));
});

test('strings are hashed as UTF-8 and match the equivalent bytes', () => {
  const text = 'Привет \u2028 é';
  assert.equal(keccak256(text), keccak256(new TextEncoder().encode(text)));
});

test('registry selectors and event topic come out right', () => {
  assert.equal(keccak256('anchor(string,bytes32,address,address)').slice(0, 10), SELECTOR_ANCHOR);
  assert.equal(keccak256('getProof(string)').slice(0, 10), SELECTOR_GET_PROOF);
  assert.equal(keccak256('Anchored(bytes32,string,bytes32,address,uint48)'), TOPIC_ANCHORED);
});

test('storage key of the sample record equals the event topic seen on-chain', () => {
  assert.equal(
    keccak256('9dfcB4iMwwVjHCjtfkdp'),
    '0xf35c0a5edab4ed331a1feb2c8a8157eda033a0dfc20f6055e79659bd82c44cab',
  );
});

test('rejects input that is not a string or bytes', () => {
  assert.throws(() => keccak256Bytes(42), TypeError);
});
