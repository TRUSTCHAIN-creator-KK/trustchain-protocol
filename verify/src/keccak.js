// Keccak-256 as used by Ethereum and Polygon.
//
// This is the original Keccak padding (0x01 ... 0x80), not NIST SHA3-256
// (0x06 ... 0x80). The two give different results for the same input.
//
// Written for reading, not for speed. Lanes are 64-bit BigInt values.
// The inputs this tool hashes are a few kilobytes at most.

const MASK = (1n << 64n) - 1n;
const RATE = 136; // bytes absorbed per block for a 256-bit output

// Round constants for Keccak-f[1600].
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets, indexed by x + 5 * y.
const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
].map(BigInt);

function rotl(value, n) {
  if (n === 0n) return value;
  return ((value << n) | (value >> (64n - n))) & MASK;
}

function keccakF(state) {
  const c = new Array(5);
  const b = new Array(25);
  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1n);
      for (let y = 0; y < 25; y += 5) state[x + y] ^= d;
    }
    // rho and pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROT[x + 5 * y]);
      }
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        state[x + y] = b[x + y] ^ ((b[((x + 1) % 5) + y] ^ MASK) & b[((x + 2) % 5) + y]);
      }
    }
    // iota
    state[0] ^= RC[round];
  }
}

/**
 * Keccak-256 of a byte array or a string (strings are hashed as UTF-8).
 * @param {Uint8Array|string} input
 * @returns {Uint8Array} 32 bytes
 */
export function keccak256Bytes(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (!(data instanceof Uint8Array)) throw new TypeError('keccak256 expects a string or Uint8Array');

  // Pad: append 0x01, fill with zeros, set the top bit of the last byte.
  const padLen = RATE - (data.length % RATE);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(padded[offset + i * 8 + j]);
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

/**
 * Keccak-256 as a 0x-prefixed lowercase hex string.
 * @param {Uint8Array|string} input
 * @returns {string}
 */
export function keccak256(input) {
  return '0x' + Buffer.from(keccak256Bytes(input)).toString('hex');
}
