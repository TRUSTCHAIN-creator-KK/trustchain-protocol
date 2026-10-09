// What a recorded fixture may hold from TrustChain's public record endpoint.
// Only the fields the verifier reads are kept. The fixture recorder applies
// this, and a test checks the committed fixture against it, so no other field
// from a real record can end up in this public repository.

const ALLOWED = {
  body: ['ok', 'status', 'data'],
  data: ['status', 'title', 'publicId', 'blockchain', 'signatures'],
  blockchain: ['isAnchored', 'agreementHash', 'transactionHash', 'chainId', 'anchoredAt'],
  signatureSides: ['originator', 'counterparty'],
  signature: ['signed', 'signedAt'],
};

function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/** Returns a copy of an endpoint answer with only the allowed fields. */
export function trimPublicRecord(body) {
  const out = pick(body, ALLOWED.body);
  if (out.data && typeof out.data === 'object') {
    const data = pick(out.data, ALLOWED.data);
    if (data.blockchain) data.blockchain = pick(data.blockchain, ALLOWED.blockchain);
    if (data.signatures) {
      const sides = pick(data.signatures, ALLOWED.signatureSides);
      for (const side of Object.keys(sides)) sides[side] = pick(sides[side], ALLOWED.signature);
      data.signatures = sides;
    }
    out.data = data;
  }
  return out;
}

/** Lists every key in an endpoint answer that is not allowed. */
export function disallowedKeys(body) {
  const problems = [];
  const check = (obj, keys, where) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) if (!keys.includes(key)) problems.push(`${where}.${key}`);
  };
  check(body, ALLOWED.body, 'body');
  const data = body && body.data;
  check(data, ALLOWED.data, 'data');
  if (data) {
    check(data.blockchain, ALLOWED.blockchain, 'data.blockchain');
    check(data.signatures, ALLOWED.signatureSides, 'data.signatures');
    for (const side of ALLOWED.signatureSides) {
      check(data.signatures && data.signatures[side], ALLOWED.signature, `data.signatures.${side}`);
    }
  }
  return problems;
}
