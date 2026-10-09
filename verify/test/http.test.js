import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../src/http.js';
import { escapeControl, escapeJsonText, redactUrl } from '../src/text.js';

test('readJson reads a normal answer', async () => {
  assert.deepEqual(await readJson(new Response('{"a":1}')), { a: 1 });
});

test('readJson stops reading an answer that is too large', async () => {
  await assert.rejects(readJson(new Response('{"a":"' + 'x'.repeat(100) + '"}'), 50), /larger than 50 bytes/);
});

test('readJson refuses early when the declared length is too large', async () => {
  const res = new Response('{}', { headers: { 'content-length': '999999999' } });
  await assert.rejects(readJson(res, 1000), /larger than 1000 bytes/);
});

test('readJson reports bad JSON as a SyntaxError', async () => {
  await assert.rejects(readJson(new Response('<html>')), SyntaxError);
});

test('escapeControl shows control, separator and bidi characters as escapes', () => {
  const codes = [0x00, 0x07, 0x0a, 0x0d, 0x1b, 0x7f, 0x85, 0x9b, 0x061c, 0x200e, 0x2028, 0x2029, 0x202e, 0x2066];
  const input = codes.map((c) => 'a' + String.fromCharCode(c)).join('');
  const out = escapeControl(input);
  for (const c of codes) assert.ok(!out.includes(String.fromCharCode(c)), `U+${c.toString(16)} left raw`);
  assert.ok(out.includes('a\\u001ba'));
  assert.equal(escapeControl('Golf Clubs, Привет, é'), 'Golf Clubs, Привет, é');
});

test('escapeJsonText keeps JSON valid and the values unchanged', () => {
  const value = { t: 'x' + String.fromCharCode(0x9b) + String.fromCharCode(0x202e) + String.fromCharCode(0x2028) + 'y\n' };
  const text = escapeJsonText(JSON.stringify(value, null, 2));
  for (const c of [0x9b, 0x202e, 0x2028]) assert.ok(!text.includes(String.fromCharCode(c)), `U+${c.toString(16)} left raw`);
  assert.deepEqual(JSON.parse(text), value);
});

test('redactUrl keeps only the scheme and host', () => {
  assert.equal(redactUrl('https://polygon.drpc.org'), 'https://polygon.drpc.org');
  assert.equal(redactUrl('https://polygon.drpc.org/'), 'https://polygon.drpc.org');
  assert.equal(redactUrl('https://polygon-mainnet.g.alchemy.com/v2/abcdef123'), 'https://polygon-mainnet.g.alchemy.com/...');
  assert.equal(redactUrl('https://user:pass@node.example.test'), 'https://node.example.test/...');
  assert.equal(redactUrl('https://node.example.test/?key=1'), 'https://node.example.test/...');
  assert.equal(redactUrl('not a url'), '(not a valid URL)');
});
