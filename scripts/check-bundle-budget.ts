/**
 * OPT-01 — bundle-size budget gate (docs/optimization-ideas-2026-08-05.md).
 *
 * Measures the **critical path**: the transitive STATIC-import closure of the
 * Vite client entry — the set of chunks the browser must have in hand before
 * hydration can start. Fails the build when it grows past budget.
 *
 *   pnpm run check:bundle-budget          # after a build; exit 1 if over budget
 *   pnpm run check:bundle-budget --json   # machine-readable, same exit code
 *
 * Dynamic imports are deliberately NOT followed. The whole point of the
 * 2026-08-04 audit was that async chunks are fine — they load on their own
 * route. Only what the entry pulls in statically is a per-page cost.
 *
 * ── Why this does not read `.vite/manifest.json` ──────────────────────────
 * OPT-01's sketch assumes `.output/public/.vite/manifest.json`. **That file
 * does not exist in this build.** Verified 2026-08-05 against a real
 * `pnpm build`: TanStack Start + Nitro emit no Vite client manifest anywhere
 * under `.output/` (the same finding is recorded in scripts/ci/bundle-budget.ts).
 * The authoritative entry pointer is TanStack Start's generated server
 * manifest, `.output/server/_tanstack-start-manifest_v-*.mjs`, whose
 * `routes.__root__` carries the entry `scripts[]` and its `preloads[]`.
 *
 * A Vite manifest is still preferred when one is present, so this keeps
 * working if a future Vite/Start version starts emitting one.
 *
 * ── Why the closure is walked out of the emitted JS ───────────────────────
 * `routes.__root__.preloads` is NOT the full closure. Measured 2026-08-05: it
 * lists 68 JS chunks where the real transitive static closure is 114 — it
 * under-reports by 46 chunks (e.g. everything `Providers-*.js` reaches:
 * QueryClientProvider, auth-client, the theme/dialog chunks). The closure
 * computed here is a strict superset of `preloads` (0 chunks missing), which
 * is the cross-check that proves the walk is complete.
 *
 * So the walk parses static `import`/`export ... from` specifiers straight out
 * of the emitted chunks — the method docs/performance-audit-2026-08-04.md
 * §"Re-running the measurement" describes.
 */
/* eslint-disable no-console -- CI reporter intentionally writes a human-readable budget table */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const ROOT = process.env.BUNDLE_BUDGET_ROOT || process.cwd();
const OUT_DIR = path.join(ROOT, '.output', 'public');

/**
 * Budgets are the **2026-08-05 measured values + a 5% headroom band**, taken
 * from a real `pnpm build` on this tree.
 *
 * These are NOT the numbers in OPT-01's sketch. That sketch encodes the
 * 2026-08-04 audit's headline (253.6 KB entry / 1028.5 KB raw / 297.6 KB
 * brotli / 94 chunks); main has moved since, and this script's closure is also
 * more complete than the audit's hand-rolled walk (see the header note —
 * `preloads` under-reports by 46 chunks). Measured here, from a real
 * `pnpm build` on the day this gate landed:
 *
 *   | metric                |    measured | this budget | headroom |
 *   | --------------------- | ----------: | ----------: | -------: |
 *   | entry, raw            |   281,907 B |   294,000 B |    +4.3% |
 *   | critical path, raw    | 1,246,997 B | 1,291,000 B |    +3.5% |
 *   | critical path, brotli |   357,570 B |   370,000 B |    +3.5% |
 *   | chunks on the path    |         116 |           — |        — |
 *
 * **2026-08-07 — entry raised 281,000 → 294,000 B (OPT-01 line).** The bytes
 * were bought by the Slice It! feature branch: eight new route modules
 * (`/games/slice-it`, two admin surfaces, the artist page, the chart editor,
 * the developer-API pages) plus the client modules they reach — the chart
 * picker, the library's genre/tag facets, the preview player and the lobby
 * prefetch. `routeTree.gen.ts` imports every route module statically, so a
 * route's top-level imports land here whatever the route is; the two heaviest
 * new bodies (the admin content dashboard and the public hub) are lazy for
 * exactly that reason and are NOT in this number.
 *
 * The band also absorbs ordinary build-to-build variance: three builds of this
 * tree produced entry chunks of 267,233 / 268,726 / 269,212 B (a 0.7% spread),
 * so a much tighter band would be flaky rather than strict.
 *
 * Budgets that only ever move up are theatre. Per OPT-01: raising one requires
 * a line in the PR body naming the user-visible feature that bought the bytes.
 */
const BUDGETS = {
  entryRaw: 294_000,
  criticalPathRaw: 1_291_000,
  criticalPathBrotli: 370_000,
};

/**
 * A build carrying `--sourcemap` (which the entry-composition guard needs)
 * appends a `//# sourceMappingURL=` line to every chunk. Those bytes are a
 * build-flag artifact, not shipped weight, so they are stripped before
 * measuring — that keeps the numbers identical whether or not the build that
 * produced `.output/` emitted maps.
 */
const SOURCE_MAPPING_URL = /\n?\/\/# sourceMappingURL=.*[ \t]*$/;

/** Static `import "x"` — the trailing quote is what excludes `import("x")`. */
const STATIC_BARE_IMPORT = /\bimport\s*["']([^"']+)["']/g;
/** Static `import ... from "x"` and `export ... from "x"`. */
const STATIC_FROM_IMPORT = /\bfrom\s*["']([^"']+)["']/g;

export function readChunk(outDir: string, relFile: string): Buffer {
  const text = readFileSync(path.join(outDir, relFile), 'utf8').replace(SOURCE_MAPPING_URL, '');
  return Buffer.from(text, 'utf8');
}

/**
 * Static import specifiers of one emitted chunk, resolved to output-relative
 * paths. Specifiers that are not relative, or that do not resolve to a file
 * that exists, are dropped — which is what makes the regex scan safe. Verified
 * 2026-08-05 across all 1,574 emitted assets: of 6,640 `from "…"` matches only
 * a handful sit inside string literals (`from "srgb-linear"`, `from "${e}"`,
 * `{from:N()}`), and every one of them fails both filters.
 */
export function staticImportsOf(outDir: string, relFile: string): Set<string> {
  const src = readFileSync(path.join(outDir, relFile), 'utf8');
  const dir = path.posix.dirname(relFile);
  const found = new Set<string>();
  for (const re of [STATIC_BARE_IMPORT, STATIC_FROM_IMPORT]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(src)) !== null) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const rel = path.posix.normalize(path.posix.join(dir, spec));
      if (existsSync(path.join(outDir, rel))) found.add(rel);
    }
  }
  return found;
}

/**
 * Transitive static closure of `entry`, plus the chunk-level import chain that
 * reached each member (used by the composition guard to explain a failure).
 */
export function staticClosure(
  outDir: string,
  entry: string,
): { files: string[]; reachedFrom: Map<string, string> } {
  const seen = new Set([entry]);
  const reachedFrom = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dep of staticImportsOf(outDir, current)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      reachedFrom.set(dep, current);
      queue.push(dep);
    }
  }
  return { files: [...seen], reachedFrom };
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

type ViteManifestEntry = { file?: string; isEntry?: boolean };

/** A Vite client manifest, if this build ever emits one (it does not today). */
function findViteEntry(outDir: string): string | null {
  for (const candidate of walkFiles(outDir).filter((f) => f.endsWith('manifest.json'))) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as Record<
        string,
        ViteManifestEntry
      >;
      const entry = Object.values(parsed).find((v) => v && v.isEntry && v.file);
      if (entry?.file && existsSync(path.join(outDir, entry.file))) return entry.file;
    } catch {
      /* not a Vite manifest — keep looking */
    }
  }
  return null;
}

type TanStackRoute = { preloads?: string[]; scripts?: Array<{ attrs?: { src?: string } }> };

/**
 * TanStack Start's generated server manifest is the authoritative entry
 * pointer in this build. `routes.__root__.scripts[0].attrs.src` is the module
 * script the document actually loads.
 */
async function findTanStackEntry(outDir: string): Promise<string | null> {
  const serverDir = path.join(ROOT, '.output', 'server');
  const candidates = walkFiles(serverDir).filter(
    (f) => path.basename(f).startsWith('_tanstack-start-manifest') && f.endsWith('.mjs'),
  );
  for (const candidate of candidates) {
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as {
        tsrStartManifest?: () => { routes?: Record<string, TanStackRoute> };
      };
      const root = mod.tsrStartManifest?.().routes?.__root__;
      if (!root) continue;
      const src =
        (root.scripts ?? []).map((s) => s.attrs?.src).find((s) => s?.endsWith('.js')) ??
        (root.preloads ?? []).find((p) => p.endsWith('.js'));
      if (!src) continue;
      const rel = src.replace(/^\/+/, '');
      if (existsSync(path.join(outDir, rel))) return rel;
    } catch {
      /* not a usable Start manifest — keep looking */
    }
  }
  return null;
}

export async function findClientEntry(outDir: string): Promise<string> {
  const entry = findViteEntry(outDir) ?? (await findTanStackEntry(outDir));
  if (!entry) {
    throw new Error(
      'no client entry found. Looked for a Vite manifest under .output/public and for ' +
        '.output/server/_tanstack-start-manifest_v-*.mjs. Run `pnpm run build:frontend` first.',
    );
  }
  return entry;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main(): Promise<number> {
  if (!existsSync(OUT_DIR)) {
    console.error(
      `check-bundle-budget: no ${path.relative(ROOT, OUT_DIR)} — run \`pnpm run build:frontend\` first.`,
    );
    return 1;
  }

  const entry = await findClientEntry(OUT_DIR);
  const { files } = staticClosure(OUT_DIR, entry);

  let raw = 0;
  let brotli = 0;
  for (const file of files) {
    const buf = readChunk(OUT_DIR, file);
    raw += buf.length;
    brotli += brotliCompressSync(buf).length;
  }
  const entryRaw = readChunk(OUT_DIR, entry).length;

  const rows: Array<[string, number, number]> = [
    ['entry, raw', entryRaw, BUDGETS.entryRaw],
    ['critical path, raw', raw, BUDGETS.criticalPathRaw],
    ['critical path, brotli', brotli, BUDGETS.criticalPathBrotli],
  ];

  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          entry,
          chunks: files.length,
          entryRaw,
          criticalPathRaw: raw,
          criticalPathBrotli: brotli,
          budgets: BUDGETS,
        },
        null,
        2,
      ),
    );
  }

  let failed = false;
  console.log('\n  bundle budget — transitive STATIC closure of the client entry');
  console.log('  ──────────────────────────────────────────────────────────────');
  for (const [label, actual, budget] of rows) {
    const ok = actual <= budget;
    if (!ok) failed = true;
    const delta = (actual / budget - 1) * 100;
    const sign = delta >= 0 ? '+' : '';
    console.log(
      `  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(22)} ${kb(actual).padStart(10)}` +
        ` / ${kb(budget).padStart(10)} budget (${sign}${delta.toFixed(1)}%)`,
    );
  }
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(`  entry: ${entry}`);
  console.log(`  chunks on the critical path: ${files.length}\n`);

  if (failed) {
    console.error(
      'check-bundle-budget: FAIL — the critical path is over budget.\n' +
        '  The critical path is what every page must download and parse before it can\n' +
        '  hydrate, so this is a per-page cost on every route of the site.\n' +
        '  Usual cause: a module the shell reaches (__root.tsx / Providers.tsx /\n' +
        '  _site.tsx, or anything a route module touches at TOP LEVEL) started\n' +
        '  importing a library it only needs lazily. `routeTree.gen.ts` imports all\n' +
        '  739 route modules statically, so a top-level import in ANY route module\n' +
        '  lands on every page. See docs/performance-audit-2026-08-04.md.\n' +
        '  Run `pnpm run check:entry-composition` to see which packages are in there.\n' +
        '  Raising a budget requires a PR-body line naming the feature that bought\n' +
        '  the bytes (OPT-01).',
    );
    return 1;
  }
  return 0;
}

/** Only run the CLI when invoked directly — the guard imports the helpers above. */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        `check-bundle-budget: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}

export { BUDGETS };
