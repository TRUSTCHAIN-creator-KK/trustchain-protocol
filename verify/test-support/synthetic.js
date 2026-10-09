// Builds a made-up but internally consistent "chain + endpoint" fixture.
// Used to test the record-file path end to end, because the real sample
// record's account IDs are not public and cannot be put in a test.

import { readFileSync } from 'node:fs';
import { encodeAnchor, encodeAnchoredData, encodeGetProof, encodeGetProofResult } from '../src/abi.js';
import { ANCHOR_WALLET, REGISTRY_ADDRESS, TOPIC_ANCHORED, ZERO_ADDRESS } from '../src/constants.js';
import { keccak256 } from '../src/keccak.js';

const sample = JSON.parse(readFileSync(new URL('../test/fixtures/sample-5c79fbb0.json', import.meta.url), 'utf8'));
const realCode = sample.rpc.find((r) => r.method === 'eth_getCode').result;
const ZERO_WORD = '0x' + '00'.repeat(32);

export function syntheticFixture({ publicId, agreementId, fingerprint, timestamp, blockNumber = 100000000 }) {
  const txHash = keccak256(`synthetic tx for ${agreementId}`);
  const blockHex = '0x' + blockNumber.toString(16);
  return {
    publicId,
    publicRecord: {
      body: {
        ok: true,
        status: 'found',
        data: {
          status: 'completed',
          publicId,
          blockchain: {
            isAnchored: true,
            agreementHash: fingerprint,
            transactionHash: txHash,
            contractAddress: REGISTRY_ADDRESS,
            network: 'Polygon Mainnet',
            chainId: 137,
            anchoredAt: new Date(timestamp * 1000 + 2000).toISOString(),
            status: 'anchored',
          },
          signatures: { originator: { signed: true }, counterparty: { signed: true } },
        },
      },
    },
    rpc: [
      { method: 'eth_chainId', params: [], result: '0x89' },
      {
        method: 'eth_getTransactionByHash',
        params: [txHash],
        result: {
          hash: txHash,
          from: ANCHOR_WALLET.toLowerCase(),
          to: REGISTRY_ADDRESS.toLowerCase(),
          blockNumber: blockHex,
          input: encodeAnchor(agreementId, fingerprint, ZERO_ADDRESS, ZERO_ADDRESS),
        },
      },
      {
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        result: {
          transactionHash: txHash,
          status: '0x1',
          blockNumber: blockHex,
          logs: [
            {
              address: REGISTRY_ADDRESS.toLowerCase(),
              topics: [TOPIC_ANCHORED, keccak256(agreementId), ZERO_WORD],
              data: encodeAnchoredData(agreementId, fingerprint, timestamp),
            },
          ],
        },
      },
      { method: 'eth_getCode', params: [REGISTRY_ADDRESS, 'latest'], result: realCode },
      {
        method: 'eth_getBlockByNumber',
        params: [blockHex, false],
        result: { number: blockHex, timestamp: '0x' + timestamp.toString(16) },
      },
      {
        method: 'eth_call',
        params: [{ to: REGISTRY_ADDRESS, data: encodeGetProof(agreementId) }, 'latest'],
        result: encodeGetProofResult(fingerprint, ZERO_ADDRESS, ZERO_ADDRESS, timestamp),
      },
    ],
  };
}
