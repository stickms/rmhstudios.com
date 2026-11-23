/**
 * Signal Forge's content strings (engine/content-strings.ts: card, enemy, relic, event, ascension, tutorial and
 * label text) as literal i18n calls. The UI looks a string up by an id, which the extractor cannot see, so this
 * script writes:
 *
 *   - features/signal-forge/ui/content-labels.ts: a function taking `t` and returning a record of literal
 *     `t('key', { defaultValue })` calls (the settings-nav-labels pattern), which the extractor reads;
 *   - the same keys into locales/en/c-signal-forge.json (sorted, every other key kept).
 *
 * engine/__tests__/content.test.ts fails when either drifts from the content. Run after changing any content text:
 *
 *   pnpm exec tsx features/signal-forge/scripts/content-keys.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentStrings } from '../engine/content-strings';

const strings = contentStrings();
const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const labels = [
  '/**',
  ' * Signal Forge content text as literal i18n calls. WRITTEN BY features/signal-forge/scripts/content-keys.ts from',
  ' * engine/content-strings.ts; do not edit by hand (engine/__tests__/content.test.ts holds the two equal).',
  ' */',
  "import type { TFunction } from 'i18next';",
  '',
  'export function contentLabels(t: TFunction): Record<string, string> {',
  '  return {',
  ...Object.keys(strings)
    .sort()
    .map((k) => `    ${quote(k)}: t(${quote(k)}, { defaultValue: ${quote(strings[k] as string)} }),`),
  '  };',
  '}',
  '',
].join('\n');
writeFileSync(join(process.cwd(), 'features/signal-forge/ui/content-labels.ts'), labels);

const file = join(process.cwd(), 'locales/en/c-signal-forge.json');
function readCurrent(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}
const merged: Record<string, string> = { ...readCurrent(), ...strings };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k] as string]));
writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(strings).length} content labels and ${Object.keys(sorted).length} catalog keys\n`);
