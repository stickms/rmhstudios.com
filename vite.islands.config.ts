/**
 * The island build (redesign audit B1): every `features/<id>/island.tsx` as its
 * own client entry, built OUTSIDE the site's route graph.
 *
 *   pnpm build:islands      # → dist-islands/ (+ .vite/manifest.json)
 *
 * Why a second Vite build and not another input to the site's client build: the
 * site build is TanStack Start's, and rolldown shares modules between every input
 * of one build. An island importing `components/ui/button` would then import the
 * chunk the site placed it in, which since rolldown 1.2.13 is often the site's
 * ENTRY chunk (check-bundle-budget.ts, 2026-10-08) — the island would load the
 * site. A separate build shares nothing but source code.
 *
 * How it is served: `pnpm build` runs this BEFORE `vite build`, so
 *  - Nitro copies `dist-islands/` into `.output/public/islands/` (the
 *    `publicAssets` entry in vite.config.ts, immutable for a year: every file is
 *    content-hashed), and
 *  - the island document (`lib/islands/document.server.ts`) reads
 *    `dist-islands/.vite/manifest.json` through `import.meta.glob`, so the
 *    manifest is inlined into the server bundle at build time. A route serves
 *    `/islands/assets/<entry>-<hash>.js` with no runtime file lookup.
 * In `vite dev` the document points at the source entry instead and the site's
 * dev server compiles it; this config is not involved.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { hoverPolicy } from './lib/hover-css';
import {
  ISLANDS_BASE_URL,
  ISLANDS_OUT_DIR,
  quietLogger,
  rolldownChecks,
  sharedDefine,
  stubServerFiles,
} from './vite.shared';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** `{ <id>: 'features/<id>/island.tsx' }` for every feature that has an island entry. */
export function islandInputs(root = ROOT): Record<string, string> {
  const dir = `${root}/features`;
  const out: Record<string, string> = {};
  for (const id of readdirSync(dir).sort()) {
    const entry = `features/${id}/island.tsx`;
    if (existsSync(`${root}/${entry}`)) out[id] = entry;
  }
  return out;
}

export default defineConfig({
  customLogger: quietLogger(),
  base: ISLANDS_BASE_URL,
  // public/ is the site's; Nitro already serves it. An island ships only its own build output.
  publicDir: false,
  resolve: { tsconfigPaths: true },
  define: sharedDefine(),
  css: { postcss: { plugins: [hoverPolicy()] } },
  plugins: [
    stubServerFiles(),
    tailwindcss(),
    react(),
  ],
  build: {
    outDir: ISLANDS_OUT_DIR,
    emptyOutDir: true,
    // The island document resolves each entry's hashed files from this.
    manifest: true,
    // Same browser floor as the site's client build (vite.config.ts `environments.client`).
    target: 'baseline-widely-available',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4000,
    // Never inline a font into a stylesheet (the site build's rule, B5).
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    rolldownOptions: {
      input: islandInputs(),
      checks: rolldownChecks,
    },
  },
});
