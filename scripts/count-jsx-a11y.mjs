/* eslint-disable no-console -- CLI script */
// Counts jsx-a11y findings across app/ and components/ with the repo's own oxlint config.
// Usage: node scripts/count-jsx-a11y.mjs   (prints the count and the time it took).
//
// Ratchet (redesign audit F8): `node scripts/count-jsx-a11y.mjs --check` fails if the count rises above
// scripts/jsx-a11y-baseline.json, and tells you to lower the baseline when it falls. One-directional.
// oxlint does the whole tree in a few seconds, so there is no cache and it runs on every CI push.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function countJsxA11y() {
  const run = spawnSync(
    process.execPath,
    [path.join('node_modules', 'oxlint', 'bin', 'oxlint'), '-c', '.oxlintrc.json', '-f', 'json', 'app', 'components'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.error || !run.stdout) throw new Error(`oxlint did not run: ${run.error?.message ?? run.stderr}`);
  return JSON.parse(run.stdout).diagnostics.filter((d) => d.code.startsWith('jsx-a11y(')).length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = Date.now();
  const n = countJsxA11y();
  console.log(n, `jsx-a11y findings in ${Math.round((Date.now() - t) / 100) / 10}s`);
  if (process.argv.includes('--check')) {
    const file = new URL('./jsx-a11y-baseline.json', import.meta.url);
    const { max } = JSON.parse(readFileSync(file, 'utf8'));
    if (n > max) {
      console.error(`jsx-a11y findings rose: ${n} > baseline ${max}. Fix the new warnings.`);
      process.exit(1);
    }
    if (n < max) {
      if (process.argv.includes('--update')) writeFileSync(file, JSON.stringify({ max: n }, null, 2) + '\n');
      else console.error(`Count fell to ${n} (baseline ${max}): run with --check --update to lower the baseline.`);
    }
  }
}
