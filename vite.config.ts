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
      // Externalize Prisma from Nitro's Rollup server bundle. Without this,
      // Nitro inlines @prisma/client but leaves a dangling import for
      // ".prisma/client/default" which is an invalid ESM specifier at runtime.
      // traceDeps tells Nitro to externalize + trace these into .output/node_modules.
      traceDeps: ["@prisma/client", ".prisma"],
    }),
  ],
  build: {
    chunkSizeWarningLimit: 4000,
    minify: "esbuild",
    sourcemap: false,
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
    external: [
      // Audio libs (native/WASM — can't bundle)
      "audio-decode",
      "wasm-audio-decoders",
      "@wasm-audio-decoders/common",
      "@wasm-audio-decoders/ogg-vorbis",
      "@eshaz/web-worker",
      // Heavy client-only libs — skip SSR bundling, resolve from node_modules at runtime
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/rapier",
      "monaco-editor",
      "@monaco-editor/react",
      "pixi.js",
      "recharts",
      "framer-motion",
      "canvas-confetti",
      "react-player",
      "emoji-picker-react",
      "react-easy-crop",
      // Additional heavy libs — skip SSR bundling for faster builds
      "lucide-react",
      "katex",
      "zod",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },
});
