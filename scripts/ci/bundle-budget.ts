/**
 * Bundle budget checker (rewrite R0-T3, docs/full-rewrite-design-2026-07-18.md §2).
 *
 * Measures the BROTLI size of the built client assets and compares the eager
 * entry payload against scripts/ci/perf-budgets.json. Warn-only mode remains
 * resilient so developers can inspect partial local builds. Strict mode is
 * fail-closed: missing output, an unreadable asset, an invalid budget file, or
 * a missing client entry manifest all fail because the budgets could not be
 * proved.
 *
 *   pnpm exec tsx scripts/ci/bundle-budget.ts            # warn-only report
 *   pnpm exec tsx scripts/ci/bundle-budget.ts --strict   # exit 1 if over budget
 *
 * Run after `pnpm run build:frontend` so `.output/` exists.
 */
/* eslint-disable no-console -- CI reporter intentionally writes a human-readable budget table */
import { availableParallelism } from 'node:os';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress } from 'node:zlib';

const STRICT = process.argv.includes('--strict');
const ROOT = process.env.BUNDLE_BUDGET_ROOT || process.cwd();
const brotliCompressAsync = promisify(brotliCompress);

// Brotli is CPU-heavy (the previous synchronous loop took ~60s in CI). Keep a
// small bounded queue so libuv can use the runner's cores without scheduling
// hundreds of compressions at once. The env override is useful on larger
// self-hosted runners; invalid values safely fall back to the default.
const requestedConcurrency = Number.parseInt(process.env.BUNDLE_BUDGET_CONCURRENCY ?? '', 10);
const BROTLI_CONCURRENCY =
  Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? Math.min(requestedConcurrency, 16)
    : Math.max(1, Math.min(availableParallelism(), 4));

type Budgets = { brotli_kb: Record<string, number> };

type ViteManifestEntry = {
  file?: string;
  isEntry?: boolean;
  css?: string[];
};

function loadBudgets(): Budgets {
  const p = path.join(ROOT, 'scripts/ci/perf-budgets.json');
  return JSON.parse(readFileSync(p, 'utf8')) as Budgets;
}

/** Recursively list files under a dir (empty if the dir is missing). */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function brotliSizes(files: string[]): Promise<Map<string, number>> {
  const uniqueFiles = [...new Set(files)];
  const sizes = new Map<string, number>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < uniqueFiles.length) {
      const file = uniqueFiles[nextIndex++];
      try {
        const compressed = await brotliCompressAsync(readFileSync(file));
        sizes.set(file, compressed.length / 1024);
      } catch (error) {
        if (STRICT) {
          throw new Error(
            `unable to measure ${path.relative(ROOT, file)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        console.warn(`bundle-budget: unable to measure ${path.relative(ROOT, file)} (using 0 KB)`);
        sizes.set(file, 0);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BROTLI_CONCURRENCY, uniqueFiles.length) }, () => worker()),
  );
  return sizes;
}

/** Find a vite client manifest (has entries with `.file` + `.isEntry`). */
function findManifest(): Record<string, ViteManifestEntry> | null {
  const candidates = walk(path.join(ROOT, '.output')).filter((f) => f.endsWith('manifest.json'));
  for (const c of candidates) {
    try {
      const j = JSON.parse(readFileSync(c, 'utf8')) as Record<string, ViteManifestEntry>;
      const vals = Object.values(j);
      if (vals.some((v) => v && typeof v === 'object' && 'file' in v && 'isEntry' in v)) {
        return j;
      }
    } catch {
      /* not this one */
    }
  }
  return null;
}

type TanStackRouteAsset = {
  attrs?: { src?: string };
};

type TanStackRouteManifest = {
  preloads?: string[];
  css?: string[];
  scripts?: TanStackRouteAsset[];
};

/**
 * TanStack Start + Nitro does not currently emit Vite's public manifest.json.
 * Its generated server manifest carries the same root entry/preload asset list,
 * so use that as the authoritative fallback.
 */
async function findTanStackEntryAssets(
  outDir: string,
): Promise<{ js: string[]; css: string[] } | null> {
  const serverDir = path.join(ROOT, '.output', 'server');
  const candidates = walk(serverDir).filter(
    (file) => path.basename(file).startsWith('_tanstack-start-manifest') && file.endsWith('.mjs'),
  );

  for (const candidate of candidates) {
    try {
      const module = (await import(pathToFileURL(candidate).href)) as {
        tsrStartManifest?: () => {
          routes?: Record<string, TanStackRouteManifest>;
        };
      };
      const rootRoute = module.tsrStartManifest?.().routes?.__root__;
      if (!rootRoute) continue;
      const urls = [
        ...(rootRoute.preloads ?? []),
        ...(rootRoute.scripts ?? []).map((script) => script.attrs?.src).filter(Boolean),
      ] as string[];
      return {
        js: urls
          .filter((url) => url.endsWith('.js'))
          .map((url) => path.join(outDir, url.replace(/^\/+/, ''))),
        css: (rootRoute.css ?? []).map((url) => path.join(outDir, url.replace(/^\/+/, ''))),
      };
    } catch {
      /* not a usable TanStack Start manifest */
    }
  }
  return null;
}

function fmt(n: number): string {
  return `${n.toFixed(1)} KB`;
}

async function main(): Promise<number> {
  const outDir = path.join(ROOT, '.output', 'public');
  if (!existsSync(outDir)) {
    const message = 'bundle-budget: no .output/public — run `pnpm run build:frontend` first.';
    if (STRICT) {
      console.error(`${message} Strict mode cannot verify budgets.`);
      return 1;
    }
    console.warn(`${message} (skipping)`);
    return 0;
  }
  const budgets = loadBudgets().brotli_kb;
  for (const name of ['platform_shell_eager_js', 'platform_eager_css', 'total_client_js_warn']) {
    const value = budgets[name];
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`invalid or missing positive budget: brotli_kb.${name}`);
    }
  }

  const outputFiles = walk(outDir);
  const allJs = outputFiles.filter((f) => f.endsWith('.js'));
  if (allJs.length === 0) {
    const message = 'bundle-budget: no client JavaScript assets found in .output/public.';
    if (STRICT) {
      console.error(`${message} Strict mode cannot verify budgets.`);
      return 1;
    }
    console.warn(`${message} (skipping)`);
    return 0;
  }

  // Eager payload = root entry/preload chunks (+ root CSS) from the available
  // Vite or TanStack Start manifest.
  const viteManifest = findManifest();
  const eagerJsFiles: string[] = [];
  const eagerCssFiles: string[] = [];
  let manifestSource: 'vite' | 'tanstack-start' | null = null;
  if (viteManifest) {
    manifestSource = 'vite';
    const assetsDir = (() => {
      // manifest `.file` paths are relative to the client build dir; locate it.
      const anyFile = Object.values(viteManifest).find((v) => v?.file)?.file;
      const hit = outputFiles.find((f) =>
        anyFile ? f.endsWith(anyFile.replace(/\//g, path.sep)) : false,
      );
      return hit && anyFile ? hit.slice(0, hit.length - anyFile.length) : outDir;
    })();
    for (const v of Object.values(viteManifest)) {
      if (!v?.isEntry) continue;
      if (v.file) eagerJsFiles.push(path.join(assetsDir, v.file));
      for (const css of v.css ?? []) eagerCssFiles.push(path.join(assetsDir, css));
    }
  } else {
    const tanStackAssets = await findTanStackEntryAssets(outDir);
    if (tanStackAssets) {
      manifestSource = 'tanstack-start';
      eagerJsFiles.push(...tanStackAssets.js);
      eagerCssFiles.push(...tanStackAssets.css);
    }
  }
  if (!manifestSource || eagerJsFiles.length === 0) {
    const message = 'bundle-budget: no usable client entry manifest found.';
    if (STRICT) {
      console.error(`${message} Strict mode cannot verify eager payload budgets.`);
      return 1;
    }
    console.warn(`${message} Reporting totals only.`);
  }

  const compressedSizes = await brotliSizes([...allJs, ...eagerJsFiles, ...eagerCssFiles]);
  const sumSizes = (files: string[]) =>
    [...new Set(files)].reduce((sum, file) => sum + (compressedSizes.get(file) ?? 0), 0);
  const totalJs = sumSizes(allJs);
  const eagerJs = sumSizes(eagerJsFiles);
  const eagerCss = sumSizes(eagerCssFiles);

  const rows: Array<[string, number, number | undefined, boolean]> = [
    ['platform_shell_eager_js', eagerJs, budgets.platform_shell_eager_js, true],
    ['platform_eager_css', eagerCss, budgets.platform_eager_css, true],
    // Whole-site lazy chunks are not a per-navigation cost. Keep this visible as
    // a drift warning without blocking an otherwise healthy candidate.
    ['total_client_js_warn', totalJs, budgets.total_client_js_warn, false],
  ];

  let blockingOver = false;
  let advisoryOver = false;
  console.log('\n  bundle budget (brotli)');
  console.log('  ─────────────────────────────────────────────');
  for (const [name, actual, budget, blocking] of rows) {
    const skip =
      (name === 'platform_shell_eager_js' || name === 'platform_eager_css') && !manifestSource;
    const exceeded = budget != null && !skip && actual > budget;
    const status =
      budget == null || skip ? 'n/a  ' : !exceeded ? 'ok   ' : blocking ? 'OVER ' : 'WARN ';
    if (exceeded && blocking) blockingOver = true;
    if (exceeded && !blocking) advisoryOver = true;
    const budgetStr = budget == null ? '' : `/ ${fmt(budget)}`;
    console.log(`  [${status}] ${name.padEnd(28)} ${fmt(actual).padStart(10)} ${budgetStr}`);
  }
  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${allJs.length} JS chunks · entry manifest ${manifestSource ?? 'not found'}\n`);

  if (blockingOver && STRICT) {
    console.error('bundle-budget: FAIL — a blocking eager-payload budget was exceeded.');
    return 1;
  }
  if (blockingOver) {
    console.warn('bundle-budget: eager payload is over budget (warn-only without --strict).');
  }
  if (advisoryOver) {
    console.warn('bundle-budget: total lazy client surface is over its advisory drift band.');
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = `bundle-budget: unable to produce report: ${
      error instanceof Error ? error.message : String(error)
    }`;
    if (STRICT) {
      console.error(`${message}. Strict mode cannot verify budgets.`);
      process.exit(1);
    }
    console.warn(`${message} (skipping)`);
    process.exit(0);
  });
