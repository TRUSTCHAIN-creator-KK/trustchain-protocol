#!/usr/bin/env node
// Command line entry point. Run with --help for usage.

import { readFileSync } from 'node:fs';
import { verifyRecord } from '../src/verify.js';
import { formatReport } from '../src/format.js';

const HELP = `Usage: trustchain-verify <registry-id or link> [options]

Checks a TrustChain record against the Polygon chain. It only reads public data.

Examples:
  trustchain-verify 5c79fbb0
  trustchain-verify https://trustchain.biz/verify/5c79fbb0
  trustchain-verify 5c79fbb0 --record my-record.json

Options:
  --rpc <url>        Polygon RPC to use. Repeat to give fallbacks.
                     Default: public RPCs that need no API key.
  --record <file>    A record file from one of the parties. The tool then
                     recomputes the fingerprint and compares it with the chain.
  --json             Print the full result as JSON.
  --timeout <ms>     Timeout per request. Default 20000.
  -h, --help         Show this help.
  -v, --version      Show the version.

Exit codes: 0 all checks passed, 1 a check failed, 2 the tool could not run.
`;

function parseArgs(argv) {
  const opts = { rpcUrls: [], json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--rpc') opts.rpcUrls.push(next());
    else if (arg === '--record') opts.recordPath = next();
    else if (arg === '--timeout') opts.timeoutMs = Number(next());
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length > 1) throw new Error('Give one Registry ID or link at a time');
  opts.input = positional[0];
  if (opts.timeoutMs !== undefined && !(opts.timeoutMs > 0)) throw new Error('--timeout must be a positive number');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (!opts.input) {
    process.stderr.write(`Missing the Registry ID or link.\n\n${HELP}`);
    return 2;
  }

  let record;
  if (opts.recordPath) {
    try {
      record = JSON.parse(readFileSync(opts.recordPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`Could not read the record file: ${err.message}\n`);
      return 2;
    }
  }

  try {
    const result = await verifyRecord(opts.input, {
      rpcUrls: opts.rpcUrls,
      record,
      timeoutMs: opts.timeoutMs,
    });
    process.stdout.write((opts.json ? JSON.stringify(result, null, 2) : formatReport(result)) + '\n');
    return result.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write(`Could not finish the check: ${err.message}\n`);
    return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
});
