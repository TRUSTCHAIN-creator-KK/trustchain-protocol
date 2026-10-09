#!/usr/bin/env node
// House style: no em dash (U+2014) or en dash (U+2013) in any text file:
// Markdown, JavaScript, YAML and JSON. Use a full stop, comma, colon or a
// plain hyphen instead.
//
// Not checked: the deployed contract source and its build files. Their bytes
// are fixed by what was compiled and deployed, and the source has three em
// dashes in its comments.
//
//   node scripts/check-dashes.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_PATHS = new Set(['contracts/build', 'contracts/TrustChainRegistry.sol']);
const EXTENSIONS = ['.md', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.json'];
const DASHES = /[\u2013\u2014]/g;

function* textFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_PATHS.has(relative(root, path).split('\\').join('/'))) continue;
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* textFiles(path);
    } else if (EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) {
      yield path;
    }
  }
}

let problems = 0;
let files = 0;
for (const file of textFiles(root)) {
  files++;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const match of line.matchAll(DASHES)) {
      problems++;
      const name = match[0] === '\u2014' ? 'em dash' : 'en dash';
      console.log(`${relative(root, file)}:${i + 1}:${match.index + 1}: ${name} (U+${match[0].codePointAt(0).toString(16).toUpperCase()})`);
    }
  });
}

if (problems) {
  console.log(`\n${problems} long dash(es) found in ${files} text files. Use a full stop, comma, colon or hyphen.`);
  process.exitCode = 1;
} else {
  console.log(`No em or en dashes in ${files} text files.`);
}
