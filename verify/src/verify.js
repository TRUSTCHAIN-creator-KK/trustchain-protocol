// Checks one TrustChain record against the Polygon chain.
//
// It only reads. It calls TrustChain's public record endpoint (the same one
// https://trustchain.biz/verify/<id> uses) and public Polygon RPC endpoints.
// Every check it makes is listed in the result, with what it compared.

import {
  ANCHOR_WALLET,
  CHAIN_ID,
  DEFAULT_RPC_URLS,
  PUBLIC_RECORD_ENDPOINT,
  REGISTRY_ADDRESS,
  REGISTRY_CODE_HASH,
  TOPIC_ANCHORED,
} from './constants.js';
import {
  decodeAnchorCalldata,
  decodeAnchoredData,
  decodeGetProofResult,
  encodeGetProof,
  hexToBytes,
  isHash,
  sameHex,
} from './abi.js';
import { keccak256 } from './keccak.js';
import { recordFingerprint, recordId } from './record.js';
import { readJson } from './http.js';
import { createRpcClient, RpcError } from './rpc.js';
import { redactUrl } from './text.js';

/** Every check, in the order it runs. Optional checks only run with a record file. */
export const CHECKS = [
  { id: 'record_found', label: "Public record found on TrustChain's public endpoint" },
  { id: 'anchor_reported', label: 'Record lists an anchor: a fingerprint and a Polygon transaction' },
  { id: 'rpc_chain', label: 'RPC answers for Polygon PoS mainnet (chain ID 137)' },
  { id: 'tx_succeeded', label: 'Anchor transaction exists on Polygon and succeeded' },
  { id: 'tx_contract', label: 'Transaction called the TrustChain registry contract' },
  { id: 'registry_code', label: 'Registry code on-chain matches the build of contracts/TrustChainRegistry.sol' },
  { id: 'tx_sender', label: "Transaction was sent by TrustChain's anchoring wallet" },
  { id: 'tx_fingerprint', label: 'Fingerprint in the transaction matches the fingerprint the record shows' },
  { id: 'event', label: 'Anchored event in the same transaction has the same record ID and fingerprint' },
  { id: 'block_time', label: 'Block time read from the chain matches the time in the event' },
  { id: 'stored', label: 'Registry still stores the fingerprint the record shows, under the same record ID' },
  { id: 'file_id', label: 'Record file is for the same internal record ID', optional: true },
  { id: 'file_fingerprint', label: 'Fingerprint recomputed from the record file matches the on-chain value', optional: true },
];

/**
 * Accepts a Registry ID ("5c79fbb0") or a link ("https://trustchain.biz/verify/5c79fbb0").
 * @returns {string} the 8-character Registry ID in lower case
 */
export function parsePublicId(input) {
  const text = String(input ?? '').trim();
  const fromLink = text.match(/\/verify\/([0-9a-fA-F]{8})(?:[/?#]|$)/);
  const candidate = fromLink ? fromLink[1] : text;
  if (!/^[0-9a-fA-F]{8}$/.test(candidate)) {
    throw new Error(
      `"${text}" is not a TrustChain Registry ID. Use the 8 characters after /verify/ in the record link, for example 5c79fbb0.`,
    );
  }
  return candidate.toLowerCase();
}

function short(hash) {
  return typeof hash === 'string' && hash.length > 20 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : String(hash);
}

function isoFromUnix(seconds) {
  return new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
}

function createReport(publicId, hasRecord) {
  const checks = CHECKS.map((c) => ({
    id: c.id,
    label: c.label,
    optional: Boolean(c.optional),
    status: 'skip',
    detail:
      c.optional && !hasRecord ? 'No record file given (--record).' : 'Not run because an earlier check failed.',
  }));
  const facts = { publicId };
  return {
    publicId,
    checks,
    facts,
    set(id, status, detail) {
      const check = checks.find((c) => c.id === id);
      check.status = status;
      check.detail = detail;
      return status === 'pass';
    },
  };
}

function finish(report) {
  if (report.rpc && report.rpc.usedUrls.length) report.facts.rpcUrls = report.rpc.usedUrls.map(redactUrl);
  const failed = report.checks.filter((c) => c.status === 'fail');
  const requiredSkipped = report.checks.filter((c) => !c.optional && c.status === 'skip');
  return {
    ok: failed.length === 0 && requiredSkipped.length === 0,
    publicId: report.publicId,
    checks: report.checks,
    facts: report.facts,
  };
}

async function getPublicRecord(publicId, endpoint, doFetch, timeoutMs) {
  const url = `${endpoint}?publicId=${encodeURIComponent(publicId)}`;
  let res;
  try {
    res = await doFetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(`Could not reach TrustChain's public record endpoint: ${err.message}`);
  }
  if (!res.ok) throw new Error(`TrustChain's public record endpoint answered HTTP ${res.status}`);
  try {
    return await readJson(res);
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error("TrustChain's public record endpoint did not return JSON");
    throw new Error(`Could not read the answer from TrustChain's public record endpoint: ${err.message}`);
  }
}

/**
 * Verifies one record.
 *
 * @param {string} input Registry ID or https://trustchain.biz/verify/<id> link
 * @param {object} [options]
 * @param {string[]} [options.rpcUrls] Polygon RPC URLs, tried in order
 * @param {object} [options.record] parsed record file, to recompute the fingerprint
 * @param {string} [options.endpoint] public record endpoint (for testing or mirrors)
 * @param {typeof fetch} [options.fetch] fetch implementation (for offline tests)
 * @param {number} [options.timeoutMs] per-request timeout
 * @returns {Promise<{ok: boolean, publicId: string, checks: object[], facts: object}>}
 */
export async function verifyRecord(input, options = {}) {
  const publicId = parsePublicId(input);
  const doFetch = options.fetch || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('No fetch available. Use Node.js 18 or newer.');
  const timeoutMs = options.timeoutMs ?? 20000;
  const rpc = createRpcClient(options.rpcUrls?.length ? options.rpcUrls : DEFAULT_RPC_URLS, {
    fetch: doFetch,
    timeoutMs,
    chainId: CHAIN_ID,
  });
  const report = createReport(publicId, options.record !== undefined);
  report.rpc = rpc;
  const facts = report.facts;

  // 1. The public record.
  const body = await getPublicRecord(publicId, options.endpoint || PUBLIC_RECORD_ENDPOINT, doFetch, timeoutMs);
  if (body && body.ok === true && body.status === 'found' && body.data) {
    const data = body.data;
    facts.recordStatus = data.status;
    if (typeof data.title === 'string') facts.title = data.title;
    if (data.signatures) facts.signaturesReportedByServer = data.signatures;
    report.set(
      'record_found',
      'pass',
      `Status "${data.status}". ${typeof data.title === 'string' ? `Title "${data.title}".` : 'Title not public.'}`,
    );
  } else if (body && body.status === 'not_found') {
    report.set('record_found', 'fail', 'No record has this Registry ID.');
    return finish(report);
  } else if (body && body.status === 'not_executed') {
    report.set(
      'record_found',
      'fail',
      'A record with this ID exists but is not executed yet. The public endpoint shares nothing about it until it is.',
    );
    return finish(report);
  } else {
    report.set('record_found', 'fail', `Unexpected answer from the endpoint: ${JSON.stringify(body).slice(0, 200)}`);
    return finish(report);
  }

  // 2. The anchor the record reports.
  const bc = body.data.blockchain || {};
  if (bc.isAnchored !== true || !isHash(bc.agreementHash) || !isHash(bc.transactionHash)) {
    report.set('anchor_reported', 'fail', 'The record is not anchored. There is nothing on Polygon to check.');
    return finish(report);
  }
  if (bc.chainId !== undefined && Number(bc.chainId) !== CHAIN_ID) {
    report.set('anchor_reported', 'fail', `The record says chain ${bc.chainId}. This tool checks Polygon PoS (137) only.`);
    return finish(report);
  }
  const shownHash = bc.agreementHash.toLowerCase();
  const txHash = bc.transactionHash.toLowerCase();
  facts.fingerprintShown = shownHash;
  facts.transactionHash = txHash;
  if (bc.anchoredAt) facts.serverAnchoredAt = bc.anchoredAt;
  report.set('anchor_reported', 'pass', `Fingerprint ${short(shownHash)}, transaction ${short(txHash)}.`);

  // 3. The RPC really is Polygon.
  const chainIdHex = await rpc.call('eth_chainId', []);
  if (Number.parseInt(chainIdHex, 16) !== CHAIN_ID) {
    report.set('rpc_chain', 'fail', `The RPC answered chain ID ${Number.parseInt(chainIdHex, 16)}.`);
    return finish(report);
  }
  report.set(
    'rpc_chain',
    'pass',
    `Chain ID 137 from ${redactUrl(rpc.lastUsedUrl)}. Any other RPC used below is asked for its chain ID first.`,
  );

  // 4. The transaction and its receipt.
  const tx = await rpc.call('eth_getTransactionByHash', [txHash]);
  const receipt = await rpc.call('eth_getTransactionReceipt', [txHash]);
  if (!tx || !receipt) {
    // The RPC client throws when every endpoint answers null, so this only
    // happens with a client that returns null directly.
    throw new RpcError(`No RPC endpoint returned transaction ${txHash} and its receipt.`);
  }
  const blockNumber = Number.parseInt(receipt.blockNumber, 16);
  facts.blockNumber = blockNumber;
  if (receipt.status !== '0x1') {
    report.set('tx_succeeded', 'fail', `The transaction failed on-chain (status ${receipt.status}).`);
    return finish(report);
  }
  report.set('tx_succeeded', 'pass', `Included in block ${blockNumber}, status success.`);

  // 5. It went to the registry.
  facts.contract = tx.to;
  if (!sameHex(tx.to, REGISTRY_ADDRESS)) {
    report.set('tx_contract', 'fail', `The transaction went to ${tx.to}, not the registry ${REGISTRY_ADDRESS}.`);
    return finish(report);
  }
  report.set('tx_contract', 'pass', `To ${REGISTRY_ADDRESS}.`);

  // 6. The registry runs the published code.
  const code = await rpc.call('eth_getCode', [REGISTRY_ADDRESS, 'latest']);
  const codeBytes = hexToBytes(code);
  const codeHash = keccak256(codeBytes);
  if (codeHash === REGISTRY_CODE_HASH) {
    report.set('registry_code', 'pass', `Code hash ${short(codeHash)} (${codeBytes.length} bytes).`);
  } else {
    report.set('registry_code', 'fail', `Code hash ${codeHash} is not the expected ${REGISTRY_CODE_HASH}.`);
  }

  // 7. TrustChain's wallet sent it.
  facts.sender = tx.from;
  if (sameHex(tx.from, ANCHOR_WALLET)) {
    report.set('tx_sender', 'pass', `From ${ANCHOR_WALLET}.`);
  } else {
    report.set(
      'tx_sender',
      'fail',
      `Sent by ${tx.from}. Anyone can write to the registry, and an entry from another wallet is not a TrustChain anchor.`,
    );
  }

  // 8. What the transaction wrote.
  let call;
  try {
    call = decodeAnchorCalldata(tx.input);
  } catch (err) {
    report.set('tx_fingerprint', 'fail', err.message);
    return finish(report);
  }
  const anchoredId = call.agreementId;
  const onchainHash = call.documentHash.toLowerCase();
  facts.internalRecordId = anchoredId;
  facts.fingerprintOnChain = onchainHash;
  if (sameHex(onchainHash, shownHash)) {
    report.set('tx_fingerprint', 'pass', `anchor("${anchoredId}", ${short(onchainHash)}, ...).`);
  } else {
    report.set('tx_fingerprint', 'fail', `The transaction wrote ${onchainHash}, but the record shows ${shownHash}.`);
  }

  // 9. The event in the same receipt.
  const logs = (receipt.logs || []).filter(
    (log) => sameHex(log.address, REGISTRY_ADDRESS) && log.topics && sameHex(log.topics[0], TOPIC_ANCHORED),
  );
  let event = null;
  if (logs.length !== 1) {
    report.set('event', 'fail', `Expected one Anchored event in the receipt, found ${logs.length}.`);
  } else {
    try {
      event = decodeAnchoredData(logs[0].data);
      const keyOk = sameHex(logs[0].topics[1], keccak256(anchoredId));
      const idOk = event.agreementId === anchoredId;
      const hashOk = sameHex(event.documentHash, onchainHash);
      if (keyOk && idOk && hashOk) {
        report.set('event', 'pass', `Key is keccak256("${anchoredId}"). Fingerprint matches.`);
      } else {
        report.set(
          'event',
          'fail',
          `Event does not match the call (key ${keyOk ? 'ok' : 'wrong'}, record ID ${idOk ? 'ok' : 'wrong'}, fingerprint ${hashOk ? 'ok' : 'wrong'}).`,
        );
      }
    } catch (err) {
      report.set('event', 'fail', `Could not read the Anchored event: ${err.message}`);
      event = null;
    }
  }

  // 10. Block time.
  const block = await rpc.call('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const blockTime = block ? Number.parseInt(block.timestamp, 16) : NaN;
  if (Number.isFinite(blockTime)) {
    facts.blockTime = isoFromUnix(blockTime);
    facts.blockTimestamp = blockTime;
  }
  if (!Number.isFinite(blockTime)) {
    report.set('block_time', 'fail', 'Could not read the block.');
  } else if (!event) {
    report.set('block_time', 'fail', `Block time ${isoFromUnix(blockTime)}, but there is no readable event to compare it with.`);
  } else if (event.anchoredAt === blockTime) {
    report.set('block_time', 'pass', `${isoFromUnix(blockTime)} (Unix ${blockTime}).`);
  } else {
    report.set('block_time', 'fail', `Event time ${event.anchoredAt} differs from block time ${blockTime}.`);
  }

  // 11. What the registry stores now.
  const ret = await rpc.call('eth_call', [{ to: REGISTRY_ADDRESS, data: encodeGetProof(anchoredId) }, 'latest']);
  let stored;
  try {
    stored = decodeGetProofResult(ret);
  } catch (err) {
    report.set('stored', 'fail', `Could not read getProof: ${err.message}`);
    return finish(report);
  }
  facts.fingerprintStored = stored.documentHash.toLowerCase();
  facts.creatorSlot = stored.creator;
  facts.counterpartySlot = stored.counterparty;
  const storedHashOk = sameHex(stored.documentHash, shownHash) && sameHex(stored.documentHash, onchainHash);
  const storedTimeOk = Number.isFinite(blockTime) && stored.anchoredAt === blockTime;
  if (storedHashOk && storedTimeOk) {
    report.set('stored', 'pass', `getProof("${anchoredId}") returns ${short(stored.documentHash)}, anchored at the same block time.`);
  } else {
    report.set(
      'stored',
      'fail',
      `getProof("${anchoredId}") returns ${stored.documentHash} at ${stored.anchoredAt}. Expected ${shownHash} at ${blockTime}.`,
    );
  }

  // 12. Optional: recompute from a record file.
  if (options.record !== undefined) {
    let fileId;
    try {
      fileId = recordId(options.record);
    } catch (err) {
      report.set('file_id', 'fail', err.message);
      report.set('file_fingerprint', 'skip', 'Not run because the record file has no usable ID.');
      return finish(report);
    }
    if (fileId === anchoredId) {
      report.set('file_id', 'pass', `"${fileId}".`);
    } else {
      report.set('file_id', 'fail', `The file is for "${fileId}", but the anchor is for "${anchoredId}".`);
    }
    try {
      // The canonical string holds both account IDs, so it is not put in the
      // result: people paste --json output into bug reports. Library users can
      // call canonicalRecordString() themselves.
      facts.fingerprintRecomputed = recordFingerprint(options.record);
      if (sameHex(facts.fingerprintRecomputed, stored.documentHash)) {
        report.set('file_fingerprint', 'pass', `Keccak-256 of the canonical record is ${short(facts.fingerprintRecomputed)}.`);
      } else {
        report.set(
          'file_fingerprint',
          'fail',
          `The file hashes to ${facts.fingerprintRecomputed}, not ${stored.documentHash}. The file differs from what was anchored. This check cannot say which field differs.`,
        );
      }
    } catch (err) {
      report.set('file_fingerprint', 'fail', err.message);
    }
  }

  return finish(report);
}
