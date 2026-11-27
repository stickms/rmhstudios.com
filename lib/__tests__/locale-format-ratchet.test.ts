/**
 * Locale-less formatting only goes DOWN (sprint 05, feature 11).
 *
 * `n.toLocaleString()`, `d.toLocaleDateString(undefined)`, `formatDistanceToNow`
 * and `new Intl.NumberFormat('en-US')` write in the BROWSER's locale on the client,
 * the server's during SSR and English whatever the reader chose, so the two
 * renders differ (React throws the server tree away) and a translated sentence
 * carries an English "3 days ago". The tools that take the active language:
 *
 *  - React: `useLocaleFormat()` (hooks/useLocaleFormat.ts) — `date`, `time`,
 *    `dateTime`, `number`, `compact`, `relative`.
 *  - non-React: `formatDate` / `formatTime` / `formatDateTime` / `formatNumber`
 *    (lib/core/format.ts) with `currentDocumentLocale()` when no locale is in scope.
 *  - relative time: `RelativeTime` or `formatRelativeTime(at, locale)`.
 *
 * This counts the patterns in `components/`, `app/` and `features/` per file. A
 * file may not exceed its BASELINE entry (new files have none), and a file that
 * drops below it must lower the entry, so the space freed cannot fill up again.
 * Every entry carries the reason the call stays.
 */
import { globSync, readFileSync } from 'node:fs';
import * as ts from './ts-ast';
import { describe, expect, it } from 'vitest';

/** file -> [count, why it stays]. Entries come out; they do not go in. */
const BASELINE: Record<string, [number, string]> = {
  'features/doctrine/engine/temporal.ts': [
    3,
    'Reads hour/minute back out of formatToParts to test a time window: the digits must be Latin, so the locale is fixed. Never shown.',
  ],
  'components/daily-puzzles/DailyPuzzlesHub.tsx': [
    1,
    'formatToParts of America/New_York read back as numbers to find the next puzzle rotation. Never shown.',
  ],
  'components/homes/RentSplitCalculator.tsx': [
    1,
    'US dollar amounts for a US rent split; the calculator is built around USD and en-US grouping.',
  ],
  'components/elections/hooks.ts': [
    1,
    'Module-level fmtInt shared by helpers outside React (no locale in scope); follow-up: pass the locale in.',
  ],
  'components/elections/CalendarPanel.tsx': [
    1,
    'Module-level date helper for a US election calendar read outside a component; follow-up: pass the locale in.',
  ],
  'components/admin/census/CensusPanel.tsx': [
    1,
    'Module-level nf behind the bytes() helper used by column renderers; follow-up: pass the formatter in.',
  ],
};

const TO_LOCALE = /^toLocale(Date|Time)?String$/;
const INTL_CTOR = /^(DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules|Collator)$/;

function localeLess(arg: ts.Expression | undefined, allowMissing: boolean): boolean {
  if (!arg) return allowMissing;
  if (ts.isIdentifier(arg) && arg.text === 'undefined') return true;
  return ts.isStringLiteralLike(arg) && /^en(-|$)/i.test(arg.text);
}

/** Number of locale-less formatting calls in `source`. Exported shape for the self-test below. */
export function countLocaleLess(source: string, fileName = 'x.tsx'): number {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      const first = node.arguments?.[0];
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(callee) && TO_LOCALE.test(callee.name.text)) {
        if (localeLess(first, true)) n++;
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(callee) &&
        /^formatDistanceToNow(Strict)?$/.test(callee.text)
      ) {
        n++;
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Intl' &&
        INTL_CTOR.test(callee.name.text)
      ) {
        if (localeLess(first, false)) n++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

function scan(): Record<string, number> {
  const files = globSync('{app,components,features}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\.|\.d\.ts|routeTree\.gen/.test(String(f)),
  });
  const out: Record<string, number> = {};
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (!/toLocale|formatDistanceToNow|Intl\./.test(src)) continue;
    const n = countLocaleLess(src, String(f));
    if (n) out[String(f)] = n;
  }
  return out;
}

describe('locale-format ratchet', () => {
  it('recognises the patterns it counts', () => {
    expect(
      countLocaleLess('x.toLocaleString(); d.toLocaleDateString(undefined, {}); d.toLocaleTimeString("en-US");'),
    ).toBe(3);
    expect(countLocaleLess('formatDistanceToNow(d, { addSuffix: true }); formatDistanceToNowStrict(d);')).toBe(2);
    expect(countLocaleLess("new Intl.NumberFormat('en-US'); Intl.DateTimeFormat(undefined, {});")).toBe(2);
  });

  it('does not count formatting that names a locale', () => {
    expect(
      countLocaleLess(
        "n.toLocaleString(locale); d.toLocaleDateString('fr-FR'); new Intl.NumberFormat(i18n.language); Intl.DateTimeFormat().resolvedOptions();",
      ),
    ).toBe(0);
  });

  it('counts a call split over several lines', () => {
    expect(countLocaleLess('x\n.toLocaleString(\n  undefined,\n  { a: 1 },\n)')).toBe(1);
  });

  it('keeps the baseline at 15 or fewer, each with a reason', () => {
    const entries = Object.values(BASELINE);
    expect(entries.reduce((s, [n]) => s + n, 0)).toBeLessThanOrEqual(15);
    for (const [, why] of entries) expect(why.length).toBeGreaterThan(10);
  });

  it('has no file above its baseline and no stale baseline entry', () => {
    const found = scan();
    const problems: string[] = [];
    for (const [file, n] of Object.entries(found)) {
      const allowed = BASELINE[file]?.[0] ?? 0;
      if (n > allowed)
        problems.push(
          `${file}: ${n} locale-less formatting call(s), baseline ${allowed}. Use useLocaleFormat() (React) or formatDate/formatNumber with currentDocumentLocale() (lib/core/format.ts); formatRelativeTime or RelativeTime for "3 days ago".`,
        );
    }
    for (const [file, [allowed]] of Object.entries(BASELINE)) {
      const n = found[file] ?? 0;
      if (n < allowed)
        problems.push(`${file}: baseline ${allowed} but only ${n} remain. Lower or delete its BASELINE entry.`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
