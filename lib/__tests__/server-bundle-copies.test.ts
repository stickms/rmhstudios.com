/**
 * The Dockerfile's `server-builder` stage copies a *curated subset* of `lib/`
 * — deliberately, so that editing a component doesn't bust the layer cache for
 * a bundle that never imported it.
 *
 * The cost of that is a gap nothing else covers: `pnpm build` runs esbuild
 * against the whole working tree, so it resolves every import regardless of
 * what the image would have contained. A server file can gain an import of a
 * `lib/` module that isn't copied, pass typecheck, pass lint, pass the test
 * suite, pass `pnpm build` — and then fail the image build on main, after the
 * PR has already merged. That is exactly how it failed once.
 *
 * So this walks the real import graph from the Dockerfile's own entrypoints
 * and asserts every `lib/` file it reaches is covered by a COPY in that stage.
 * It reads the entrypoints and the COPY list out of the Dockerfile rather than
 * duplicating either, so the check can't drift from what actually gets built.
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
 * under-reports and this check starts failing on files that ARE copied:
 * a directory (`COPY lib/rmhbox ./lib/rmhbox/`), a single file
 * (`COPY lib/url.ts ./lib/url.ts`), and several sources into one destination
 * (`COPY tsconfig.json tsconfig.server.json ./`). In Docker's form the LAST
 * token is always the destination and everything before it is a source.
 */
const copied: string[] = [...stage.matchAll(/^COPY\s+(.+)$/gm)]
  .flatMap((m) => {
    const tokens = m[1].trim().split(/\s+/);
    // Skip flags like `--from=…`, then drop the destination.
    return tokens.filter((t) => !t.startsWith('--')).slice(0, -1);
  })
  .filter((src) => src.startsWith('lib/') || src === 'server');

/** The entrypoints this stage actually bundles, read off its esbuild command. */
const entrypoints: string[] = [...stage.matchAll(/(server\/[\w-]+\/index\.ts)/g)].map((m) => m[1]);

/* ─── Walk the import graph ─────────────────────────────────────────────── */

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js'];

/**
 * Resolve a specifier the way the image build's esbuild does, or `null` when
 * the import never enters the bundle.
 *
 * Relative specifiers are bundled. Everything else is not — including `@/…`:
 * neither tsconfig declares a `baseUrl`, so esbuild does not apply the `paths`
 * map and treats `@/lib/x` as a bare package name, which `--packages=external`
 * then leaves as a literal `require("@/lib/x")` in the output. Following those
 * here would flag modules the bundle never actually pulls in.
 *
 * (That externalisation is its own, older problem — those requires would throw
 * if the code path ran — but it is not what this test is guarding, and
 * modelling it any other way would make this check disagree with the build it
 * is supposed to predict.)
 */
function resolveImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);

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
    expect(copied.filter((c) => c.startsWith('lib/')).length).toBeGreaterThan(0);
  });

  it('copies every lib/ module the server bundles reach', () => {
    const missing = [...reachableFiles()]
      .map((file) => relative(ROOT, file).split('\\').join('/'))
      .filter((rel) => rel.startsWith('lib/'))
      .filter((rel) => !isCopied(rel))
      .sort();

    expect(
      missing,
      missing.length
        ? `\nThese lib/ modules are imported by a server bundle but are NOT copied into\n` +
            `the Dockerfile's \`server-builder\` stage, so the production image build will\n` +
            `fail with "Could not resolve" even though every local check passes:\n\n` +
            missing.map((m) => `  • ${m}`).join('\n') +
            `\n\nAdd a COPY for each in Dockerfile (a single file if the module is\n` +
            `import-free, the directory if it pulls in siblings), and keep the comment\n` +
            `explaining which service needs it.\n`
        : '',
    ).toEqual([]);
  });
});
