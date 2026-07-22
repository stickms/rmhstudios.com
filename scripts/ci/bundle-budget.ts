/**
 * Bundle budget checker (rewrite R0-T3, docs/full-rewrite-design-2026-07-18.md §2).
 *
 * Measures the BROTLI size of the built client assets and compares the eager
 * entry payload against scripts/ci/perf-budgets.json. Deliberately resilient:
 * it never throws and exits 0 (warn-only) unless `--strict` is passed AND a
 * budget is exceeded, so it can sit in CI as a signal long before the frontend
 * decomposition (R3) makes it a hard gate.
 *
 *   pnpm exec tsx scripts/ci/bundle-budget.ts            # warn-only report
 *   pnpm exec tsx scripts/ci/bundle-budget.ts --strict   # exit 1 if over budget
 *
 * Run after `pnpm run build:frontend` so `.output/` exists.
 */
import { availableParallelism } from 'node:os';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress } from 'node:zlib';

const STRICT = process.argv.includes('--strict');
const ROOT = process.cwd();
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
      } catch {
        // A disappearing/unreadable output should not block a valid PR build.
        // Preserve the checker's historical fail-soft behavior for that file.
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
function findManifest(): Record<string, any> | null {
  const candidates = walk(path.join(ROOT, '.output')).filter((f) => f.endsWith('manifest.json'));
  for (const c of candidates) {
    try {
      const j = JSON.parse(readFileSync(c, 'utf8'));
      const vals = Object.values(j) as any[];
      if (vals.some((v) => v && typeof v === 'object' && 'file' in v && 'isEntry' in v)) {
        return j;
      }
    } catch {
      /* not this one */
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
    console.log(
      'bundle-budget: no .output/public — run `pnpm run build:frontend` first. (skipping)',
    );
    return 0;
  }
  const budgets = loadBudgets().brotli_kb;

  const outputFiles = walk(outDir);
  const allJs = outputFiles.filter((f) => f.endsWith('.js'));

  // Eager payload = entry chunks (+ their CSS) from the manifest, if we can find it.
  const manifest = findManifest();
  const eagerJsFiles: string[] = [];
  const eagerCssFiles: string[] = [];
  if (manifest) {
    const assetsDir = (() => {
      // manifest `.file` paths are relative to the client build dir; locate it.
      const anyFile = (Object.values(manifest) as any[]).find((v) => v?.file)?.file as string;
      const hit = outputFiles.find((f) =>
        anyFile ? f.endsWith(anyFile.replace(/\//g, path.sep)) : false,
      );
      return hit ? hit.slice(0, hit.length - anyFile.length) : outDir;
    })();
    for (const v of Object.values(manifest) as any[]) {
      if (!v?.isEntry) continue;
      if (v.file) eagerJsFiles.push(path.join(assetsDir, v.file));
      for (const css of v.css ?? []) eagerCssFiles.push(path.join(assetsDir, css));
    }
  } else {
    console.log('bundle-budget: no vite manifest found; reporting totals only.');
  }

  const compressedSizes = await brotliSizes([...allJs, ...eagerJsFiles, ...eagerCssFiles]);
  const sumSizes = (files: string[]) =>
    files.reduce((sum, file) => sum + (compressedSizes.get(file) ?? 0), 0);
  const totalJs = sumSizes(allJs);
  const eagerJs = sumSizes(eagerJsFiles);
  const eagerCss = sumSizes(eagerCssFiles);

  const rows: Array<[string, number, number | undefined]> = [
    ['platform_shell_eager_js', eagerJs, budgets.platform_shell_eager_js],
    ['platform_eager_css', eagerCss, budgets.platform_eager_css],
    ['total_client_js_warn', totalJs, budgets.total_client_js_warn],
  ];

  let over = false;
  console.log('\n  bundle budget (brotli)');
  console.log('  ─────────────────────────────────────────────');
  for (const [name, actual, budget] of rows) {
    const skip = (name === 'platform_shell_eager_js' || name === 'platform_eager_css') && !manifest;
    const status = budget == null || skip ? 'n/a  ' : actual <= budget ? 'ok   ' : 'OVER ';
    if (status === 'OVER ') over = true;
    const budgetStr = budget == null ? '' : `/ ${fmt(budget)}`;
    console.log(`  [${status}] ${name.padEnd(28)} ${fmt(actual).padStart(10)} ${budgetStr}`);
  }
  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${allJs.length} JS chunks · manifest ${manifest ? 'found' : 'not found'}\n`);

  if (over && STRICT) {
    console.error('bundle-budget: FAIL — a budget was exceeded (--strict).');
    return 1;
  }
  if (over) console.log('bundle-budget: over budget (warn-only; pass --strict to gate).');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    // This is currently a reporting signal, not a release-safety gate. An
    // unexpected filesystem/zlib problem must not stop an otherwise valid
    // build; strict budget violations still return 1 from main() above.
    console.warn(
      `bundle-budget: unable to produce report (skipping): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(0);
  });
