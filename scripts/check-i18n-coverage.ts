/* eslint-disable no-console -- this is a CLI reporting script; stdout is the output */
/**
 * i18n key-coverage report.
 *
 * Compares every locale under locales/<lang>/ against the English reference
 * (locales/en) and reports, per locale, how many translation keys are present
 * vs. missing across all namespaces. Untranslated strings are otherwise
 * invisible (they silently fall back to English), so this surfaces them.
 *
 *   pnpm i18n:coverage            # print a coverage table, always exit 0
 *   pnpm i18n:coverage --strict   # exit 1 if any locale is below --min (default 90%)
 *   pnpm i18n:coverage --min 95   # set the threshold used by --strict
 *   pnpm i18n:coverage --list ar  # also list the missing keys for a locale
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'locales');
const REF = 'en';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const minIdx = args.indexOf('--min');
const minPct = minIdx >= 0 ? Number(args[minIdx + 1]) : 90;
const listIdx = args.indexOf('--list');
const listLocale = listIdx >= 0 ? args[listIdx + 1] : null;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Collect dot-paths of all leaf (string) keys in a nested object. */
function leafPaths(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) leafPaths(v, path, out);
      else out.push(path);
    }
  }
  return out;
}

function hasPath(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[part];
    if (cur === undefined) return false;
  }
  // Treat empty strings as missing (untranslated placeholder).
  return !(typeof cur === 'string' && cur.trim() === '');
}

const refDir = resolve(ROOT, REF);
const namespaces = readdirSync(refDir).filter((f) => f.endsWith('.json'));

// Build the reference key set per namespace.
const refKeys = new Map<string, string[]>();
let refTotal = 0;
for (const ns of namespaces) {
  const keys = leafPaths(readJson(resolve(refDir, ns)));
  refKeys.set(ns, keys);
  refTotal += keys.length;
}

const locales = readdirSync(ROOT)
  .filter((d) => statSync(resolve(ROOT, d)).isDirectory() && d !== REF)
  .sort();

interface Row {
  locale: string;
  present: number;
  missing: number;
  pct: number;
  missingByNs: Map<string, string[]>;
}

const rows: Row[] = [];
for (const locale of locales) {
  const dir = resolve(ROOT, locale);
  let present = 0;
  const missingByNs = new Map<string, string[]>();
  for (const ns of namespaces) {
    const data = readJson(resolve(dir, ns));
    const missing: string[] = [];
    for (const key of refKeys.get(ns)!) {
      if (data && hasPath(data, key)) present += 1;
      else missing.push(key);
    }
    if (missing.length) missingByNs.set(ns, missing);
  }
  const missing = refTotal - present;
  rows.push({ locale, present, missing, pct: refTotal ? (present / refTotal) * 100 : 100, missingByNs });
}

rows.sort((a, b) => a.pct - b.pct);

console.log(`\ni18n coverage vs. "${REF}"  (${refTotal} keys across ${namespaces.length} namespaces)\n`);
console.log('  locale    coverage     missing');
console.log('  ------    --------     -------');
for (const r of rows) {
  const bar = `${r.pct.toFixed(1)}%`.padStart(6);
  console.log(`  ${r.locale.padEnd(8)}  ${bar}       ${r.missing}`);
}

if (listLocale) {
  const r = rows.find((x) => x.locale === listLocale);
  if (r) {
    console.log(`\nMissing keys for "${listLocale}":`);
    for (const [ns, keys] of r.missingByNs) {
      for (const k of keys) console.log(`  ${ns} → ${k}`);
    }
  } else {
    console.log(`\n(no locale "${listLocale}")`);
  }
}

const below = rows.filter((r) => r.pct < minPct);
if (below.length) {
  console.log(`\n${below.length} locale(s) below ${minPct}%: ${below.map((r) => r.locale).join(', ')}`);
}

if (strict && below.length) {
  console.error(`\nFAIL (--strict): locales below ${minPct}%.`);
  process.exit(1);
}
console.log('');
