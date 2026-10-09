// Just enough Solidity ABI encoding and decoding for TrustChainRegistry.
// Every function here works on 0x-prefixed hex strings.

import { SELECTOR_ANCHOR, SELECTOR_GET_PROOF } from './constants.js';

const WORD = 32;

export function hexToBytes(hex) {
  if (typeof hex !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error(`Not a hex string: ${String(hex).slice(0, 20)}`);
  }
  return new Uint8Array(Buffer.from(hex.slice(2), 'hex'));
}

export function bytesToHex(bytes) {
  return '0x' + Buffer.from(bytes).toString('hex');
}

export function isHash(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function sameHex(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function word(bytes, index) {
  const start = index * WORD;
  if (start + WORD > bytes.length) throw new Error('ABI data is shorter than expected');
  return bytes.subarray(start, start + WORD);
}

function wordToBigInt(w) {
  return BigInt(bytesToHex(w));
}

function wordToSafeNumber(w) {
  const n = wordToBigInt(w);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ABI number is too large');
  return Number(n);
}

function wordToAddress(w) {
  for (let i = 0; i < 12; i++) {
    if (w[i] !== 0) throw new Error('ABI address word has non-zero high bytes');
  }
  return bytesToHex(w.subarray(12));
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Reads a dynamic `string` whose head word (at headIndex) holds its offset.
function readString(bytes, headIndex) {
  const offset = wordToSafeNumber(word(bytes, headIndex));
  if (offset % WORD !== 0) throw new Error('ABI string offset is not word aligned');
  const lengthIndex = offset / WORD;
  const length = wordToSafeNumber(word(bytes, lengthIndex));
  const start = offset + WORD;
  if (start + length > bytes.length) throw new Error('ABI string runs past the end of the data');
  return utf8.decode(bytes.subarray(start, start + length));
}

function padRight(bytes) {
  const size = Math.ceil(bytes.length / WORD) * WORD;
  const out = new Uint8Array(size);
  out.set(bytes);
  return out;
}

function uintWord(n) {
  const out = new Uint8Array(WORD);
  let v = BigInt(n);
  for (let i = WORD - 1; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** ABI-encodes a single `string` argument (head plus tail). */
function encodeStringArg(text) {
  const data = new TextEncoder().encode(text);
  return concat([uintWord(WORD), uintWord(data.length), padRight(data)]);
}

/** Calldata for getProof(string agreementId). */
export function encodeGetProof(agreementId) {
  return SELECTOR_GET_PROOF + bytesToHex(encodeStringArg(agreementId)).slice(2);
}

/**
 * Calldata for anchor(string, bytes32, address, address).
 * The verifier never sends this. Tests use it to build synthetic data.
 */
export function encodeAnchor(agreementId, documentHash, creator, counterparty) {
  const data = new TextEncoder().encode(agreementId);
  const head = concat([
    uintWord(4 * WORD),
    hexToBytes(documentHash),
    uintWord(BigInt(creator)),
    uintWord(BigInt(counterparty)),
  ]);
  const tail = concat([uintWord(data.length), padRight(data)]);
  return SELECTOR_ANCHOR + bytesToHex(concat([head, tail])).slice(2);
}

/**
 * Data field of the Anchored event: (string agreementId, bytes32 documentHash, uint48 anchoredAt).
 * Used by tests to build synthetic logs.
 */
export function encodeAnchoredData(agreementId, documentHash, anchoredAt) {
  const data = new TextEncoder().encode(agreementId);
  const head = concat([uintWord(3 * WORD), hexToBytes(documentHash), uintWord(anchoredAt)]);
  const tail = concat([uintWord(data.length), padRight(data)]);
  return bytesToHex(concat([head, tail]));
}

/** Return data of getProof. Used by tests. */
export function encodeGetProofResult(documentHash, creator, counterparty, anchoredAt) {
  return bytesToHex(
    concat([hexToBytes(documentHash), uintWord(BigInt(creator)), uintWord(BigInt(counterparty)), uintWord(anchoredAt)]),
  );
}

/** Decodes the input of an anchor() transaction. Throws if it is not one. */
export function decodeAnchorCalldata(input) {
  if (typeof input !== 'string' || !input.toLowerCase().startsWith(SELECTOR_ANCHOR)) {
    throw new Error('Transaction input is not an anchor(string,bytes32,address,address) call');
  }
  const bytes = hexToBytes('0x' + input.slice(10));
  return {
    agreementId: readString(bytes, 0),
    documentHash: bytesToHex(word(bytes, 1)),
    creator: wordToAddress(word(bytes, 2)),
    counterparty: wordToAddress(word(bytes, 3)),
  };
}

/** Decodes the data field of an Anchored event log. */
export function decodeAnchoredData(data) {
  const bytes = hexToBytes(data);
  return {
    agreementId: readString(bytes, 0),
    documentHash: bytesToHex(word(bytes, 1)),
    anchoredAt: wordToSafeNumber(word(bytes, 2)),
  };
}

/** Decodes the return value of getProof(string). */
export function decodeGetProofResult(data) {
  const bytes = hexToBytes(data);
  return {
    documentHash: bytesToHex(word(bytes, 0)),
    creator: wordToAddress(word(bytes, 1)),
    counterparty: wordToAddress(word(bytes, 2)),
    anchoredAt: wordToSafeNumber(word(bytes, 3)),
  };
}

/** Last 20 bytes of an indexed address topic. */
export function topicToAddress(topic) {
  return wordToAddress(hexToBytes(topic));
}
