import { createLogger, defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { nitro } from "nitro/vite";

const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes("has been externalized for browser compatibility")) return;
  if (msg.includes("Error when using sourcemap for reporting an error")) return;
  if (msg.includes("Module level directives cause errors when bundled")) return;
  if (msg.includes(".prisma/client/default")) return;
  originalWarn(msg, options);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onwarn(warning: any, warn: any) {
  if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
  if (warning.code === "UNRESOLVED_IMPORT" && warning.exporter?.includes(".prisma/client")) return;
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
  "audio-decode",
  "wasm-audio-decoders",
  "@wasm-audio-decoders/common",
  "@wasm-audio-decoders/ogg-vorbis",
  "@eshaz/web-worker",
];

// Additional packages for Vite SSR dev bundling only. These have complex
// re-exports that break Rollup's externalization in Nitro's production build,
// but work fine with Vite's dev SSR resolver.
const ssrOnlyExternals = [
  "framer-motion",
  "lucide-react",
  "zod",
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "@dnd-kit/utilities",
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/core",
  "@tiptap/pm",
  "@anthropic-ai/sdk",
];

export default defineConfig({
  customLogger: logger,
  server: {
    port: 7005,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "app",
    }),
    react(),
    nitro({
      // traceDeps externalizes packages from Nitro's Rollup server bundle and
      // traces them into .output/node_modules for runtime resolution.
      // NOTE: Vite's ssr.external is ignored by Nitro — this is the only way
      // to externalize from the production server bundle.
      traceDeps: ["@prisma/client", ".prisma"],
      rollupConfig: {
        external: heavyExternals.map((pkg) => new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.+)?$`)),
      },
    }),
  ],
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4000,
    minify: "esbuild",
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { onwarn },
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          onwarn,
          output: {
            manualChunks: {
              "vendor-three": ["three", "@react-three/fiber", "@react-three/drei", "@react-three/rapier"],
              "vendor-editor": ["monaco-editor", "@monaco-editor/react"],
              "vendor-tiptap": [
                "@tiptap/react",
                "@tiptap/starter-kit",
                "@tiptap/extension-character-count",
                "@tiptap/extension-code-block-lowlight",
                "@tiptap/extension-color",
                "@tiptap/extension-highlight",
                "@tiptap/extension-image",
                "@tiptap/extension-link",
                "@tiptap/extension-placeholder",
                "@tiptap/extension-table",
                "@tiptap/extension-table-cell",
                "@tiptap/extension-table-header",
                "@tiptap/extension-table-row",
                "@tiptap/extension-task-item",
                "@tiptap/extension-task-list",
                "@tiptap/extension-text-align",
                "@tiptap/extension-text-style",
                "@tiptap/extension-underline",
              ],
              "vendor-motion": ["framer-motion"],
              "vendor-pixi": ["pixi.js"],
              "vendor-recharts": ["recharts"],
            },
          },
        },
      },
    },
  },
  ssr: {
    // ssr.external only affects Vite's dev SSR bundling, NOT the Nitro production
    // server build. For production, traceDeps in the nitro() plugin config is used.
    external: [...heavyExternals, ...ssrOnlyExternals],
  },
});
