// Rebuilds the exact string TrustChain hashes when it anchors a record,
// and hashes it the same way.
//
// The anchored fingerprint is Keccak-256 over the UTF-8 bytes of
//
//   JSON.stringify({ id, title, terms, amount, parties: [creator, counterparty] })
//
// with the keys in exactly that order and no spaces. `id` is TrustChain's
// internal record ID (the string written on-chain), not the 8-character
// Registry ID from the public link. `parties` holds the two people's
// TrustChain account IDs, which are never public. That is why nobody can
// recompute the fingerprint from the agreement text alone.

import { keccak256 } from './keccak.js';

function pick(value) {
  // Same rule TrustChain applies: a missing or falsy value becomes "".
  // Note the type rules this implies for amount: 150 stays the number 150,
  // "150" stays a string (and hashes differently), and 0 becomes "".
  return value || '';
}

/**
 * Works out the two account IDs from either record shape.
 *
 * 1. Export shape: `parties` is an array `[creatorId, counterpartyId]`.
 * 2. TrustChain's stored shape: `creatorUid`, or `parties.originator.uid`,
 *    for the creator, and `parties.counterparty.uid` for the other side.
 */
function partyIds(record) {
  if (Array.isArray(record.parties)) {
    if (record.parties.length !== 2) throw new Error('parties must hold exactly two account IDs');
    return [pick(record.parties[0]), pick(record.parties[1])];
  }
  const p = record.parties && typeof record.parties === 'object' ? record.parties : {};
  return [
    pick(record.creatorUid || (p.originator && p.originator.uid)),
    pick(p.counterparty && p.counterparty.uid),
  ];
}

/**
 * The internal record ID a record file says it belongs to.
 * @param {object} record
 */
export function recordId(record) {
  const id = record.agreementId ?? record.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('The record file needs "agreementId": TrustChain\'s internal record ID');
  }
  return id;
}

/**
 * The canonical string that gets hashed.
 * @param {object} record parsed JSON of an exported record
 * @returns {string}
 */
export function canonicalRecordString(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('The record file must contain a JSON object');
  }
  return JSON.stringify({
    id: recordId(record),
    title: pick(record.title),
    terms: pick(record.terms),
    amount: pick(record.amount),
    parties: partyIds(record),
  });
}

/**
 * The fingerprint TrustChain would anchor for this record.
 * @param {object} record
 * @returns {string} 0x-prefixed Keccak-256
 */
export function recordFingerprint(record) {
  return keccak256(canonicalRecordString(record));
}
