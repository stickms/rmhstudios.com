import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLogger, defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

/**
 * Vite plugin that replaces *.server.{ts,tsx,js,jsx} imports with empty
 * stub modules on the client side. It reads the original file to discover
 * its export names and generates matching `export const x = undefined`
 * declarations so that named imports resolve without a browser ESM error,
 * while the heavy Node-only dependency tree (pg, Buffer, etc.) is never loaded.
 */
function stubServerFiles(): Plugin {
  const SERVER_RE = /\.server\.[jt]sx?$/;
  const STUB_PREFIX = "\0server-stub:";

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
      for (const token of m[1].split(",")) {
        const alias = token.trim().split(/\s+as\s+/).pop()?.trim();
        if (alias && alias !== "default") names.push(alias);
        if (alias === "default") hasDefault = true;
      }
    }
    if (/export\s+default\b/.test(source)) hasDefault = true;
    return { names: [...new Set(names)], hasDefault };
  }

  return {
    name: "stub-server-files",
    enforce: "pre",
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
      if (!source.includes(".server")) return null;

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
        const source = readFileSync(realPath, "utf-8");
        const { names, hasDefault } = extractExports(source);
        const lines = names.map((n) => `export const ${n} = undefined;`);
        if (hasDefault) lines.push("export default undefined;");
        return lines.join("\n") || "export default undefined;";
      } catch {
        return "export default undefined;";
      }
    },
  };
}

const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes("has been externalized for browser compatibility")) return;
  if (msg.includes("Error when using sourcemap for reporting an error")) return;
  if (msg.includes(".prisma/client/default")) return;
  originalWarn(msg, options);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onwarn(warning: any, warn: any) {
  if (warning.code === "UNRESOLVED_IMPORT" && warning.exporter?.includes(".prisma/client")) return;
  // file-type (transitive dep of music-metadata) uses eval('require')('stream') — safe, Node-only fallback
  if (warning.code === "EVAL" && warning.id?.includes("file-type")) return;
  warn(warning);
}

// Packages externalized from BOTH Nitro's production server bundle (traceDeps)
// and Vite's dev SSR bundling (ssr.external).
const heavyExternals = [
  // 3D / canvas — large, client-only
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/rapier",
  "pixi.js",
  // Editor — monaco alone is 2.6MB in server bundle
  "monaco-editor",
  "@monaco-editor/react",
  // Charting
  "recharts",
  // UI libs
  "canvas-confetti",
  "react-player",
  "emoji-picker-react",
  "react-easy-crop",
  "katex",
  // Audio (native/WASM — can't bundle)
  "tone",
  "audio-decode",
  "wasm-audio-decoders",
  "@wasm-audio-decoders/common",
  "@wasm-audio-decoders/ogg-vorbis",
  "@eshaz/web-worker",
];

// Additional packages for Vite SSR dev bundling only. These have complex
// re-exports that break Rolldown's externalization in Nitro's production build,
// but work fine with Vite's dev SSR resolver.
const ssrOnlyExternals = [
  "framer-motion",
  "lucide-react",
  "zod",
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "@dnd-kit/utilities",
  "@anthropic-ai/sdk",
  // Native binary — used server-side to bundle generated vibe projects.
  "esbuild",
];

const manualChunksMap: Record<string, string[]> = {
  "vendor-three": ["three", "@react-three/fiber", "@react-three/drei", "@react-three/rapier"],
  "vendor-monaco-react": ["@monaco-editor/react"],
  "vendor-canvas-ui": ["konva", "react-konva", "yoga-layout"],
  "vendor-tonejs": ["tone"],
  "vendor-motion": ["framer-motion"],
  "vendor-pixi": ["pixi.js"],
  "vendor-recharts": ["recharts"],
};

// Build a reverse lookup: module id → chunk name
const moduleToChunk = new Map<string, string>();
for (const [chunk, modules] of Object.entries(manualChunksMap)) {
  for (const mod of modules) {
    moduleToChunk.set(mod, chunk);
  }
}

function manualChunks(id: string) {
  // Split monaco-editor into sub-chunks by area
  if (id.includes("node_modules/monaco-editor/") || id.includes("node_modules\\monaco-editor\\")) {
    if (id.includes("/esm/vs/language/")) return "vendor-monaco-languages";
    if (id.includes("/esm/vs/basic-languages/")) return "vendor-monaco-basic-languages";
    if (id.includes("/esm/vs/editor/")) return "vendor-monaco-editor";
    if (id.includes("/esm/vs/base/")) return "vendor-monaco-base";
    if (id.includes("/esm/vs/platform/")) return "vendor-monaco-platform";
    if (id.includes("/esm/vs/common/")) return "vendor-monaco-common";
    return "vendor-monaco-misc";
  }
  for (const [mod, chunk] of moduleToChunk) {
    if (id.includes(`node_modules/${mod}/`) || id.includes(`node_modules\\${mod}\\`)) {
      return chunk;
    }
  }
}

export default defineConfig({
  customLogger: logger,
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 7005,
  },
  plugins: [
    stubServerFiles(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "app",
    }),
    react(),
    nitro({
      // traceDeps externalizes packages from Nitro's Rolldown server bundle and
      // traces them into .output/node_modules for runtime resolution.
      // NOTE: Vite's ssr.external is ignored by Nitro — this is the only way
      // to externalize from the production server bundle.
      // `reflect-metadata` is externalized (not bundled) so its global-polyfill
      // side effect isn't tree-shaken away — the startup plugin below relies on
      // it. traceDeps also copies it into .output/node_modules for runtime.
      traceDeps: ["@prisma/client", ".prisma", "@resvg/resvg-js", "satori", "esbuild", "reflect-metadata"],
      // Startup plugins:
      //  - reflect-metadata: installs the polyfill before any request loads the
      //    auth/passkey chunk (which needs it via tsyringe).
      //  - security-headers: adds baseline security headers to every response as
      //    defense-in-depth (mirrors the edge/Traefik policy for non-proxied paths).
      plugins: [
        fileURLToPath(new URL("./server/nitro/reflect-metadata.ts", import.meta.url)),
        fileURLToPath(new URL("./server/nitro/security-headers.ts", import.meta.url)),
      ],
      rollupConfig: {
        external: heavyExternals.map((pkg) => new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.+)?$`)),
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
    pure: ["console.log", "console.debug"],
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
    reportCompressedSize: false,
    rolldownOptions: { onwarn },
  },
  environments: {
    client: {
      dev: {
        warmup: ["app/router.tsx", "app/routes/__root.tsx"],
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
    exclude: ["@resvg/resvg-js", "satori"],
    // Vite 8's optimizer otherwise waits for the full static-import crawl to end
    // before committing optimized deps. With 130 eager routes the crawl never
    // settles, so optimized-dep requests (react.js, etc.) are held forever and
    // the page never hydrates. Commit after the first optimize run instead.
    holdUntilCrawlEnd: false,
  },
  ssr: {
    // ssr.external only affects Vite's dev SSR bundling, NOT the Nitro production
    // server build. For production, traceDeps in the nitro() plugin config is used.
    external: [...heavyExternals, ...ssrOnlyExternals, "@resvg/resvg-js", "satori"],
  },
});
