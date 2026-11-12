/**
 * Generates `docs/_generated/facts.json`: the repository's countable facts
 * (models, routes, namespaces, test files, ...), so living docs and CLAUDE.md
 * point at one generated file instead of carrying hand-written numbers that rot.
 *
 *     pnpm facts:generate
 *     pnpm facts:check      # exit 1 if facts.json is stale
 *
 * Deterministic on purpose: no dates, no commit shas, sorted keys. Everything is
 * counted from tracked files (`git ls-files`, which includes staged ones), so
 * the output only changes when the tracked tree does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCALES, NAMESPACES } from '../lib/i18n/config';
import { registeredApiRoutes } from '../lib/api/route-sources';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', '_generated', 'facts.json');
const CHECK = process.argv.includes('--check');

function tracked(...patterns: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...patterns], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // A path that is staged for deletion is still listed until committed.
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => existsSync(join(ROOT, f)));
}

const lines = (text: string): number =>
  text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

// The schema is a folder of per-domain files (redesign audit C3).
const schemaFiles = tracked('prisma/schema/**').filter((f) => f.endsWith('.prisma'));
const schemaTexts = schemaFiles.map(read);
const schema = schemaTexts.join('\n');
const routes = tracked('app/routes/**');
const apiRoutes = routes.filter((f) => f.startsWith('app/routes/api/'));
const css = tracked('*.css');
const migrations = new Set(
  tracked('prisma/migrations/**')
    .map((f) => f.split('/')[2])
    .filter((d) => d && d !== 'migration_lock.toml'),
);

const facts = {
  generatedFrom:
    'scripts/gen-repo-facts.ts (tracked files, prisma/schema/**, lib/i18n/config.ts); regenerate with `pnpm facts:generate`, gated by `pnpm facts:check`',
  prismaModels: (schema.match(/^model /gm) ?? []).length,
  prismaEnums: (schema.match(/^enum /gm) ?? []).length,
  prismaSchemaLines: schemaTexts.reduce((n, s) => n + lines(s), 0),
  prismaMigrations: migrations.size,
  routeFiles: routes.length,
  apiRouteFiles: apiRoutes.length,
  // Endpoints served by the dispatcher app/routes/api/$.ts from a registered module
  // (lib/api/route.server.ts, third-pass audit AR3); not route files.
  registeredApiEndpoints: registeredApiRoutes(ROOT).length,
  pageRouteFiles: routes.length - apiRoutes.length,
  i18nNamespaces: NAMESPACES.length,
  shippedLocales: LOCALES.length,
  testFiles: tracked('*.test.ts', '*.test.tsx').length,
  workflows: tracked('.github/workflows/*.yml', '.github/workflows/*.yaml').length,
  componentTsxFiles: tracked('components/**/*.tsx').length,
  cssFiles: css.length,
  cssLines: css.reduce((n, f) => n + lines(read(f)), 0),
};

const next = JSON.stringify(facts, null, 2) + '\n';

if (CHECK) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== next) {
    console.error('docs/_generated/facts.json is stale — run `pnpm facts:generate`');
    process.exit(1);
  }
  process.stdout.write('facts.json is current\n');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, next);
  process.stdout.write(`wrote ${OUT}\n`);
}
