/**
 * After `pnpm install`: write the generated files that are not in git (route tree,
 * pre-paint script, facts). Never fails the install: a production-only install has no
 * `tsx`, and `pnpm dev`, `pnpm build`, `pnpm typecheck` and the test run write the same
 * files again before they need them.
 */
import { spawnSync } from 'node:child_process';

const run = spawnSync('pnpm', ['run', 'gen'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (run.status !== 0) process.stdout.write('postinstall: `pnpm gen` skipped; run it before typecheck or tests.\n');
