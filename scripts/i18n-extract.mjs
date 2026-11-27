/* eslint-disable no-console -- CLI script */
// `pnpm i18n:extract`: run i18next-cli, then drop the new keys that would shadow a `defaultValue`.
//
// i18next-cli follows `t(item.tKey, { defaultValue })` through a data table and finds the keys the old extractor
// could not see, but it has no text for them: it writes '' or the key itself. A catalog value beats the call's
// `defaultValue`, so committing either would show `quality-auto` where "Auto" belongs. Those entries are removed
// here (only ones the committed catalog does not already have), and listed so they can be given a literal `t()`
// call if they ever need to reach translation. Everything else the extractor found is kept.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const run = spawnSync(process.execPath, ['node_modules/i18next-cli/dist/esm/cli.js', 'extract', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
if (run.status !== 0) process.exit(run.status ?? 1);

const dir = 'locales/en';
const skipped = [];
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json') || file.startsWith('.')) continue;
  const path = `${dir}/${file}`;
  const now = JSON.parse(readFileSync(path, 'utf8'));
  let committed = {};
  try {
    committed = JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    /* a new namespace file: nothing committed yet */
  }
  const drop = Object.entries(now).filter(([key, value]) => !(key in committed) && (value === '' || value === key));
  if (!drop.length) continue;
  for (const [key] of drop) {
    delete now[key];
    skipped.push(`${file}: ${key}`);
  }
  writeFileSync(path, JSON.stringify(now, null, 2) + '\n');
}
if (skipped.length) {
  console.log(`\n[i18n] left out ${skipped.length} new key(s) with no text of their own (dynamic t(variable, { defaultValue })):`);
  for (const line of skipped.slice(0, 20)) console.log(`  ${line}`);
  if (skipped.length > 20) console.log(`  … and ${skipped.length - 20} more`);
}
