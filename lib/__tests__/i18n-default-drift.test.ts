import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { CORE_NAMESPACES } from '@/lib/i18n/config';

/**
 * A string's `defaultValue` and its English catalog entry must say the same
 * thing — for every namespace that is NOT bundled with the entry.
 *
 * ## Why this is a FOUC gate
 *
 * English ships only the core namespaces (`CORE_NAMESPACES`, plus `c-ui`) in
 * the client entry; the rest of the catalog is backfilled after init
 * (`backfillEnRest` in `lib/i18n/instances.ts`), and the server renders with the
 * core set too. So a game or app page renders every non-core string from its
 * `defaultValue` first — on the server and on the client's first render — and
 * re-renders it from `locales/en/<ns>.json` when the backfill lands. Wherever
 * the two differ, the reader watches the text change after it painted, and when
 * the backfill wins the race with hydration React fails to hydrate outright
 * (#418). Measured on `/rmh-capital` ("Latest Perspectives" → "Insights") and
 * `/rmh-pmc`, whose Command page rendered the HOME page's section headings once
 * the catalog loaded (docs/fouc-audit-2026-10-06.md §21).
 *
 * Nearly all of the 113 keys that drifted were one key shared by two call sites
 * that say different things — the catalog can only hold one of them. CLAUDE.md
 * already states the rule this enforces: new wording is a NEW key.
 *
 * Plural calls are checked too: `defaultValue` must match `<key>_other`, and a
 * key with a `_one` form must pass `defaultValue_one` (i18next ≥21 — the old
 * `defaultValue_plural` suffix is silently ignored, so "1 moves" rendered until
 * the catalog arrived).
 *
 * Only calls this scanner can read are checked: a `t`-family function bound by
 * `const { t } = useTranslation('<ns>')` (or an alias), a literal key, and a
 * literal top-level `defaultValue`. That is the shape the codebase uses; a
 * runtime-built key is invisible here exactly as it is to `i18n:extract`.
 */

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const NON_BUNDLED = (ns: string) =>
  !(CORE_NAMESPACES as readonly string[]).includes(ns) && ns !== 'c-ui';

const catalogs = new Map<string, Record<string, unknown>>();
for (const f of readdirSync(join(REPO, 'locales/en'))) {
  if (f.endsWith('.json')) {
    catalogs.set(f.slice(0, -5), JSON.parse(readFileSync(join(REPO, 'locales/en', f), 'utf8')));
  }
}

/** Decode the body of a JS string literal. */
function decode(s: string): string {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e: string) => {
    if (e.startsWith('u{')) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e.length > 1 && (e[0] === 'u' || e[0] === 'x'))
      return String.fromCharCode(parseInt(e.slice(1), 16));
    return e === 'n' ? '\n' : e === 't' ? '\t' : e;
  });
}

/** Index of the `}` closing the object that opens at `i`, skipping strings. */
function objectEnd(src: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The object's own text, with nested {…} (…) […] blanked — so a defaultValue
 *  inside a nested t() call is not read as this call's. */
function topLevel(obj: string): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i];
    if (quote) {
      if (depth <= 1) out += c;
      if (c === '\\') {
        if (depth <= 1) out += obj[i + 1] ?? '';
        i++;
      } else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
      if (depth <= 1) out += c;
    } else if ('{(['.includes(c)) {
      depth++;
      if (depth <= 1) out += c;
    } else if ('})]'.includes(c)) {
      if (depth <= 1) out += c;
      depth--;
    } else if (depth <= 1) out += c;
  }
  return out;
}

function prop(obj: string, name: string): string | null {
  const m = new RegExp(`(?<![\\w$])${name}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`).exec(
    obj,
  );
  if (!m || (m[1] === '`' && m[2].includes('${'))) return null;
  return decode(m[2]);
}

interface Call {
  where: string;
  ns: string;
  key: string;
  dv: string;
  one: string | null;
  other: string | null;
}

function scan(): Call[] {
  const calls: Call[] = [];
  const bind = /(?:const|let)\s*\{\s*([^{}]*)\}\s*=\s*useTranslation\(\s*['"]([\w-]+)['"]/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.'))
        continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const src = readFileSync(full, 'utf8');
      const fns = new Map<string, string>();
      for (const m of src.matchAll(bind)) {
        for (const part of m[1].split(',').map((p) => p.trim())) {
          if (part === 't') fns.set('t', m[2]);
          else if (part.startsWith('t:')) fns.set(part.slice(2).trim(), m[2]);
        }
      }
      if (!fns.size) continue;
      const names = [...fns.keys()].map((k) => k.replace(/[$]/g, '\\$')).join('|');
      const head = new RegExp(`(?<![\\w$.])(${names})\\(\\s*(['"])([^'"]+)\\2\\s*,\\s*\\{`, 'g');
      for (const m of src.matchAll(head)) {
        const open = (m.index ?? 0) + m[0].length - 1;
        const close = objectEnd(src, open);
        if (close < 0) continue;
        const obj = topLevel(src.slice(open, close + 1));
        const dv = prop(obj, 'defaultValue');
        if (dv === null) continue;
        let ns = fns.get(m[1])!;
        let key = m[3];
        if (key.includes(':')) [ns, key] = key.split(':', 2) as [string, string];
        if (!NON_BUNDLED(ns) || !catalogs.has(ns)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        calls.push({
          where: `${full.slice(REPO.length + 1)}:${line}`,
          ns,
          key,
          dv,
          one: prop(obj, 'defaultValue_one'),
          other: prop(obj, 'defaultValue_other'),
        });
      }
    }
  };
  for (const root of ['app', 'components', 'lib', 'hooks']) walk(join(REPO, root));
  return calls;
}

describe('i18n: defaults agree with the English catalog (non-bundled namespaces)', () => {
  const calls = scan();

  it('finds the call sites it is meant to check', () => {
    // A scanner that silently matches nothing passes every assertion below.
    expect(calls.length).toBeGreaterThan(5000);
  });

  it('every defaultValue equals locales/en for its key', () => {
    const drift = calls
      .filter((c) => {
        const v = catalogs.get(c.ns)![c.key];
        return typeof v === 'string' && v !== c.dv;
      })
      .map(
        (c) =>
          `${c.where} ${c.ns}:${c.key} — code "${c.dv}" vs catalog "${catalogs.get(c.ns)![c.key]}"`,
      );
    expect(drift, 'new wording is a new key — see this test file and CLAUDE.md §i18n').toEqual([]);
  });

  it('every plural call carries the forms its catalog entry has', () => {
    const drift: string[] = [];
    for (const c of calls) {
      const cat = catalogs.get(c.ns)!;
      if (c.key in cat || typeof cat[`${c.key}_other`] !== 'string') continue;
      const other = cat[`${c.key}_other`] as string;
      if ((c.other ?? c.dv) !== other)
        drift.push(`${c.where} ${c.ns}:${c.key}_other — code "${c.other ?? c.dv}" vs "${other}"`);
      const one = cat[`${c.key}_one`];
      if (typeof one === 'string' && (c.one ?? c.dv) !== one) {
        drift.push(
          `${c.where} ${c.ns}:${c.key}_one — code "${c.one ?? c.dv}" vs "${one}" (pass defaultValue_one)`,
        );
      }
    }
    expect(drift).toEqual([]);
  });

  it('nothing uses the pre-v21 defaultValue_plural suffix', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (readFileSync(full, 'utf8').includes('defaultValue_plural'))
            offenders.push(full.slice(REPO.length + 1));
        }
      }
    };
    for (const root of ['app', 'components', 'lib', 'hooks']) walk(join(REPO, root));
    expect(
      offenders,
      'i18next ≥21 ignores defaultValue_plural — use defaultValue_one + defaultValue',
    ).toEqual([]);
  });
});
