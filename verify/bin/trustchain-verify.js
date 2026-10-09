#!/usr/bin/env node
// Command line entry point. Run with --help for usage.

import { readFileSync } from 'node:fs';
import { verifyRecord } from '../src/verify.js';
import { formatReport } from '../src/format.js';
import { escapeControl, escapeJsonText, redactUrl } from '../src/text.js';

const MAX_TIMEOUT_MS = 2147483647; // the largest timer Node.js keeps as given

const HELP = `Usage: trustchain-verify <registry-id or link> [options]

Checks a TrustChain record against the Polygon chain. It only reads public data.
From a clone of the repository, run it as: node verify/bin/trustchain-verify.js

Examples:
  trustchain-verify 5c79fbb0
  trustchain-verify https://trustchain.biz/verify/5c79fbb0
  trustchain-verify 5c79fbb0 --record my-record.json

Options:
  --rpc <url>        Polygon RPC to use. Repeat to give fallbacks. Fallbacks
                     are tried in order. They are not compared with each other.
                     Default: public RPCs that need no API key.
  --record <file>    A record file with the inputs TrustChain hashed. The tool
                     recomputes the fingerprint and compares it with the chain.
                     The TrustChain app cannot export this file yet.
  --json             Print the full result as JSON.
  --timeout <ms>     Timeout per request, a whole number. Default 20000.
  -h, --help         Show this help.
  -v, --version      Show the version.

Exit codes: 0 all checks passed, 1 a check failed, 2 the tool could not run.
`;

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

function parseRpcUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`--rpc needs a full URL such as https://polygon.drpc.org, not "${value}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`--rpc needs an http or https URL, not "${url.protocol}"`);
  }
  return url;
}

function parseArgs(argv) {
  const opts = { rpcUrls: [], json: false, warnings: [] };
  const positional = [];
  let optionsEnded = false;
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (optionsEnded) {
      positional.push(arg);
      continue;
    }
    if (arg === '--') {
      optionsEnded = true;
      continue;
    }
    // --name=value is the same as --name value.
    let inline;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (eq > -1) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = () => {
      const v = inline !== undefined ? inline : argv[++i];
      if (v === undefined || v === '' || v.startsWith('-')) throw new Error(`${arg} needs a value`);
      return v;
    };
    const noValue = () => {
      if (inline !== undefined) throw new Error(`${arg} does not take a value`);
    };
    if (arg === '-h' || arg === '--help') {
      noValue();
      opts.help = true;
    } else if (arg === '-v' || arg === '--version') {
      noValue();
      opts.version = true;
    } else if (arg === '--json') {
      noValue();
      opts.json = true;
    } else if (arg === '--rpc') {
      const url = parseRpcUrl(value());
      if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
        opts.warnings.push(
          `Warning: ${redactUrl(url.href)} uses plain http. Anyone on the network path can read or change its answers.`,
        );
      }
      opts.rpcUrls.push(url.href);
    } else if (arg === '--record') {
      opts.recordPath = value();
    } else if (arg === '--timeout') {
      const raw = value();
      const t = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(t) || t <= 0 || t > MAX_TIMEOUT_MS) {
        throw new Error(`--timeout must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}`);
      }
      opts.timeoutMs = t;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) throw new Error('Give one Registry ID or link at a time');
  opts.input = positional[0];
  return opts;
}

function writeErr(text) {
  process.stderr.write(escapeControl(text) + '\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    writeErr(err.message);
    process.stderr.write(`\n${HELP}`);
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
  for (const warning of opts.warnings) writeErr(warning);

  let record;
  if (opts.recordPath) {
    try {
      record = JSON.parse(readFileSync(opts.recordPath, 'utf8'));
    } catch (err) {
      writeErr(`Could not read the record file: ${err.message}`);
      return 2;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      writeErr('The record file must contain a JSON object.');
      return 2;
    }
  }

  try {
    const result = await verifyRecord(opts.input, {
      rpcUrls: opts.rpcUrls,
      record,
      timeoutMs: opts.timeoutMs,
    });
    const text = opts.json ? escapeJsonText(JSON.stringify(result, null, 2)) : formatReport(result);
    process.stdout.write(text + '\n');
    return result.ok ? 0 : 1;
  } catch (err) {
    writeErr(`Could not finish the check: ${err.message}`);
    return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
});
