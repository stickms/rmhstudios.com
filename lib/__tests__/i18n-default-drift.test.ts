import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * A string's `defaultValue` and its English catalog entry must say the same
 * thing — for every namespace.
 *
 * ## Why this is a FOUC gate
 *
 * No English catalog ships in the client entry (until 2026-10-09 the core
 * namespaces did, ~136 KB minified, the largest thing in it). The whole catalog
 * is backfilled after `load` + idle (`backfillEn` in `lib/i18n/instances.ts`),
 * and the server renders without it. So every page renders every English string
 * from its `defaultValue` first — on the server and on the client's first
 * render — and re-renders it from `locales/en/<ns>.json` when the backfill lands. Wherever
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
  dv: string | null;
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
      // `t('key')` with no options at all: nothing to fall back on.
      const bareCall = new RegExp(`(?<![\\w$.])(${names})\\(\\s*(['"])([^'"]+)\\2\\s*\\)`, 'g');
      for (const m of src.matchAll(bareCall)) {
        let ns = fns.get(m[1])!;
        let key = m[3];
        if (key.includes(':')) [ns, key] = key.split(':', 2) as [string, string];
        if (!catalogs.has(ns)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        calls.push({ where: `${full.slice(REPO.length + 1)}:${line}`, ns, key, dv: null, one: null, other: null });
      }
      for (const m of src.matchAll(head)) {
        const open = (m.index ?? 0) + m[0].length - 1;
        const close = objectEnd(src, open);
        if (close < 0) continue;
        const obj = topLevel(src.slice(open, close + 1));
        const dv = prop(obj, 'defaultValue');
        let ns = fns.get(m[1])!;
        let key = m[3];
        if (key.includes(':')) [ns, key] = key.split(':', 2) as [string, string];
        if (!catalogs.has(ns)) continue;
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

describe('i18n: defaults agree with the English catalog', () => {
  const calls = scan();

  it('every call carries a literal default', () => {
    // With no catalog on the critical path a call without one renders its KEY
    // until the backfill lands (and the server renders the key outright).
    //
    // A template-literal default (`Page ${n}`) counts as none: `i18n:extract`
    // cannot read it, so it writes "" into locales/ — and i18next returns an
    // empty catalog string as-is (`returnEmptyString`), so the text went BLANK
    // the moment the catalog loaded. 19 strings in admin, c-library and c-circle
    // did exactly that until 2026-10-09. Interpolate instead: 'Page {{page}}'.
    const bare = calls
      .filter((c) => c.dv === null && c.other === null && c.one === null)
      .map((c) => `${c.where} ${c.ns}:${c.key}`);
    expect(
      bare,
      "pass a literal defaultValue (or defaultValue_one + defaultValue for plurals); interpolate with '{{name}}', never ${}",
    ).toEqual([]);
  });

  it('finds the call sites it is meant to check', () => {
    // A scanner that silently matches nothing passes every assertion below.
    expect(calls.length).toBeGreaterThan(5000);
  });

  it('every defaultValue equals locales/en for its key', () => {
    const drift = calls
      .filter((c) => {
        const v = catalogs.get(c.ns)![c.key];
        return c.dv !== null && typeof v === 'string' && v !== c.dv;
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
      if (c.dv === null && c.other === null && c.one === null) continue; // reported above
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
