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
import { brotliCompressSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const STRICT = process.argv.includes('--strict');
const ROOT = process.cwd();

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

function brotliKb(file: string): number {
  try {
    return brotliCompressSync(readFileSync(file)).length / 1024;
  } catch {
    return 0;
  }
}

/** Find a vite client manifest (has entries with `.file` + `.isEntry`). */
function findManifest(): Record<string, any> | null {
  const candidates = walk(path.join(ROOT, '.output')).filter((f) =>
    f.endsWith('manifest.json'),
  );
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

function main(): number {
  const outDir = path.join(ROOT, '.output', 'public');
  if (!existsSync(outDir)) {
    console.log('bundle-budget: no .output/public — run `pnpm run build:frontend` first. (skipping)');
    return 0;
  }
  const budgets = loadBudgets().brotli_kb;

  const allJs = walk(outDir).filter((f) => f.endsWith('.js'));
  const totalJs = allJs.reduce((s, f) => s + brotliKb(f), 0);

  // Eager payload = entry chunks (+ their CSS) from the manifest, if we can find it.
  const manifest = findManifest();
  let eagerJs = 0;
  let eagerCss = 0;
  if (manifest) {
    const assetsDir = (() => {
      // manifest `.file` paths are relative to the client build dir; locate it.
      const anyFile = (Object.values(manifest) as any[]).find((v) => v?.file)?.file as string;
      const hit = walk(outDir).find((f) => anyFile && f.endsWith(anyFile.replace(/\//g, path.sep)));
      return hit ? hit.slice(0, hit.length - anyFile.length) : outDir;
    })();
    for (const v of Object.values(manifest) as any[]) {
      if (!v?.isEntry) continue;
      if (v.file) eagerJs += brotliKb(path.join(assetsDir, v.file));
      for (const css of v.css ?? []) eagerCss += brotliKb(path.join(assetsDir, css));
    }
  } else {
    console.log('bundle-budget: no vite manifest found; reporting totals only.');
  }

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
    const status =
      budget == null || skip ? 'n/a  ' : actual <= budget ? 'ok   ' : 'OVER ';
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

process.exit(main());
