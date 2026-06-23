/**
 * Pre-bundle the heavy externalized vendor packages (currently just `three`) into
 * self-contained, minified ESM files under `public/vendor-externals/`, so the
 * per-deploy client `vite build` no longer bundles or minifies them. The client
 * build marks them `external` (vite.config.ts) and the browser resolves the bare
 * specifier through the import map in app/routes/__root.tsx.
 *
 * Opt-in: this is a no-op unless VITE_EXTERNALIZE_VENDOR=1. Default builds are
 * byte-for-byte unchanged. See lib/vendor-externals.ts for the rationale + scope.
 *
 * Run: pnpm run build-vendor-externals   (runs as part of `pnpm build` when the
 * flag is set; gated no-op otherwise).
 */

import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VENDOR_EXTERNAL_PACKAGES,
  VENDOR_EXTERNALS_DIR,
} from "../lib/vendor-externals.ts";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = path.join(ROOT, "public", VENDOR_EXTERNALS_DIR);

async function main() {
  if (process.env.VITE_EXTERNALIZE_VENDOR !== "1") {
    console.log(
      "[vendor-externals] VITE_EXTERNALIZE_VENDOR != 1 — skipping (vendors stay bundled).",
    );
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const pkg of VENDOR_EXTERNAL_PACKAGES) {
    // Self-contained bundle: `three` has no runtime deps, so nothing is left
    // external here. Prefer ESM resolution; target the same baseline as the app
    // build (esnext) so we don't down-level a modern lib.
    await build({
      stdin: {
        contents: `export * from "${pkg}";`,
        resolveDir: ROOT,
        loader: "js",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "esnext",
      minify: true,
      legalComments: "none",
      mainFields: ["module", "browser", "main"],
      conditions: ["import", "browser", "default"],
      outfile: path.join(OUT_DIR, `${pkg}.js`),
    });
    console.log(`[vendor-externals] built public/${VENDOR_EXTERNALS_DIR}/${pkg}.js`);
  }
}

main().catch((err) => {
  console.error("[vendor-externals] build failed:", err);
  process.exit(1);
});
