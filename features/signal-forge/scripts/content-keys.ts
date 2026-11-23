/**
 * Writes Signal Forge's content strings (engine/content-strings.ts) into locales/en/c-signal-forge.json, keeping
 * every other key, sorted. Run after changing a card, enemy, relic, event, ascension or tutorial text:
 *
 *   pnpm exec tsx features/signal-forge/scripts/content-keys.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentStrings } from '../engine/content-strings';

const file = join(process.cwd(), 'locales/en/c-signal-forge.json');
function readCurrent(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}
const current = readCurrent();
const merged: Record<string, string> = { ...current, ...contentStrings() };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k] as string]));
writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(sorted).length} keys to ${file}\n`);
