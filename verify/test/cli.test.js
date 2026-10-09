import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
