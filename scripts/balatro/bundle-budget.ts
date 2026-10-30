/**
 * Balatro multiplayer bundle and pack budgets (PLAN §6.4), asserted in CI by
 * .github/workflows/balatro-mp-tests.yml ("Bundle budget"):
 *
 *   node_modules/.bin/tsx scripts/balatro/bundle-budget.ts            # check, exit 1 on a breach
 *   node_modules/.bin/tsx scripts/balatro/bundle-budget.ts --json     # the measurements as JSON
 *   node_modules/.bin/tsx scripts/balatro/bundle-budget.ts --record --ref <git ref>
 *       # re-measure the single-player baseline from a commit's tree (not the working
 *       # tree) and write scripts/balatro/bundle-budget.json — only when the baseline
 *       # itself is meant to move (say so in the commit message)
 *
 * What is measured:
 * 1. The single-player route chunk: an esbuild build of components/balatro/BalatroPage.tsx
 *    (shell packages external — SHELL_EXTERNALS —, code splitting, minified, `@/` resolved, CSS ignored) — the
 *    entry chunk plus every chunk it imports statically, gzipped. Its delta vs the
 *    recorded pre-MP baseline must be ≤ 2.5 KB. No module under lib/balatro/mp/ or
 *    lib/shared/p2p/ may be in that static closure (type-only imports vanish).
 * 2. The MP JS chunk: every chunk reachable from the entry only through dynamic
 *    `import()` (the MP toolbar, the pack loader and everything behind them), gzipped
 *    per chunk and summed: ≤ 70 KB; of which lib/shared/p2p ≤ 15 KB (apportioned by
 *    each module's share of its chunk's bytes — an estimate, since gzip is per chunk).
 * 3. The test surface never ships: with VITE_BALATRO_MP_TEST unset, no output
 *    contains `__balatroMp` (lib/balatro/mp/test-hooks.ts must sit behind an
 *    `import.meta.env.VITE_BALATRO_MP_TEST === '1'` dynamic import).
 * 4. Packs (lib/balatro/game-pack.json + data/balatro-pack): core ≤ baseline
 *    4 930 572 B + BUDGETS.coreGrowth; mp ≤ BUDGETS.mpPackBytes compressed and ≤ 8 MiB
 *    extracted (from the zip's central directory). The manifest's byte counts must
 *    match the files.
 * KB = 1024 bytes throughout.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Loader, type Metafile, type Plugin } from 'esbuild';
import { readZip } from '../../lib/balatro/zip';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const BASELINE_FILE = path.join(ROOT, 'scripts/balatro/bundle-budget.json');
export const ENTRY_REL = 'components/balatro/BalatroPage.tsx';

const KB = 1024;
const MB = 1024 * KB;
export const BUDGETS = {
  spEntryDeltaGzip: 2.5 * KB,
  mpChunksGzip: 70 * KB,
  p2pGzip: 15 * KB,
  // Raised at merge point M1 (orchestrator): the core grows ~37 KB for the
  // CJK glyphs each language's MP text needs (folded per language, WS2), and
  // the kept MP art alone is ~1.25 MB after lossless recompression. These match
  // data/balatro-mp/pack-budget.json, which the pack builder enforces.
  // M1b: +16 422 B, exactly the compressed web platform Lua (rmh_web.lua,
  // rmh/*.lua, rmh_mp_entry.lua) that moved out of the page bundle's `?raw`
  // imports and into the core pack (build-game-pack.py PLATFORM_LUA).
  coreGrowth: 40_000 + 16_422,
  mpPackBytes: 1_800_000,
  mpPackExtracted: 8 * MB,
} as const;

export interface Baseline {
  /** The commit the single-player numbers were measured at. */
  ref: string;
  recordedAt: string;
  spEntryGzip: number;
  corePackBytes: number;
}

// ── esbuild measurement ──────────────────────────────────────────────────────

/**
 * Packages the site shell (app/routes/__root.tsx and the radial shell) already
 * loads on every page, so a route chunk never carries them: React, the TanStack
 * router/start/store family, i18next, sonner and framer-motion. Everything else —
 * zod, lucide icons, small helpers — is bundled and counted, because a route or
 * the lazy MP chunk really does pay for it.
 */
export const SHELL_EXTERNALS = [
  /^react(-dom)?(\/.*)?$/,
  /^@tanstack\//,
  /^(react-)?i18next(\/.*)?$/,
  /^sonner$/,
  /^framer-motion(\/.*)?$/,
];

const LOADERS: Record<string, Loader> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.css': 'empty',
};

function gitShow(ref: string, rel: string): string {
  return execFileSync('git', ['show', `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * MB,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** A `.server` module's client stub: each exported name (and default) as undefined, like vite.config.ts. */
export function serverStub(source: string): string {
  const names = new Set<string>();
  for (const m of source.matchAll(/export\s+(?:const|let|var|function\*?|class|async\s+function\*?)\s+(\w+)/g)) {
    names.add(m[1] as string);
  }
  for (const m of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const token of (m[1] as string).split(',')) {
      const alias = token.trim().split(/\s+as\s+/).pop()?.trim();
      if (alias && alias !== 'default' && /^\w+$/.test(alias)) names.add(alias);
    }
  }
  return [...[...names].map((n) => `export const ${n} = undefined;`), 'export default undefined;'].join('\n');
}

/** `import.meta.glob<T>('./a.ts')` (single literal paths, as the MP code uses) → `{ './a.ts': () => import('./a.ts') }`. */
export function expandGlobs(source: string): string {
  return source.replace(
    /import\.meta\.glob(?:<[^>()]*>)?\(\s*(['"])([^'"*]+)\1\s*\)/g,
    (_m, q: string, p: string) => `{ ${q}${p}${q}: () => import(${q}${p}${q}) }`,
  );
}

/** Resolves `@/…`, stubs `.server` modules, loads `?raw` as text, and (with a ref) reads repo files from git. */
function sitePlugin(ref: string | null): Plugin {
  const inRepo = (p: string) =>
    p.startsWith(ROOT + path.sep) && !p.includes(`${path.sep}node_modules${path.sep}`);
  const read = (file: string) =>
    ref
      ? gitShow(ref, path.relative(ROOT, file).split(path.sep).join('/'))
      : readFileSync(file, 'utf8');
  return {
    name: 'balatro-budget-site',
    setup(b) {
      b.onResolve({ filter: /^[^./]/ }, (a) =>
        SHELL_EXTERNALS.some((re) => re.test(a.path))
          ? { path: a.path, external: true }
          : undefined,
      );
      b.onResolve({ filter: /^@\// }, async (a) => {
        const r = await b.resolve(`./${a.path.slice(2)}`, {
          resolveDir: ROOT,
          kind: a.kind,
          importer: a.importer,
        });
        return r.errors.length
          ? { errors: r.errors }
          : { path: r.path, sideEffects: r.sideEffects };
      });
      b.onResolve({ filter: /\?raw$/ }, (a) => ({
        path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')),
        namespace: 'raw',
      }));
      b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
        contents: read(a.path),
        loader: 'text',
      }));
      // Same contract as vite.config.ts stubServerFiles(): never in a client bundle, but every
      // name it exports still resolves (to undefined), so a client module importing one builds.
      b.onLoad({ filter: /\.server\.[jt]sx?$/ }, (a) => ({
        contents: serverStub(read(a.path)),
        loader: 'js',
      }));
      // Vite's import.meta.glob (the MP session behind pack-loader, WS12's queue extension) as
      // the lazy import() map Vite emits, so esbuild splits and measures those chunks too.
      b.onLoad({ filter: /[\\/](lib|components)[\\/]balatro[\\/].*\.tsx?$/ }, (a) => {
        if (!inRepo(a.path)) return undefined;
        const src = read(a.path);
        if (!src.includes('import.meta.glob')) return undefined;
        return {
          contents: expandGlobs(src),
          loader: a.path.endsWith('x') ? 'tsx' : 'ts',
          resolveDir: path.dirname(a.path),
        };
      });
      if (ref) {
        b.onLoad({ filter: /\.(tsx?|jsx?|mjs|cjs|json|css)$/ }, (a) => {
          if (!inRepo(a.path)) return undefined;
          const loader = LOADERS[path.extname(a.path)] ?? 'text';
          return {
            contents: loader === 'empty' ? '' : read(a.path),
            loader,
            resolveDir: path.dirname(a.path),
          };
        });
      }
    },
  };
}

export interface ChunkReport {
  file: string;
  bytes: number;
  gzip: number;
  inputs: string[];
  /** The largest modules by minified bytes in this chunk (for --verbose). */
  top: Array<[string, number]>;
  p2pShareGzip: number;
}

export interface BundleReport {
  entry: ChunkReport;
  /** Entry + its static import closure. */
  staticChunks: ChunkReport[];
  staticGzip: number;
  /** Chunks reached only through dynamic import(). */
  dynamicChunks: ChunkReport[];
  dynamicGzip: number;
  /**
   * Lazy chunks holding only site modules (auth client, UI primitives, the jelly runtime,
   * socket.io …) that the MP toolbar shares with the site shell: the shell already pays for
   * them on every page, so they are reported but not counted in the MP budget.
   */
  sharedChunks?: ChunkReport[];
  sharedGzip?: number;
  p2pGzip: number;
  forbiddenInStatic: string[];
  testSurfaceLeaks: string[];
}

const isP2p = (input: string) => input.startsWith('lib/shared/p2p/');
const isMp = (input: string) => input.startsWith('lib/balatro/mp/');
const isBalatroSource = (input: string) =>
  input.startsWith('lib/balatro/') || input.startsWith('components/balatro/') || isP2p(input);

/** Splits a metafile into the entry's static closure and the dynamically reached rest (pure). */
export function classifyChunks(
  meta: Metafile,
  entryRel: string,
): { entry: string; staticSet: Set<string>; dynamicSet: Set<string> } {
  const outputs = meta.outputs;
  const entry = Object.keys(outputs).find((o) => outputs[o].entryPoint === entryRel);
  if (!entry) throw new Error(`no output for entry ${entryRel}`);
  const staticSet = new Set<string>();
  const visitStatic = (o: string) => {
    if (staticSet.has(o) || !outputs[o]) return;
    staticSet.add(o);
    for (const imp of outputs[o].imports)
      if (imp.kind === 'import-statement' && !imp.external) visitStatic(imp.path);
  };
  visitStatic(entry);
  // Only the page's own lazy code is the MP budget: a dynamic import() edge is followed when a
  // Balatro module (lib/balatro/, components/balatro/, lib/shared/p2p/) makes it. The site
  // shell's lazy chunks (the per-locale i18n catalogs, …) are not Multiplayer code. A metafile
  // without input data (unit fixtures) follows every edge.
  const ownTargets = new Set<string>();
  const inputs = meta.inputs ?? {};
  for (const [file, info] of Object.entries(inputs)) {
    if (!isBalatroSource(file)) continue;
    for (const imp of info.imports) if (imp.kind === 'dynamic-import' && !imp.external) ownTargets.add(imp.path);
  }
  const follow = (imp: Metafile['outputs'][string]['imports'][number]) => {
    if (imp.kind !== 'dynamic-import' || Object.keys(inputs).length === 0) return true;
    const ep = outputs[imp.path]?.entryPoint;
    return ep !== undefined && ownTargets.has(ep);
  };
  const dynamicSet = new Set<string>();
  const visitAny = (o: string) => {
    if (!outputs[o]) return;
    for (const imp of outputs[o].imports) {
      if (imp.external || !outputs[imp.path] || !follow(imp)) continue;
      if (!staticSet.has(imp.path) && !dynamicSet.has(imp.path)) {
        dynamicSet.add(imp.path);
        visitAny(imp.path);
      }
    }
  };
  for (const o of staticSet) visitAny(o);
  return { entry, staticSet, dynamicSet };
}

export async function measureBundle(
  opts: { ref?: string | null; testFlag?: boolean } = {},
): Promise<BundleReport> {
  const outdir = mkdtempSync(path.join(tmpdir(), 'balatro-budget-'));
  try {
    const result = await build({
      absWorkingDir: ROOT,
      entryPoints: [ENTRY_REL],
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      jsx: 'automatic',
      outdir,
      metafile: true,
      write: true,
      logLevel: 'silent',
      define: {
        'import.meta.env.VITE_BALATRO_MP_TEST': opts.testFlag ? '"1"' : '""',
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
        'import.meta.env.SSR': 'false',
        'import.meta.env.MODE': '"production"',
        'process.env.NODE_ENV': '"production"',
      },
      loader: {
        '.png': 'empty',
        '.svg': 'empty',
        '.jpg': 'empty',
        '.webp': 'empty',
        '.woff2': 'empty',
        '.css': 'empty',
      },
      plugins: [sitePlugin(opts.ref ?? null)],
    });
    const meta = result.metafile!;
    const { entry, staticSet, dynamicSet } = classifyChunks(meta, ENTRY_REL);
    const report = (o: string): ChunkReport => {
      const out = meta.outputs[o];
      const body = readFileSync(path.join(ROOT, o));
      const gzip = gzipSync(body, { level: 9 }).length;
      const inputs = Object.keys(out.inputs);
      const p2pBytes = inputs.filter(isP2p).reduce((n, i) => n + out.inputs[i].bytesInOutput, 0);
      const top = inputs
        .map((i): [string, number] => [
          i.replace(/^.*node_modules\//, ''),
          out.inputs[i].bytesInOutput,
        ])
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8);
      return {
        file: o,
        bytes: out.bytes,
        gzip,
        inputs,
        top,
        p2pShareGzip: out.bytes ? Math.round((gzip * p2pBytes) / out.bytes) : 0,
      };
    };
    const staticChunks = [...staticSet].map(report);
    const lazy = [...dynamicSet].map(report);
    const dynamicChunks = lazy.filter((c) => c.inputs.some(isBalatroSource));
    const sharedChunks = lazy.filter((c) => !c.inputs.some(isBalatroSource));
    const testSurfaceLeaks = Object.keys(meta.outputs).filter((o) =>
      readFileSync(path.join(ROOT, o), 'utf8').includes('__balatroMp'),
    );
    return {
      entry: staticChunks.find((c) => c.file === entry)!,
      staticChunks,
      staticGzip: staticChunks.reduce((n, c) => n + c.gzip, 0),
      dynamicChunks,
      dynamicGzip: dynamicChunks.reduce((n, c) => n + c.gzip, 0),
      sharedChunks,
      sharedGzip: sharedChunks.reduce((n, c) => n + c.gzip, 0),
      p2pGzip: dynamicChunks.reduce((n, c) => n + c.p2pShareGzip, 0),
      forbiddenInStatic: [
        ...new Set(staticChunks.flatMap((c) => c.inputs.filter((i) => isMp(i) || isP2p(i)))),
      ],
      testSurfaceLeaks: testSurfaceLeaks.map((o) => path.basename(o)),
    };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

// ── packs ────────────────────────────────────────────────────────────────────

export interface PackInfo {
  file: string;
  bytes: number;
  sha256?: string;
}

export interface PackReport {
  core: { bytes: number; fileBytes: number | null };
  mp: { bytes: number; fileBytes: number | null; extracted: number | null } | null;
}

export function measurePacks(
  manifest: Record<string, unknown>,
  packDir = path.join(ROOT, 'data/balatro-pack'),
): PackReport {
  const fileBytes = (info: PackInfo) => {
    const p = path.join(packDir, info.file);
    return existsSync(p) ? readFileSync(p).length : null;
  };
  const core = manifest.core as PackInfo;
  const mp = manifest.mp as PackInfo | undefined;
  let mpReport: PackReport['mp'] = null;
  if (mp) {
    const p = path.join(packDir, mp.file);
    const extracted = existsSync(p)
      ? readZip(new Uint8Array(readFileSync(p))).entries.reduce((n, e) => n + e.size, 0)
      : null;
    mpReport = { bytes: mp.bytes, fileBytes: fileBytes(mp), extracted };
  }
  return { core: { bytes: core.bytes, fileBytes: fileBytes(core) }, mp: mpReport };
}

// ── verdict ──────────────────────────────────────────────────────────────────

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const kb = (n: number) => `${(n / KB).toFixed(2)} KB`;

/** Turns measurements into pass/fail lines (pure; unit-tested). */
export function evaluate(
  bundle: BundleReport | null,
  packs: PackReport,
  baseline: Baseline,
): Check[] {
  const checks: Check[] = [];
  if (bundle) {
    const delta = bundle.staticGzip - baseline.spEntryGzip;
    checks.push({
      name: 'single-player route chunk delta',
      ok: delta <= BUDGETS.spEntryDeltaGzip,
      detail: `${kb(bundle.staticGzip)} gzip vs baseline ${kb(baseline.spEntryGzip)} @${baseline.ref.slice(0, 10)}: ${delta >= 0 ? '+' : ''}${kb(delta)} (budget +${kb(BUDGETS.spEntryDeltaGzip)})`,
    });
    checks.push({
      name: 'no MP/P2P module in the single-player chunk',
      ok: bundle.forbiddenInStatic.length === 0,
      detail: bundle.forbiddenInStatic.length ? bundle.forbiddenInStatic.join(', ') : 'none',
    });
    checks.push({
      name: 'MP JS chunks',
      ok: bundle.dynamicGzip <= BUDGETS.mpChunksGzip,
      detail:
        `${kb(bundle.dynamicGzip)} gzip over ${bundle.dynamicChunks.length} chunk(s) (budget ${kb(BUDGETS.mpChunksGzip)})` +
        (bundle.sharedChunks?.length ? `; site-shared lazy chunks not counted: ${kb(bundle.sharedGzip ?? 0)} over ${bundle.sharedChunks.length}` : ''),
    });
    checks.push({
      name: 'P2P share of the MP chunks',
      ok: bundle.p2pGzip <= BUDGETS.p2pGzip,
      detail: `≈${kb(bundle.p2pGzip)} gzip (budget ${kb(BUDGETS.p2pGzip)})`,
    });
    checks.push({
      name: 'test surface absent without VITE_BALATRO_MP_TEST',
      ok: bundle.testSurfaceLeaks.length === 0,
      detail: bundle.testSurfaceLeaks.length
        ? `__balatroMp in ${bundle.testSurfaceLeaks.join(', ')}`
        : 'absent',
    });
  }
  checks.push({
    name: 'core pack size',
    ok: packs.core.bytes <= baseline.corePackBytes + BUDGETS.coreGrowth,
    detail: `${packs.core.bytes} B vs baseline ${baseline.corePackBytes} B (budget +${BUDGETS.coreGrowth} B)`,
  });
  checks.push({
    name: 'core pack manifest matches its file',
    ok: packs.core.fileBytes === packs.core.bytes,
    detail: packs.core.fileBytes === null ? 'file missing' : `${packs.core.fileBytes} B on disk`,
  });
  if (!packs.mp) {
    checks.push({ name: 'MP pack', ok: true, detail: 'not in the manifest yet (WS2)' });
  } else {
    checks.push({
      name: 'MP pack compressed',
      ok: packs.mp.bytes <= BUDGETS.mpPackBytes,
      detail: `${packs.mp.bytes} B (budget ${BUDGETS.mpPackBytes} B)`,
    });
    checks.push({
      name: 'MP pack manifest matches its file',
      ok: packs.mp.fileBytes === packs.mp.bytes,
      detail: packs.mp.fileBytes === null ? 'file missing' : `${packs.mp.fileBytes} B on disk`,
    });
    checks.push({
      name: 'MP pack extracted',
      ok: packs.mp.extracted !== null && packs.mp.extracted <= BUDGETS.mpPackExtracted,
      detail:
        packs.mp.extracted === null
          ? 'file missing'
          : `${packs.mp.extracted} B (budget ${BUDGETS.mpPackExtracted} B)`,
    });
  }
  return checks;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const refAt = argv.indexOf('--ref');
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, 'lib/balatro/game-pack.json'), 'utf8'),
  ) as Record<string, unknown>;

  if (argv.includes('--record')) {
    const ref = refAt >= 0 ? argv[refAt + 1] : 'HEAD';
    const sha = execFileSync('git', ['rev-parse', ref], { cwd: ROOT, encoding: 'utf8' }).trim();
    const atRef = await measureBundle({ ref: sha });
    const refManifest = JSON.parse(gitShow(sha, 'lib/balatro/game-pack.json')) as {
      core: PackInfo;
    };
    const baseline: Baseline = {
      ref: sha,
      recordedAt: new Date().toISOString().slice(0, 10),
      spEntryGzip: atRef.staticGzip,
      corePackBytes: refManifest.core.bytes,
    };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(
      `recorded ${path.relative(ROOT, BASELINE_FILE)}: ${JSON.stringify(baseline)}\n`,
    );
    return 0;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
  const bundle = await measureBundle({ ref: refAt >= 0 ? argv[refAt + 1] : null });
  const packs = measurePacks(manifest);
  const checks = evaluate(bundle, packs, baseline);
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ baseline, bundle, packs, checks }, null, 2)}\n`);
  } else {
    for (const c of checks)
      process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}\n`);
    if (argv.includes('--verbose')) {
      for (const c of [...bundle.staticChunks, ...bundle.dynamicChunks]) {
        process.stdout.write(
          `  ${path.basename(c.file)} ${kb(c.gzip)} gzip, ${c.inputs.length} modules\n`,
        );
        for (const [name, bytes] of c.top)
          process.stdout.write(`      ${kb(bytes)} min  ${name}\n`);
      }
    }
  }
  return checks.every((c) => c.ok) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`bundle-budget: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    },
  );
}
