/* eslint-disable no-console -- CLI script */
// Counts jsx-a11y findings across app/ and components/ with the repo's own ESLint config.
// Usage: node scripts/count-jsx-a11y.mjs   (prints the count and the time it took).
//
// Ratchet (redesign audit F8): `node scripts/count-jsx-a11y.mjs --check` fails if the count rises above
// scripts/jsx-a11y-baseline.json, and tells you to lower the baseline when it falls. One-directional.
// Takes ~2.5 min cold (cached afterwards), so it is a script, not part of `pnpm test`.
import { readFileSync, writeFileSync } from 'node:fs';
import { ESLint } from 'eslint';

export async function countJsxA11y() {
  const eslint = new ESLint({ cache: true, cacheLocation: 'node_modules/.cache/eslint-jsx-a11y' });
  const results = await eslint.lintFiles(['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}']);
  let n = 0;
  for (const r of results) for (const m of r.messages) if (m.ruleId?.startsWith('jsx-a11y/')) n++;
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = Date.now();
  const n = await countJsxA11y();
  console.log(n, `jsx-a11y findings in ${Math.round((Date.now() - t) / 1000)}s`);
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
