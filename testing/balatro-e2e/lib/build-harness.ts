/**
 * Bundles the engine-spec harness page (testing/balatro-e2e/engine/page/entry.ts)
 * with esbuild: the real lib/balatro/runtime.ts (its `?raw` Lua imports and the
 * pack manifest JSON included), plus every file under lib/balatro/lua/mp_test as
 * the virtual module `virtual:balatro-mp-test-lua` — the test driver, the
 * in-engine spec runner and the specs, written into /Balatro/rmh_mp_test by the
 * page. Rebuilt on every run (≈100 ms), so a spec edit needs no step.
 */
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';
import { REPO_ROOT } from './static-server';

export const MP_TEST_DIR = path.join(REPO_ROOT, 'lib/balatro/lua/mp_test');
export const ENTRY = path.join(REPO_ROOT, 'testing/balatro-e2e/engine/page/entry.ts');
export const VIRTUAL_LUA = 'virtual:balatro-mp-test-lua';

export interface LuaFile {
  /** Path inside the game directory, e.g. rmh_mp_test/specs/engine_smoke_spec.lua. */
  path: string;
  text: string;
}

/** Every .lua under dir, as rmh_mp_test/<relative path>, sorted. */
export function collectMpTestLua(dir = MP_TEST_DIR): LuaFile[] {
  const out: LuaFile[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.lua')) {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        out.push({ path: `rmh_mp_test/${rel}`, text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir);
  return out;
}

const rawPlugin: Plugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')),
      namespace: 'raw',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
      contents: readFileSync(a.path, 'utf8'),
      loader: 'text',
    }));
  },
};

function luaPlugin(dir: string): Plugin {
  return {
    name: 'mp-test-lua',
    setup(b) {
      b.onResolve({ filter: new RegExp(`^${VIRTUAL_LUA}$`) }, () => ({
        path: VIRTUAL_LUA,
        namespace: 'mp-test-lua',
      }));
      b.onLoad({ filter: /.*/, namespace: 'mp-test-lua' }, () => ({
        contents: `export default ${JSON.stringify(collectMpTestLua(dir))};`,
        loader: 'js',
      }));
    },
  };
}

/** Builds app.js into outDir (a fresh temp dir by default); returns the dir. */
export async function buildHarness(
  outDir = mkdtempSync(path.join(tmpdir(), 'balatro-harness-')),
  luaDir = MP_TEST_DIR,
) {
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    outfile: path.join(outDir, 'app.js'),
    sourcemap: 'linked',
    logLevel: 'silent',
    define: { 'import.meta.env.VITE_BALATRO_MP_TEST': '"1"' },
    plugins: [rawPlugin, luaPlugin(luaDir)],
  });
  return outDir;
}
