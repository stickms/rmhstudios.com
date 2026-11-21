/* eslint-disable no-console -- This CLI reports what it collected to the terminal. */
/**
 * Collect every translation already paid for on the `i18n/*` branches into one
 * `locales/`-shaped directory, for `translate-locales.ts` to reuse (I18N_REUSE_DIR).
 *
 * The translation workflow before the `i18n/catalogs` branch left one branch
 * per run (`i18n/auto-translate*`) whose paid output never merged. Each holds
 * translations with the English they were made from
 * (`.sources.<ns>.json`); the translator adopts any whose English is still
 * today's English, so none of them is paid for again.
 *
 * Refs are read newest first and the first translation of a key wins. Only the
 * object database is read (`git ls-tree` + one `git cat-file --batch`), so
 * nothing is checked out and blobs shared between branches are read once.
 *
 * Usage: pnpm exec tsx scripts/i18n-collect-reuse.ts <out-dir> [ref ...]
 *        (no refs: every refs/remotes/origin/i18n/* ref, newest first)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Catalog = Record<string, string>;

const [out, ...given] = process.argv.slice(2);
if (!out) throw new Error('usage: i18n-collect-reuse.ts <out-dir> [ref ...]');

const git = (args: string[], input?: string): Buffer =>
  execFileSync('git', args, {
    input,
    maxBuffer: 1 << 30,
  });

const refs = given.length
  ? given
  : git(['for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/remotes/origin/i18n'])
      .toString()
      .split('\n')
      .filter(Boolean);

/** Per ref: locale/namespace -> the blob ids of its catalog and its sources. */
const trees = refs.map((ref) => {
  const pairs = new Map<
    string,
    {
      target?: string;
      sources?: string;
    }
  >();
  for (const line of git(['ls-tree', '-r', ref, 'locales']).toString().split('\n')) {
    const m = /^\d+ blob ([0-9a-f]+)\tlocales\/([^/]+)\/(\.sources\.)?([^/]+)\.json$/.exec(line);
    if (!m) continue;
    const [, sha, locale, isSources, ns] = m;
    const id = `${locale}/${ns}`;
    const pair = pairs.get(id) ?? {};
    pair[isSources ? 'sources' : 'target'] = sha;
    pairs.set(id, pair);
  }
  return pairs;
});

const wanted = new Set<string>();
for (const pairs of trees) {
  for (const { target, sources } of pairs.values()) {
    if (target && sources) wanted.add(target).add(sources);
  }
}

/** Read every wanted blob through one `git cat-file --batch`. */
const blobs = new Map<string, unknown>();
const batch = git(['cat-file', '--batch'], [...wanted].join('\n') + '\n');
for (let at = 0; at < batch.length;) {
  const eol = batch.indexOf(0x0a, at);
  const [sha, , size] = batch.subarray(at, eol).toString().split(' ');
  const start = eol + 1;
  const end = start + Number(size);
  try {
    blobs.set(sha, JSON.parse(batch.subarray(start, end).toString('utf8')));
  } catch {
    // A malformed catalog on an old branch is skipped, not fatal.
  }
  at = end + 1;
}

const merged = new Map<
  string,
  {
    target: Catalog;
    sources: Catalog;
  }
>();
for (const pairs of trees) {
  for (const [id, { target, sources }] of pairs) {
    if (!target || !sources) continue;
    const t = blobs.get(target) as Record<string, unknown> | undefined;
    const s = blobs.get(sources) as Record<string, unknown> | undefined;
    if (!t || !s || typeof t !== 'object' || typeof s !== 'object') continue;
    const into = merged.get(id) ?? {
      target: {},
      sources: {},
    };
    for (const [key, english] of Object.entries(s)) {
      const text = t[key];
      if (key in into.sources || typeof english !== 'string') continue;
      if (typeof text !== 'string' || !text.trim()) continue;
      into.target[key] = text;
      into.sources[key] = english;
    }
    merged.set(id, into);
  }
}

let entries = 0;
for (const [id, { target, sources }] of merged) {
  const [locale, ns] = id.split('/');
  mkdirSync(join(out, locale), {
    recursive: true,
  });
  writeFileSync(join(out, locale, `${ns}.json`), JSON.stringify(target));
  writeFileSync(join(out, locale, `.sources.${ns}.json`), JSON.stringify(sources));
  entries += Object.keys(sources).length;
}
console.log(`[i18n] collected ${entries} paid translation(s) in ${merged.size} catalog(s) from ${refs.length} ref(s)`);
