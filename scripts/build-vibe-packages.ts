/**
 * Pre-bundle the curated "hosted" vibe packages into self-contained ESM files
 * served from our own origin, so generated vibe pages never fetch React or large
 * libs from the third-party CDN esm.sh at view time.
 *
 * For every 'hosted' entry in lib/rmhvibe/vibe-packages.ts (and its declared
 * subpaths), esbuild produces one minified ESM bundle at
 * `public/vibe-packages/<stem>.js`. Every OTHER hosted package — and React — is
 * left EXTERNAL, so each bundle resolves them through the page's importmap to the
 * single shared instance (one React, one three, …) rather than bundling its own.
 *
 * CJS packages (notably react-dom) defeat esbuild's external handling: a
 * `require("react")` inside a lazily-wrapped CJS module survives as a runtime
 * `__require("react")` shim that throws in the browser. We post-process the
 * unminified bundle to hoist those leftover dynamic requires of external packages
 * into real top-level ESM imports, then minify. ESM packages (framer-motion, r3f)
 * already emit proper imports and pass through untouched.
 *
 * The server bundler (vibe-bundle.server.ts) points each page's importmap at
 * these files; classification + filenames come from the shared registry, so the
 * two can't drift. 'inline' packages are NOT built here — esbuild bundles them
 * straight into each page from node_modules.
 *
 * Run: pnpm build-vibe-packages   (also runs as part of `pnpm build`)
 */

import { build, transform } from 'esbuild';
import { cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostedPackages, hostedStem, bareName } from '@/lib/rmhvibe/vibe-packages';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const OUT_DIR = path.join(ROOT, 'public', 'vibe-packages');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));

// Base names of every hosted package — the set we keep external in every bundle
// (plus React) so all bundles share one instance of each via the page importmap.
const HOSTED_NAMES = hostedPackages().map((p) => p.name);

/**
 * Which packages to leave external when bundling `spec`. We externalize every
 * hosted package and React so they resolve to the single shared copy — EXCEPT the
 * package we're currently building its own base bundle for (`spec === base`), which
 * must bundle itself. Subpath builds (e.g. `react-dom/client`) keep their own base
 * external too, so they import the shared base bundle rather than duplicating it.
 */
function externalsFor(spec: string): string[] {
  const base = bareName(spec);
  const ext = new Set<string>([...HOSTED_NAMES, 'react', 'react-dom']);
  if (spec === base) ext.delete(base);
  return [...ext];
}

/** esbuild matches an external name against `path === name` or `path.startsWith(name + '/')`. */
function isExternalSpec(spec: string, externals: string[]): boolean {
  return externals.some((e) => spec === e || spec.startsWith(`${e}/`));
}

/**
 * Hoist leftover `__require("pkg")` / `require("pkg")` calls for EXTERNAL packages
 * into real top-level ESM imports. esbuild emits these when a CJS dependency
 * (react-dom) requires an external package from inside a lazy module wrapper; left
 * as-is they hit the runtime `__require` shim and throw in the browser. Returns the
 * rewritten source. Internal requires (already bundled) never reference an external
 * spec, so they're untouched.
 */
function hoistExternalRequires(code: string, externals: string[]): string {
  const vars = new Map<string, string>(); // spec -> import binding
  let n = 0;
  const out = code.replace(/(?:__require|require)\(\s*["']([^"']+)["']\s*\)/g, (m, spec: string) => {
    if (!isExternalSpec(spec, externals)) return m;
    let v = vars.get(spec);
    if (!v) {
      v = `__vibeExt${n++}`;
      vars.set(spec, v);
    }
    // CJS `require(x)` yields module.exports; mirror that from the ESM namespace
    // (the hosted bundle's default IS the package's module.exports object).
    return `(${v}.default!==void 0?${v}.default:${v})`;
  });
  if (vars.size === 0) return code;
  const header = [...vars].map(([spec, v]) => `import * as ${v} from ${JSON.stringify(spec)};`).join('\n');
  return `${header}\n${out}`;
}

// JS reserved words can't be `export const` binding names — skip them (and any
// non-identifier export) when generating named re-exports below.
const RESERVED = new Set(
  ('break case catch class const continue debugger default delete do else export extends ' +
    'false finally for function if import in instanceof new null return super switch this throw ' +
    'true try typeof var void while with yield let static enum await implements package protected ' +
    'interface private public').split(' '),
);
const VALID_IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * Bundle a single bare specifier (base package or a subpath like
 * `react-dom/client`) into one minified ESM file with PROPER named exports.
 *
 * Standalone-bundling a CJS package to ESM (react, react-dom, react/jsx-runtime)
 * yields only a `default` export, which breaks `import { useState }` and the JSX
 * runtime. So we ask Node — the authority, via cjs-module-lexer for CJS and real
 * bindings for ESM — for the package's export names (`await import(spec)`), then
 * generate an explicit re-export shim that pulls each name off the bundled module
 * (falling back to its module.exports default for any the static interop missed).
 * We also resolve the package's ESM entry (`import.meta.resolve`) so libraries
 * whose `require` main is CJS (e.g. three) still bundle their real named exports.
 */
async function bundleOne(spec: string, stem: string): Promise<number> {
  // ESM entry (absolute path → never matched by `external`); names from Node.
  const entry = fileURLToPath(import.meta.resolve(spec));
  const ns: Record<string, unknown> = await import(spec);
  const names = Object.keys(ns).filter((k) => k !== 'default' && VALID_IDENT.test(k) && !RESERVED.has(k));
  const externals = externalsFor(spec);

  const entryLit = JSON.stringify(entry);
  const reexports = names
    .map((n) => `export const ${n} = __all.${n} !== void 0 ? __all.${n} : (__def && __def.${n});`)
    .join('\n');
  const shim = `import * as __all from ${entryLit};
const __def = __all.default !== void 0 ? __all.default : __all;
export default __def;
${reexports}
`;

  // Build unminified so leftover dynamic requires are rewritable, hoist them, minify.
  const result = await build({
    stdin: { contents: shim, resolveDir: ROOT, loader: 'js', sourcefile: `vibe-pkg-${stem}.js` },
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    minify: false,
    legalComments: 'none',
    external: externals,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });

  const raw = result.outputFiles?.[0]?.text ?? '';
  if (!raw.trim()) throw new Error(`empty bundle for ${spec}`);
  const hoisted = hoistExternalRequires(raw, externals);
  const { code } = await transform(hoisted, { minify: true, format: 'esm', loader: 'js', legalComments: 'none' });

  await writeFile(path.join(OUT_DIR, `${stem}.js`), code, 'utf8');
  return code.length;
}

/** Installed version of a package, for logging only ('?' if unreadable). */
async function versionOf(name: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(requireFromRoot.resolve(`${name}/package.json`), 'utf8'));
    return pkg.version ?? '?';
  } catch {
    return '?';
  }
}

/**
 * Run `worker` over `items` with at most `limit` in flight at once. Each bundle
 * is an independent esbuild call that writes its own file, so they parallelize
 * cleanly — but we cap concurrency to keep peak memory bounded when several heavy
 * libs (three, pixi, p5, …) are imported + bundled at the same time.
 */
async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Hash everything that determines the built output: this script's own source
 * (so logic changes rebuild), the hosted-package registry, and the resolved
 * version of every hosted package (so a dependency bump rebuilds). When this is
 * unchanged the bundles are byte-identical, so the whole esbuild pass can be
 * skipped and the previous output restored from cache.
 */
async function computeInputsHash(): Promise<string> {
  const h = createHash('sha256');
  h.update(await readFile(fileURLToPath(import.meta.url)));
  try {
    h.update(await readFile(path.join(ROOT, 'lib', 'rmhvibe', 'vibe-packages.ts')));
  } catch {
    /* registry path moved — fall through; the version list below still varies the hash */
  }
  const names = hostedPackages()
    .map((p) => p.name)
    .sort();
  for (const name of names) h.update(`${name}@${await versionOf(name)}\n`);
  return h.digest('hex');
}

/**
 * Restore previously-built bundles from the cache dir when the inputs hash
 * matches and the cached output is non-empty. Returns true on a cache hit.
 */
async function restoreFromCache(cacheDir: string, hash: string): Promise<boolean> {
  try {
    const manifest = (await readFile(path.join(cacheDir, 'manifest.txt'), 'utf8')).trim();
    if (manifest !== hash) return false;
    const cachedOut = path.join(cacheDir, 'out');
    if ((await readdir(cachedOut)).length === 0) return false;
    await rm(OUT_DIR, { recursive: true, force: true });
    await mkdir(path.dirname(OUT_DIR), { recursive: true });
    await cp(cachedOut, OUT_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Persist the freshly built bundles + their inputs hash for the next build. */
async function saveToCache(cacheDir: string, hash: string): Promise<void> {
  try {
    const cachedOut = path.join(cacheDir, 'out');
    await rm(cachedOut, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
    await cp(OUT_DIR, cachedOut, { recursive: true });
    await writeFile(path.join(cacheDir, 'manifest.txt'), hash, 'utf8');
  } catch (err) {
    console.warn(`  (vibe-package cache save skipped: ${(err as Error).message})`);
  }
}

async function main() {
  // Content-addressed skip: when nothing that affects the bundles has changed,
  // restore them from the cache mount instead of re-running esbuild on every
  // deploy. Gated on VIBE_PKG_CACHE_DIR so local `pnpm build` always rebuilds.
  const cacheDir = process.env.VIBE_PKG_CACHE_DIR;
  const inputsHash = cacheDir ? await computeInputsHash() : '';
  if (cacheDir && (await restoreFromCache(cacheDir, inputsHash))) {
    console.log('Vibe packages unchanged — restored from cache (skipped esbuild).');
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const pkgs = hostedPackages();
  console.log(`Bundling ${pkgs.length} hosted vibe package(s) → public/vibe-packages/\n`);

  // Flatten every package (and its declared subpaths) into one list of build
  // targets so they can be bundled concurrently rather than one-at-a-time.
  const targets = pkgs.flatMap(({ name, entry }) => [
    { spec: name, stem: hostedStem(name), name },
    ...(entry.subpaths ?? []).map((s) => ({ spec: `${name}/${s}`, stem: hostedStem(name, s), name })),
  ]);

  let ok = 0;
  let failed = 0;
  // Concurrency cap: esbuild parallelizes internally, so a handful of in-flight
  // JS-side builds saturate it without spiking Node heap on the heavy libs.
  await mapPool(targets, 6, async ({ spec, stem, name }) => {
    try {
      const [bytes, ver] = await Promise.all([bundleOne(spec, stem), versionOf(name)]);
      console.log(`  ✓ ${spec.padEnd(28)} v${ver.padEnd(10)} ${(bytes / 1024).toFixed(0)} KB → ${stem}.js`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${spec} — ${(err as Error).message}`);
      failed++;
    }
  });

  console.log(`\nDone: ${ok} built${failed ? `, ${failed} failed` : ''}.`);
  if (failed) {
    process.exitCode = 1;
    return;
  }
  // Only cache a fully successful build, so a partial failure never poisons the
  // skip path on the next deploy.
  if (cacheDir) await saveToCache(cacheDir, inputsHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
