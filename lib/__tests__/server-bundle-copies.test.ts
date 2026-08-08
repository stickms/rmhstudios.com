/**
 * The Dockerfile's `server-builder` stage builds the six Node service bundles
 * from a SUBSET of the repo — `server/` and `lib/`, not the whole tree. That
 * subset is a build-context boundary nothing else in the toolchain sees:
 * `pnpm build` runs esbuild against the full working tree, so it resolves every
 * import regardless of what the image would have contained. A server file can
 * gain an import of a module outside the copied set, pass typecheck, pass lint,
 * pass the test suite, pass `pnpm build` — and then break on main, after the PR
 * has already merged.
 *
 * And the breakage is not loud. An `@/…` import of an uncopied module doesn't
 * stop esbuild: the `paths` map misses, the specifier falls back to looking like
 * a bare package name, and `--packages=external` emits a literal
 * `require("@/…")` into the bundle. Nothing is reported at build time; the
 * module throws `MODULE_NOT_FOUND` the moment it is loaded, which for a
 * top-level import is the instant the service starts. That is how the whole
 * socket hub — every casino table, every multiplayer game — once shipped dead.
 * (A relative specifier fails loudly instead, with "Could not resolve", which is
 * why server code should prefer one. The graph has to be walked either way,
 * because a single `@/…` hop hides everything below it too.)
 *
 * So this walks the real import graph from the Dockerfile's own entrypoints and
 * asserts every repo file it reaches is covered by a COPY in that stage. It
 * reads the entrypoints AND the COPY list out of the Dockerfile rather than
 * duplicating either, which is what makes it strategy-agnostic: the stage used
 * to copy a curated per-module list of ~83 `lib/` paths and now copies `lib/`
 * wholesale, and this check is the correct check under both. If someone narrows
 * it back for cache-granularity reasons, the walk starts failing on whatever
 * that narrowing orphans — no edit needed here.
 *
 * Note the scope is every reached file, not just `lib/`. Copying `lib/` whole
 * makes an uncopied `lib/` module impossible, but it does nothing about a server
 * file importing `@/components/…`, `@/stores/…` or `@/hooks/…` — which is the
 * same silent `require("@/…")` failure, out of a directory this stage has never
 * copied and never should.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, join, relative, posix } from 'path';

const ROOT = resolve(__dirname, '../..');
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf-8');

/* ─── Read the stage out of the Dockerfile ──────────────────────────────── */

/** The `FROM … AS server-builder` block, up to the next `FROM`. */
function serverBuilderStage(): string {
  const start = dockerfile.indexOf('AS server-builder');
  expect(start, 'Dockerfile has no `server-builder` stage').toBeGreaterThan(-1);
  const rest = dockerfile.slice(start);
  const next = rest.indexOf('\nFROM ');
  return next === -1 ? rest : rest.slice(0, next);
}

const stage = serverBuilderStage();

/**
 * Repo-relative source paths the stage copies in.
 *
 * Three forms appear, and the parser has to handle all of them or it silently
 * under-reports and this check starts failing on files that ARE copied: a
 * directory (`COPY lib ./lib/`), a single file (`COPY lib/url.ts ./lib/url.ts`),
 * and several sources into one destination
 * (`COPY tsconfig.json tsconfig.server.json ./`). In Docker's form the LAST
 * token is always the destination and everything before it is a source.
 */
const copied: string[] = [...stage.matchAll(/^COPY\s+(.+)$/gm)].flatMap((m) => {
  const tokens = m[1].trim().split(/\s+/);
  // Skip flags like `--from=…`, then drop the destination.
  return tokens.filter((t) => !t.startsWith('--')).slice(0, -1);
});

/** The entrypoints this stage actually bundles, read off its esbuild command. */
const entrypoints: string[] = [...stage.matchAll(/(server\/[\w-]+\/index\.ts)/g)].map((m) => m[1]);

/* ─── Walk the import graph ─────────────────────────────────────────────── */

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js'];

/**
 * Resolve a specifier the way the image build's esbuild does, or `null` when
 * the import never enters the bundle (a real package, a `node:` builtin).
 *
 * `@/…` is followed because esbuild applies the `paths` map in
 * `tsconfig.server.json`, so `@/lib/x` resolves to `lib/x.ts` and is pulled in
 * exactly like `../../lib/x` would be.
 */
function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const index = join(base, 'index' + ext);
      if (existsSync(index)) return index;
    }
  }
  // A `.ts` specifier written with its extension, or a genuinely missing file.
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/** Static + dynamic imports, and `export … from`. */
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;

/** Every file reachable from the entrypoints, as absolute paths. */
function reachableFiles(): Set<string> {
  const seen = new Set<string>();
  const queue = entrypoints.map((e) => join(ROOT, e));

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let source: string;
    try {
      source = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
}

/** Is this repo-relative path inside something the stage copied? */
function isCopied(relPath: string): boolean {
  return copied.some((src) => relPath === src || relPath.startsWith(src + posix.sep));
}

/* ─── The check ─────────────────────────────────────────────────────────── */

describe('Dockerfile server-builder copies everything the bundles import', () => {
  it('reads its entrypoints and COPY list from the Dockerfile', () => {
    // If either extraction breaks, the check below would silently pass on an
    // empty graph — which is worse than failing.
    expect(entrypoints.length).toBeGreaterThan(0);
    expect(copied).toContain('server');
    expect(copied.length).toBeGreaterThan(1);
  });

  it('copies every module the server bundles reach', () => {
    const missing = [...reachableFiles()]
      .map((file) => relative(ROOT, file).split('\\').join('/'))
      .filter((rel) => !isCopied(rel))
      .sort();

    expect(
      missing,
      missing.length
        ? `\nThese modules are imported by a server bundle but are NOT copied into\n` +
            `the Dockerfile's \`server-builder\` stage. An \`@/…\` import of one does not\n` +
            `fail the image build — it becomes a literal require() that throws\n` +
            `MODULE_NOT_FOUND when the service starts:\n\n` +
            missing.map((m) => `  • ${m}`).join('\n') +
            `\n\nEither add a COPY for each in Dockerfile, or (usually better) move the\n` +
            `shared code into lib/ — the stage copies server/ and lib/ wholesale, so a\n` +
            `hit here almost always means a server file reached into components/,\n` +
            `stores/ or hooks/, which the image has never carried.\n`
        : '',
    ).toEqual([]);
  });
});
