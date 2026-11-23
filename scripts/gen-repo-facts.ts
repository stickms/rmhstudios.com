/**
 * Generates `docs/_generated/facts/`: the repository's countable facts (models, routes,
 * namespaces, test files, ...), one JSON file per category, so living docs, CLAUDE.md and
 * coding agents point at generated numbers instead of hand-written ones that rot.
 *
 *     pnpm facts:generate
 *
 * The files are NOT tracked in git (`.gitignore`). Committed, they were the most
 * conflicted file in the repo: every PR that added a test, a component or a route changed
 * the same few lines, so any two open PRs conflicted. Now `pnpm install` and `pnpm dev`
 * (through `pnpm gen`) write them, so a checkout always has numbers that match its own
 * tree, and a merge can never conflict on them.
 *
 * Split by category (`prisma`, `routes`, `i18n`, `tests`, `ui`, `ci`) so a reader opens the
 * one file it needs; `index.json` lists them. Deterministic: no dates, no commit shas,
 * sorted keys. Counted from tracked files (`git ls-files`, which includes staged ones), so
 * the output only changes when the tracked tree does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCALES, NAMESPACES } from '../lib/i18n/config';
import { registeredApiRoutes } from '../lib/api/route-sources';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', '_generated', 'facts');

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

const SCRIPT = 'scripts/gen-repo-facts.ts';

const categories: Record<string, { source: string; facts: Record<string, number> }> = {
  prisma: {
    source: 'prisma/schema/** and prisma/migrations/**',
    facts: {
      prismaEnums: (schema.match(/^enum /gm) ?? []).length,
      prismaMigrations: migrations.size,
      prismaModels: (schema.match(/^model /gm) ?? []).length,
      prismaSchemaLines: schemaTexts.reduce((n, s) => n + lines(s), 0),
    },
  },
  routes: {
    source: 'app/routes/** and the registered API modules (lib/api/route-sources.ts)',
    facts: {
      apiRouteFiles: apiRoutes.length,
      pageRouteFiles: routes.length - apiRoutes.length,
      // Endpoints served by the dispatcher app/routes/api/$.ts from a registered module
      // (lib/api/route.server.ts, third-pass audit AR3); not route files.
      registeredApiEndpoints: registeredApiRoutes(ROOT).length,
      routeFiles: routes.length,
    },
  },
  i18n: {
    source: 'lib/i18n/config.ts',
    facts: { i18nNamespaces: NAMESPACES.length, shippedLocales: LOCALES.length },
  },
  tests: {
    source: '*.test.ts and *.test.tsx',
    facts: { testFiles: tracked('*.test.ts', '*.test.tsx').length },
  },
  ui: {
    source: 'components/**/*.tsx and *.css',
    facts: {
      componentTsxFiles: tracked('components/**/*.tsx').length,
      cssFiles: css.length,
      cssLines: css.reduce((n, f) => n + lines(read(f)), 0),
    },
  },
  ci: {
    source: '.github/workflows/*.yml',
    facts: { workflows: tracked('.github/workflows/*.yml', '.github/workflows/*.yaml').length },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
const write = (name: string, body: unknown) =>
  writeFileSync(join(OUT_DIR, name), JSON.stringify(body, null, 2) + '\n');

for (const [name, { source, facts }] of Object.entries(categories)) {
  write(`${name}.json`, { generatedFrom: `${SCRIPT} (${source})`, ...facts });
}
write('index.json', {
  generatedFrom: `${SCRIPT}; regenerate with \`pnpm facts:generate\` (also run by \`pnpm gen\`, \`pnpm install\` and \`pnpm dev\`)`,
  categories: Object.fromEntries(
    Object.entries(categories).map(([name, { facts }]) => [`${name}.json`, Object.keys(facts)]),
  ),
});
process.stdout.write(`wrote ${OUT_DIR}\n`);
