import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger, defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';

/**
 * Vite plugin that replaces *.server.{ts,tsx,js,jsx} imports with empty
 * stub modules on the client side. It reads the original file to discover
 * its export names and generates matching `export const x = undefined`
 * declarations so that named imports resolve without a browser ESM error,
 * while the heavy Node-only dependency tree (pg, Buffer, etc.) is never loaded.
 */
function stubServerFiles(): Plugin {
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

const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes('has been externalized for browser compatibility')) return;
  if (msg.includes('Error when using sourcemap for reporting an error')) return;
  if (msg.includes('.prisma/client/default')) return;
  originalWarn(msg, options);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onwarn(warning: any, warn: any) {
  if (warning.code === 'UNRESOLVED_IMPORT' && warning.exporter?.includes('.prisma/client')) return;
  // file-type (transitive dep of music-metadata) uses eval('require')('stream') — safe, Node-only fallback
  if (warning.code === 'EVAL' && warning.id?.includes('file-type')) return;
  warn(warning);
}

// Packages externalized from BOTH Nitro's production server bundle (traceDeps)
// and Vite's dev SSR bundling (ssr.external).
const heavyExternals = [
  // 3D / canvas — large, client-only
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  '@react-three/rapier',
  'pixi.js',
  // UI libs
  'canvas-confetti',
  'react-player',
  'emoji-picker-react',
  'react-easy-crop',
  // Audio (native/WASM — can't bundle)
  'tone',
  '@audio/decode',
  'wasm-audio-decoders',
  '@wasm-audio-decoders/common',
  '@wasm-audio-decoders/ogg-vorbis',
  '@eshaz/web-worker',
];

// Additional packages for Vite SSR dev bundling only. These have complex
// re-exports that break Rolldown's externalization in Nitro's production build,
// but work fine with Vite's dev SSR resolver.
const ssrOnlyExternals = [
  'framer-motion',
  'lucide-react',
  'zod',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  '@anthropic-ai/sdk',
  // Native binary — used server-side to bundle generated vibe projects.
  'esbuild',
];

function manualChunks(id: string) {
  // React core first — it MUST be one shared chunk. Everything the app renders
  // imports React, so isolating it keeps the heavy route-only vendors
  // (three/tone/…) from bridging into the entry via shared React runtime.
  // (When React had no chunk of its own, rolldown co-located it inside vendor-three;
  // the entry then imported that 1.3 MB chunk on every page just to get React.)
  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules/scheduler/') ||
    id.includes('node_modules/react-is/') ||
    id.includes('node_modules/use-sync-external-store/')
  ) {
    return 'vendor-react';
  }
  // Everything else (three, tone, pixi, framer-motion,
  // …) is intentionally left to rolldown's automatic chunking. Every heavy library
  // is reached only through a React.lazy(() => import(...)) route boundary, so
  // rolldown emits it as an async chunk that loads on its own route — NOT in the
  // entry graph. Force-chunking them into named vendor chunks (the previous
  // approach) made rolldown scatter shared runtime into those chunks and drag the
  // whole 1.3 MB three payload onto every page, including the
  // homepage. Only React is pinned above, because it is genuinely shared by the
  // entry and must not be duplicated.
}

export default defineConfig({
  customLogger: logger,
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 7005,
  },
  // Inject the CDN base as a compile-time constant for the Vite client + SSR
  // builds. lib/storage/asset.ts reads `__CDN_BASE__` instead of
  // `import.meta.env.VITE_CDN_BASE_URL` so it stays type-checkable under the
  // CommonJS server tsconfig (import.meta is illegal there); the standalone
  // esbuild server bundle leaves the global undefined → those workers use
  // relative paths (no CDN), which is correct. VITE_CDN_BASE_URL is a real
  // build-time env var (Dockerfile ARG→ENV), so process.env carries it here.
  define: {
    __CDN_BASE__: JSON.stringify(process.env.VITE_CDN_BASE_URL ?? ''),
  },
  plugins: [
    stubServerFiles(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'app',
      // NOTE: `router: { autoCodeSplitting: true }` was tested (rewrite R3-T5,
      // 2026-07-18) and is a VERIFIED NO-OP here — enabling it produced a
      // byte-identical build (same chunk hashes, same 582 chunks, same 216 KB
      // brotli entry). The reason (found 2026-08-04): TanStack Start's
      // `parseStartConfig` does `configSchema.omit({ autoCodeSplitting: true })`
      // before handing the router config on, so the option is STRIPPED from the
      // accepted schema and Start decides splitting itself. The flag is never
      // read — that is why the build is byte-identical, not because there was
      // nothing to split. Do not re-add it expecting a win.
      //
      // What DOES matter is that `routeTree.gen.ts` imports all 739 route
      // modules statically and Start's splitter only lifts out route
      // COMPONENTS: anything else a route module touches at top level lands in
      // the shared entry that every page loads. See
      // docs/performance-audit-2026-08-04.md.
    }),
    react(),
    nitro({
      // Pre-compress static assets at build time so the origin serves gzip
      // directly (Nitro negotiates via Accept-Encoding). Cloudflare compresses at
      // the edge for most users; gzip pre-compression covers the CF→origin hop and
      // non-Cloudflare paths (preview/direct/dev-preview). Brotli is intentionally
      // OFF: brotli-compressing every hashed chunk added ~15s to the build's
      // "Generated public .output/public" phase (measured), and the edge already
      // serves brotli to real users — so the build-time brotli pass only benefited
      // the rare direct-to-origin request. gzip keeps that path compressed at a
      // fraction of the cost. Images are already compressed and skipped.
      compressPublicAssets: { gzip: true, brotli: false },
      // Cache headers for static files served out of public/. Nitro already marks
      // the content-hashed /assets/** build output immutable (1y), but /images/**
      // (game art, icons, social images — not content-hashed) had no rule, so the
      // origin sent no Cache-Control and Cloudflare fell back to its 4h browser
      // default. Lighthouse flagged that as an inefficient cache lifetime. 30 days
      // (no `immutable`, so a redeploy that changes an image still revalidates)
      // eliminates the repeat downloads without risking long-lived staleness.
      //
      // NO `use-as-dictionary` HERE (OPT-45), and this is the note explaining
      // why so it isn't re-derived — or pasted in from the spec, whose snippet
      // does not survive contact with this build's output.
      //
      // Compression Dictionary Transport would let a returning user download
      // only the delta between `Foo-<oldhash>.js` and `Foo-<newhash>.js`. Three
      // things stop `routeRules` from being the way to ask for it:
      //
      //  1. A route rule is a static path pattern → a static header value, and
      //     Nitro's matcher is SEGMENT-based (the generated routing table
      //     compares `path.split('/')[1] === 'assets'` — there is no
      //     partial-segment pattern like `/assets/vendor-react-*.js`). So the
      //     only expressible scope is all of `/assets/**`, and the only
      //     expressible `match` is one pattern shared by every file under it.
      //  2. Under `/assets/` this build emits ~955 JS chunks and ~995 CSS,
      //     woff2 and .map files. The rule would stamp
      //     `Use-As-Dictionary: match-dest=("script")` onto the fonts and
      //     stylesheets too — registering a woff2 as a dictionary for future
      //     script requests, which is not a weaker version of the win, it is
      //     wrong.
      //  3. ~955 responses advertising the SAME match pattern means ~955 stored
      //     dictionaries of identical specificity; the client then picks the
      //     most recently stored one for any matching request, i.e. deltas
      //     between unrelated chunks. That is precisely the "matches too
      //     broadly → hit rate collapses" failure OPT-45 itself warns about;
      //     the spec's snippet is written for a single-bundle app.
      //
      // A correct policy needs a per-RESPONSE header derived from the
      // filename's stable prefix (`match="/assets/Foo-*.js"` on `Foo-*.js`),
      // which is a Nitro response plugin, not a route rule. And even then the
      // origin cannot deliver the win alone: it serves pre-gzipped static files
      // and has no `dcb`/`dcz` encoder, so the delta encoding has to happen at
      // the CDN, behind an edge feature we are not enabling here. Emitting the
      // header today would cost client storage and buy nothing measurable.
      //
      // If a future rule for `/assets/**` is ever added here anyway: do NOT
      // give it a `cache-control`. Nitro's vite plugin does
      // `routeRules['/assets/**'] ??= {}` and then fills in
      // `public, max-age=31536000, immutable` only when the rule carries no
      // `cache-control` of its own, spreading the rest through — so an added
      // header keeps the immutable default, while a hand-copied one pins the
      // value and stops tracking it.
      routeRules: {
        '/images/**': { headers: { 'cache-control': 'public, max-age=2592000' } },
      },
      // traceDeps externalizes packages from Nitro's Rolldown server bundle and
      // traces them into .output/node_modules for runtime resolution.
      // NOTE: Vite's ssr.external is ignored by Nitro — this is the only way
      // to externalize from the production server bundle.
      // `reflect-metadata` is externalized (not bundled) so its global-polyfill
      // side effect isn't tree-shaken away — the startup plugin below relies on
      // it. traceDeps also copies it into .output/node_modules for runtime.
      traceDeps: [
        '@prisma/client',
        '.prisma',
        '@resvg/resvg-js',
        'satori',
        'esbuild',
        'reflect-metadata',
      ],
      // Startup plugins:
      //  - reflect-metadata: installs the polyfill before any request loads the
      //    auth/passkey chunk (which needs it via tsyringe).
      //  - security-headers: adds baseline security headers to every response as
      //    defense-in-depth (mirrors the edge/Traefik policy for non-proxied paths).
      //  - anon-html-cache: marks anonymous, default-locale HTML on an audited
      //    path allowlist edge-cacheable, and authenticated HTML
      //    `private, no-cache` — NOT `no-store`, which would disqualify every
      //    signed-in page from the back/forward cache. Gated by the matching
      //    Cloudflare cache rule (deploy/apply-cloudflare-cache-rules.sh); a
      //    test keeps the two path lists in sync.
      //  - warmup: per-worker cold-start warmup — opens the Prisma pool and
      //    primes the anon homepage feed + sidebar caches so the first request
      //    after a deploy/restart doesn't pay the full cold cost.
      //  - drain: the mirror image of warmup — flushes the in-memory activity
      //    buffer on SIGTERM. The blue/green hotswap stops the old container on
      //    every deploy, so without it each deploy drops up to 2s of buffered
      //    activity from every worker.
      plugins: [
        fileURLToPath(new URL('./server/nitro/reflect-metadata.ts', import.meta.url)),
        fileURLToPath(new URL('./server/nitro/security-headers.ts', import.meta.url)),
        fileURLToPath(new URL('./server/nitro/anon-html-cache.ts', import.meta.url)),
        fileURLToPath(new URL('./server/nitro/warmup.ts', import.meta.url)),
        fileURLToPath(new URL('./server/nitro/drain.ts', import.meta.url)),
        //  - otel: W3C trace context per request (E1) — adopts the inbound
        //    `traceparent`, binds it to the request's async context, echoes it
        //    back as `Server-Timing` (which is how lib/rum.ts stamps the RUM
        //    beacon), and opens/closes the per-request query budget (E3).
        fileURLToPath(new URL('./server/nitro/otel.ts', import.meta.url)),
      ],
      rollupConfig: {
        external: heavyExternals.map(
          (pkg) => new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.+)?$`),
        ),
      },
    }),
  ],
  builder: {
    sharedPlugins: true,
  },
  // Drop noisy debug logging from production bundles. `pure` only removes calls
  // whose return value is unused (all console.log/debug calls), and only during
  // the minify pass — dev transforms keep them. console.warn/error/info are kept.
  // The standalone server services are bundled by a separate esbuild command
  // (see the `build` script), so this affects only the client + Nitro SSR output.
  esbuild: {
    pure: ['console.log', 'console.debug'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
    reportCompressedSize: false,
    rolldownOptions: { onwarn },
  },
  environments: {
    client: {
      dev: {
        warmup: ['app/router.tsx', 'app/routes/__root.tsx'],
      },
      build: {
        rolldownOptions: {
          onwarn,
          output: {
            manualChunks,
          },
        },
      },
    },
  },
  experimental: {
    hmrPartialAccept: true,
  },
  optimizeDeps: {
    // maplibre-gl v6 resolves its worker at runtime from `import.meta.url` (see
    // lib/maplibre.ts). The dep optimizer rewrites that to a `.vite/deps` path it
    // never emits, so the worker 404s and the map never loads; excluding it makes
    // Vite serve the real ESM, whose worker + shared siblings sit on disk.
    exclude: ['@resvg/resvg-js', 'satori', 'maplibre-gl'],
    // Vite 8's optimizer otherwise waits for the full static-import crawl to end
    // before committing optimized deps. With 130 eager routes the crawl never
    // settles, so optimized-dep requests (react.js, etc.) are held forever and
    // the page never hydrates. Commit after the first optimize run instead.
    holdUntilCrawlEnd: false,
  },
  ssr: {
    // ssr.external only affects Vite's dev SSR bundling, NOT the Nitro production
    // server build. For production, traceDeps in the nitro() plugin config is used.
    external: [...heavyExternals, ...ssrOnlyExternals, '@resvg/resvg-js', 'satori'],
  },
});
