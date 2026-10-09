// Runs the test suite with the live, read-only check turned on.
// Works the same in any shell: npm run test:live
//
// Set TRUSTCHAIN_RPC to use your own RPC URL for the live check.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const verifyDir = fileURLToPath(new URL('..', import.meta.url));
const r = spawnSync(process.execPath, ['--test'], {
  cwd: verifyDir,
  stdio: 'inherit',
  env: { ...process.env, TRUSTCHAIN_LIVE: '1' },
});
process.exitCode = r.status ?? 1;
