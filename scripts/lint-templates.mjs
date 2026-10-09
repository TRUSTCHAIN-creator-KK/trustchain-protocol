#!/usr/bin/env node
// Mechanical checks for the agreement templates in templates/.
// No judgement calls: every rule here is a pattern a computer can test.
//
//   node scripts/lint-templates.mjs [folder]   (default: templates/)

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2]
  ? resolve(process.argv[2]) + '/'
  : fileURLToPath(new URL('../templates/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();

// Every template has these headings, once each, in this order.
const HEADINGS = [
  '## Short form',
  '## Full form',
  "### 1. What we're doing",
  '### 2. Price and payment',
  '### 3. Changes',
  '### 4. Dates',
  '### 5. If someone walks',
  '### Agreed',
  '## Optional clauses',
  '## Example',
  '## Check the rules where you live',
];

// Words that make a legal claim, or sound like one. Templates record what two
// people agreed. They never say what the law is or that a term will hold.
const BANNED = [
  /\blegally binding\b/i,
  /\bbinding\b/i,
  /\benforc\w*/i,
  /\bvalid(ity)?\b/i,
  /\bguarantee\w*/i,
  /\blawyer[- ]approved\b/i,
  /\bcourt[- ]ready\b/i,
  /\btamper[- ]?proof\b/i,
  /\bimmutable\b/i,
  /\bverified\b/i,
  /\bsign now\b/i,
  /\bentitled\b/i,
  /\bthe law says\b/i,
  /\bstatute\w*/i,
  /\bhereinafter\b/i,
  /\bindemnif\w*/i,
  /\bwarrant(y|ies)\b/i,
  /\bsection\b/i,
];

// Statute-shaped strings: an Act name, a section number, a section sign.
const STATUTE = [/\b[A-Z][a-z]+ Act\b/, /\bs\. ?\d/, /§/];

const PLACEHOLDER = /\[([^\]]*)\](?!\()/g;
const PLACEHOLDER_OK = /^[A-Z0-9][A-Z0-9 ,.'/&()-]*$/;
const MONEY = /[$€£]\s?\d/;

const errors = [];
const fail = (file, msg) => errors.push(`templates/${file}: ${msg}`);

function sections(text) {
  // Map "## Heading" -> body text until the next heading of level 2 or 3.
  const out = new Map();
  let current = '_top';
  out.set(current, '');
  for (const line of text.split('\n')) {
    if (/^#{2,3} /.test(line)) {
      current = line.trim();
      out.set(current, '');
    } else {
      out.set(current, out.get(current) + line + '\n');
    }
  }
  return out;
}

for (const file of files) {
  const text = readFileSync(dir + file, 'utf8');
  const lines = text.split('\n');

  if (!lines[0].startsWith('# ')) fail(file, 'first line must be a "# Title"');

  // Headings: present, once, in order.
  let last = -1;
  for (const h of HEADINGS) {
    const at = lines.reduce((acc, line, i) => (line.trim() === h ? [...acc, i] : acc), []);
    if (at.length !== 1) {
      fail(file, `heading "${h}" must appear exactly once (found ${at.length})`);
      continue;
    }
    if (at[0] < last) fail(file, `heading "${h}" is out of order`);
    last = at[0];
  }

  const body = sections(text);

  // Short form: one quoted message that asks for a written yes.
  const short = body.get('## Short form') || '';
  const quote = short.split('\n').filter((l) => l.startsWith('> ')).join(' ');
  if (!quote) fail(file, 'Short form needs the message as a "> " quote');
  else if (!/reply yes/i.test(quote)) fail(file, 'Short form message must ask for a written yes ("Reply yes ...")');

  // Example: filled in, no placeholders left.
  const example = body.get('## Example') || '';
  if (/\[[A-Z]/.test(example)) fail(file, 'Example must be filled in, without [PLACEHOLDERS]');

  // Ending: the check-the-rules note is the last section and the file ends with the footer.
  const lastHeading = lines.filter((l) => /^#{2,3} /.test(l)).pop();
  if (lastHeading !== '## Check the rules where you live') fail(file, 'the last section must be "## Check the rules where you live"');
  if (!text.endsWith('\nNot legal advice.\n')) fail(file, 'file must end with the line "Not legal advice."');

  lines.forEach((line, i) => {
    const where = `line ${i + 1}`;
    for (const re of BANNED) if (re.test(line)) fail(file, `${where}: banned wording ${re}`);
    for (const re of STATUTE) if (re.test(line)) fail(file, `${where}: looks like a statute reference ${re}`);
    if (/[\u2013\u2014]/.test(line)) fail(file, `${where}: em or en dash`);
    for (const m of line.matchAll(PLACEHOLDER)) {
      if (!PLACEHOLDER_OK.test(m[1])) fail(file, `${where}: placeholder "[${m[1]}]" must be UPPER CASE`);
    }
  });

  // Money amounts live in the Example only. Everywhere else they are placeholders.
  for (const [heading, content] of body) {
    if (heading === '## Example') continue;
    if (MONEY.test(content)) fail(file, `amount written as a number under "${heading}"; use a [PLACEHOLDER]`);
  }
}

// The index lists every template.
const index = readFileSync(dir + 'README.md', 'utf8');
for (const file of files) {
  if (!index.includes(`(${file})`)) fail('README.md', `does not link to ${file}`);
}

if (errors.length) {
  console.log(errors.join('\n'));
  console.log(`\n${errors.length} problem(s) in ${files.length} templates.`);
  process.exitCode = 1;
} else {
  console.log(`${files.length} templates pass all checks.`);
}
