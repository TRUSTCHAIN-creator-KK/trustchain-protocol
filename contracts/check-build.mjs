#!/usr/bin/env node
// Checks, without a Solidity compiler, that the published build files belong
// to the published source, and (with --live) that Polygon runs that code.
//
//   node contracts/check-build.mjs           offline checks only
//   node contracts/check-build.mjs --live    also reads the chain
//   node contracts/check-build.mjs --live --rpc <url> [--rpc <url> ...]
//
// The links it checks:
//   1. The source inside the standard JSON input is TrustChainRegistry.sol, byte for byte.
//   2. keccak256(TrustChainRegistry.sol) equals the source hash inside the metadata file.
//   3. The IPFS hash of the metadata file is embedded at the end of the runtime bytecode.
//   4. The runtime bytecode hashes to the code hash the verifier expects.
//   5. (--live) eth_getCode at the registry address returns exactly that bytecode.
//   6. (--live) The deployment transaction's input is exactly the creation bytecode.
//
// Exit codes: 0 every check passed, 1 a check failed, 2 a live check could not
// be run (no RPC answered). A failed RPC is never reported as a mismatch.
//
// This does not replace compiling the source yourself (see DEPLOYMENTS.md),
// but it needs nothing beyond Node.js 18.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256 } from '../verify/src/keccak.js';
import { ANCHOR_WALLET, DEFAULT_RPC_URLS, REGISTRY_ADDRESS, REGISTRY_CODE_HASH } from '../verify/src/constants.js';
import { readJson } from '../verify/src/http.js';
import { escapeControl, redactUrl } from '../verify/src/text.js';

const DEPLOYMENT_TX = '0x0fc4711f17e6fa79107768578b09fe4ec1612685861989ef42ee0c517513a672';

const args = process.argv.slice(2);
const rpcUrls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rpc') {
    const url = args[++i];
    if (!url || url.startsWith('-')) {
      console.error('--rpc needs a URL, for example --rpc https://polygon.drpc.org');
      process.exit(2);
    }
    rpcUrls.push(url);
  } else if (args[i] !== '--live') {
    console.error(`Unknown argument ${escapeControl(args[i])}`);
    process.exit(2);
  }
}

const here = (p) => new URL(p, import.meta.url);
const source = readFileSync(here('./TrustChainRegistry.sol'));
const metadataRaw = readFileSync(here('./build/TrustChainRegistry.metadata.json'));
const build = JSON.parse(readFileSync(here('./build/TrustChainRegistry.bytecode.json'), 'utf8'));
const metadata = JSON.parse(metadataRaw.toString('utf8'));
const standardInput = JSON.parse(readFileSync(here('./build/TrustChainRegistry.standard-input.json'), 'utf8'));

function varint(n) {
  const out = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}

// solc stores the IPFS (CIDv0) hash of the metadata file: sha256 over a
// one-block UnixFS file node that wraps the raw bytes.
function ipfsSha256(content) {
  const unixfs = Buffer.concat([Buffer.from([0x08, 0x02, 0x12]), varint(content.length), content, Buffer.from([0x18]), varint(content.length)]);
  const node = Buffer.concat([Buffer.from([0x0a]), varint(unixfs.length), unixfs]);
  return createHash('sha256').update(node).digest('hex');
}

let failures = 0;
let notChecked = 0;
function report(ok, text) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
}
function couldNotCheck(text, reasons) {
  console.log(`ERROR ${text}`);
  for (const r of reasons) console.log(`      ${escapeControl(r)}`);
  notChecked++;
}

const inputSource = standardInput.sources?.['contracts/TrustChainRegistry.sol']?.content;
report(inputSource === source.toString('utf8'), 'Source inside the standard JSON input equals TrustChainRegistry.sol byte for byte');

const sourceHash = keccak256(new Uint8Array(source));
const declared = metadata.sources['contracts/TrustChainRegistry.sol'].keccak256;
report(sourceHash === declared, `Source hash ${sourceHash} matches the metadata file`);

const metaHash = ipfsSha256(metadataRaw);
const marker = 'a2646970667358221220' + metaHash; // CBOR: {"ipfs": <34-byte multihash>
report(build.deployedBytecode.includes(marker), `Metadata IPFS hash ${metaHash} is embedded in the runtime bytecode`);

const codeHash = keccak256(new Uint8Array(Buffer.from(build.deployedBytecode.slice(2), 'hex')));
report(codeHash === REGISTRY_CODE_HASH, `Runtime bytecode hash ${codeHash} matches the verifier constant`);

report(
  metadata.compiler.version === '0.8.20+commit.a1b79de6' &&
    metadata.settings.optimizer.enabled === false &&
    metadata.settings.evmVersion === 'paris',
  `Compiler ${metadata.compiler.version}, optimizer ${metadata.settings.optimizer.enabled ? 'on' : 'off'}, EVM ${metadata.settings.evmVersion}`,
);

// Asks each RPC in turn. Returns the first usable result, or null with the
// reason each endpoint gave.
async function firstResult(urls, method, params) {
  const reasons = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await readJson(res);
      if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
      const chain = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(20000),
      }).then((r) => readJson(r));
      if (Number.parseInt(chain.result, 16) !== 137) throw new Error(`it reports chain ID ${chain.result}, not 137`);
      if (body.result === null || body.result === undefined) throw new Error('no result (null)');
      return { result: body.result, url, reasons };
    } catch (err) {
      reasons.push(`${redactUrl(url)}: ${err.message}`);
    }
  }
  return { result: null, reasons };
}

if (args.includes('--live')) {
  const urls = rpcUrls.length ? rpcUrls : DEFAULT_RPC_URLS;

  const code = await firstResult(urls, 'eth_getCode', [REGISTRY_ADDRESS, 'latest']);
  if (typeof code.result !== 'string') {
    couldNotCheck(`Could not read the code at ${REGISTRY_ADDRESS} from any RPC:`, code.reasons);
  } else {
    console.log(`      (eth_getCode from ${redactUrl(code.url)})`);
    report(
      code.result.toLowerCase() === build.deployedBytecode.toLowerCase(),
      `Code at ${REGISTRY_ADDRESS} on Polygon equals the published runtime bytecode`,
    );
  }

  const tx = await firstResult(urls, 'eth_getTransactionByHash', [DEPLOYMENT_TX]);
  if (!tx.result || typeof tx.result !== 'object') {
    couldNotCheck(
      'Could not read the deployment transaction from any RPC. Some nodes keep only recent history; try --rpc with one that keeps it all:',
      tx.reasons,
    );
  } else {
    console.log(`      (deployment transaction from ${redactUrl(tx.url)})`);
    const t = tx.result;
    report(
      typeof t.input === 'string' &&
        t.input.toLowerCase() === build.bytecode.toLowerCase() &&
        t.to === null &&
        typeof t.from === 'string' &&
        t.from.toLowerCase() === ANCHOR_WALLET.toLowerCase(),
      `Deployment transaction ${DEPLOYMENT_TX.slice(0, 10)}... from ${ANCHOR_WALLET} carries exactly the published creation bytecode`,
    );
  }
}

process.exitCode = failures ? 1 : notChecked ? 2 : 0;
