#!/usr/bin/env node
// Checks, without a Solidity compiler, that the published build files belong
// to the published source, and (with --live) that Polygon runs that code.
//
//   node contracts/check-build.mjs           offline checks only
//   node contracts/check-build.mjs --live    also compares eth_getCode on Polygon
//   node contracts/check-build.mjs --live --rpc <url>
//
// The links it checks:
//   1. keccak256(TrustChainRegistry.sol) equals the source hash inside the metadata file.
//   2. The IPFS hash of the metadata file is embedded at the end of the runtime bytecode.
//   3. The runtime bytecode hashes to the code hash the verifier expects.
//   4. (--live) eth_getCode at the registry address returns exactly that bytecode.
//
// This does not replace compiling the source yourself (see DEPLOYMENTS.md),
// but it needs nothing beyond Node.js 18.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256 } from '../verify/src/keccak.js';
import { DEFAULT_RPC_URLS, REGISTRY_ADDRESS, REGISTRY_CODE_HASH } from '../verify/src/constants.js';

const here = (p) => new URL(p, import.meta.url);
const source = readFileSync(here('./TrustChainRegistry.sol'));
const metadataRaw = readFileSync(here('./build/TrustChainRegistry.metadata.json'));
const build = JSON.parse(readFileSync(here('./build/TrustChainRegistry.bytecode.json'), 'utf8'));
const metadata = JSON.parse(metadataRaw.toString('utf8'));

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
function report(ok, text) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
}

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

if (process.argv.includes('--live')) {
  const i = process.argv.indexOf('--rpc');
  const urls = i > -1 ? [process.argv[i + 1]] : DEFAULT_RPC_URLS;
  let code = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [REGISTRY_ADDRESS, 'latest'] }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json();
      if (typeof body.result === 'string') {
        code = body.result;
        console.log(`      (eth_getCode from ${url})`);
        break;
      }
    } catch {
      // try the next endpoint
    }
  }
  report(
    typeof code === 'string' && code.toLowerCase() === build.deployedBytecode.toLowerCase(),
    `Code at ${REGISTRY_ADDRESS} on Polygon equals the published runtime bytecode`,
  );
}

process.exitCode = failures ? 1 : 0;
