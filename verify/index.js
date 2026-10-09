// trustchain-verify: check a TrustChain record against the Polygon chain yourself.

export { verifyRecord, parsePublicId, CHECKS } from './src/verify.js';
export { formatReport } from './src/format.js';
export { canonicalRecordString, recordFingerprint } from './src/record.js';
export { keccak256, keccak256Bytes } from './src/keccak.js';
export {
  ANCHOR_WALLET,
  CHAIN_ID,
  DEFAULT_RPC_URLS,
  PUBLIC_RECORD_ENDPOINT,
  REGISTRY_ADDRESS,
  REGISTRY_CODE_HASH,
} from './src/constants.js';
