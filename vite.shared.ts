/**
 * Build pieces shared by the two Vite configs: the site (`vite.config.ts`, TanStack
 * Start + Nitro) and the islands (`vite.islands.config.ts`, redesign audit B1). Both
 * compile the same `lib/` and `components/ui` code for the browser, so both need the
 * same `.server` stubbing, the same compile-time constants and the same CSS
 * post-processing. Keeping them here means an island can never be built with a
 * different answer to "what is `__CDN_BASE__`".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger, type Plugin } from 'vite';
import { parseAssetVersions, staticAssetVersions } from './scripts/static-asset-versions.mjs';

/**
 * Vite plugin that replaces *.server.{ts,tsx,js,jsx} imports with empty
 * stub modules on the client side. It reads the original file to discover
 * its export names and generates matching `export const x = undefined`
 * declarations so that named imports resolve without a browser ESM error,
 * while the heavy Node-only dependency tree (pg, Buffer, etc.) is never loaded.
 */
export function stubServerFiles(): Plugin {
  const SERVER_RE = /\.server\.[jt]sx?$/;
  const STUB_PREFIX = '\0server-stub:';

  function extractExports(source: string) {
    const names: string[] = [];
    let hasDefault = false;
    // export const/let/var/function/class/async function NAME
    for (const m of source.matchAll(
      /export\s+(?:const|let|var|function\*?|class|async\s+function\*?)\s+(\w+)/g,
    )) {
      names.push(m[1]);
    }
    // export { a, b as c }
    for (const m of source.matchAll(/export\s*\{([^}]+)\}/g)) {
      // skip re-exports that reference other .server files (already stubbed)
      for (const token of m[1].split(',')) {
        const alias = token
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (alias && alias !== 'default') names.push(alias);
        if (alias === 'default') hasDefault = true;
      }
    }
    if (/export\s+default\b/.test(source)) hasDefault = true;
    return { names: [...new Set(names)], hasDefault };
  }

  return {
    name: 'stub-server-files',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (options?.ssr) return null;

      // Fast path: a file matching SERVER_RE (*.server.{ts,tsx,js,jsx}) can only
      // be reached through an import specifier that literally contains ".server"
      // (verified: every server-file import site uses such a specifier, and there
      // are no `index.server.*` barrels that could hide one). So skip the
      // expensive this.resolve() — which re-runs the whole resolver pipeline — for
      // the ~99% of imports that cannot be server files. Without this guard the
      // plugin ran this.resolve() on every module in the graph and was the single
      // largest consumer of build plugin time (~52%).
      if (!source.includes('.server')) return null;

      // Let Vite resolve the source first so we can check the real file path
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved && SERVER_RE.test(resolved.id)) {
        return STUB_PREFIX + resolved.id;
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(STUB_PREFIX)) return null;
      const realPath = id.slice(STUB_PREFIX.length);
      try {
        const source = readFileSync(realPath, 'utf-8');
        const { names, hasDefault } = extractExports(source);
        const lines = names.map((n) => `export const ${n} = undefined;`);
        if (hasDefault) lines.push('export default undefined;');
        return lines.join('\n') || 'export default undefined;';
      } catch {
        return 'export default undefined;';
      }
    },
  };
}

/** The Vite logger both builds use: drops three warnings that are known noise here. */
export function quietLogger() {
  const logger = createLogger();
  const originalWarn = logger.warn.bind(logger);
  logger.warn = (msg, options) => {
    if (msg.includes('has been externalized for browser compatibility')) return;
    if (msg.includes('Error when using sourcemap for reporting an error')) return;
    if (msg.includes('.prisma/client/default')) return;
    originalWarn(msg, options);
  };
  return logger;
}

/**
 * Compile-time constants. `__CDN_BASE__`: lib/storage/asset.ts reads it instead of
 * `import.meta.env.VITE_CDN_BASE_URL` so it stays type-checkable under the CommonJS
 * server tsconfig (import.meta is illegal there); the standalone esbuild server bundle
 * leaves the global undefined → those workers use relative paths (no CDN), which is
 * correct. VITE_CDN_BASE_URL is a real build-time env var (Dockerfile ARG→ENV), so
 * process.env carries it here.
 */
export function sharedDefine(): Record<string, string> {
  return {
    __CDN_BASE__: JSON.stringify(process.env.VITE_CDN_BASE_URL ?? ''),
    __STATIC_ASSET_VERSIONS__: JSON.stringify(
      process.env.STATIC_ASSET_VERSIONS
        ? parseAssetVersions(process.env.STATIC_ASSET_VERSIONS)
        : staticAssetVersions(fileURLToPath(new URL('./public', import.meta.url))),
    ),
  };
}

/**
 * `"use client"` means nothing to TanStack Start, which has no React Server
 * Components. Our own source no longer carries it (redesign audit A8;
 * `local/no-use-client-directive` keeps it out), but many dependencies still do
 * (Radix, sonner, react-player…), so Rolldown's "module level directive may not
 * be preserved" check is pure noise here. It is switched OFF at the source rather
 * than filtered in `onwarn`: filtering still builds every diagnostic (a code frame
 * per file, ~2,500 of them across the client and Nitro builds — 90% of the build's
 * log volume) only to throw it away, and in the Docker build all of that is streamed
 * through BuildKit's progress output. Shared by every Rolldown invocation, including
 * Nitro's server build, which does not inherit `build.rolldownOptions`.
 */
export const rolldownChecks = { moduleLevelDirective: false };

/** Where the island build writes, and the URL prefix Nitro serves it under (vite.config.ts `publicAssets`). */
export const ISLANDS_OUT_DIR = 'dist-islands';
export const ISLANDS_BASE_URL = '/islands/';
