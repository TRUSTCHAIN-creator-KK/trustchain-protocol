import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// These tests never touch the network: they only exercise argument handling.
const BIN = fileURLToPath(new URL('../bin/trustchain-verify.js', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 20000 });
}

test('--help prints usage and exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: trustchain-verify/);
  assert.match(r.stdout, /--record <file>/);
});

test('--version prints the package version', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('missing input exits 2', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing the Registry ID/);
});

test('unknown option exits 2', () => {
  const r = run(['5c79fbb0', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option --nope/);
});

test('an internal record ID instead of a Registry ID exits 2 with a hint', () => {
  const r = run(['9dfcB4iMwwVjHCjtfkdp', '--rpc', 'https://rpc.test.invalid']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /8 characters after \/verify\//);
});

test('an unreadable record file exits 2 before any network call', () => {
  const r = run(['5c79fbb0', '--record', '/no/such/file.json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Could not read the record file/);
});

test('--timeout must be a whole number in range', () => {
  for (const bad of ['1500.5', 'Infinity', '99999999999', '0', 'abc']) {
    const r = run(['5c79fbb0', '--timeout', bad]);
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /--timeout must be a whole number/, bad);
  }
});

test('options that need a value refuse a missing value or another option', () => {
  for (const args of [['5c79fbb0', '--rpc'], ['5c79fbb0', '--rpc='], ['5c79fbb0', '--record', '-h'], ['5c79fbb0', '--record', '--json']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /needs a value/, args.join(' '));
  }
});

test('--rpc must be an http or https URL', () => {
  const r = run(['5c79fbb0', '--rpc', 'polygon.drpc.org']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--rpc needs a full URL/);
  const r2 = run(['5c79fbb0', '--rpc=ftp://node.example.test']);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /http or https/);
});

test('--name=value and -- are understood', () => {
  // An invalid ID stops the run before any network call.
  const r = run(['--rpc=https://rpc.test.invalid', '--timeout=5000', '--', 'not-an-id']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is not a TrustChain Registry ID/);
});

test('a plain-http RPC gets a warning', () => {
  const r = run(['--rpc', 'http://rpc.example.test/v2/KEY', 'not-an-id']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /plain http/);
  assert.doesNotMatch(r.stderr, /KEY/);
});

test('error messages cannot carry raw control characters to the terminal', () => {
  const ESC = String.fromCharCode(0x1b);
  const r = run([`bad${ESC}[2Jid`]);
  assert.equal(r.status, 2);
  assert.ok(!r.stderr.includes(ESC));
  assert.match(r.stderr, /bad\\u001b\[2Jid/);
});

test('a record file that is not a JSON object exits 2 before any network call', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tc-verify-'));
  try {
    for (const content of ['null', '[]', '42']) {
      const file = join(dir, 'record.json');
      writeFileSync(file, content);
      const r = run(['5c79fbb0', '--record', file]);
      assert.equal(r.status, 2, content);
      assert.match(r.stderr, /must contain a JSON object/, content);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
