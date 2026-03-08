/**
 * Fix SSR/client CSS hash mismatch.
 *
 * Vite's SSR and client builds can produce different content hashes for the
 * same CSS file (globals.css). The HTML is rendered by the SSR bundle, so it
 * references the SSR hash, but the actual file on disk has the client hash.
 * This script patches the SSR router bundle to use the client-side hash.
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ASSETS_DIR = ".output/public/assets";
const SSR_DIR = ".output/server/_ssr";

// Find the actual CSS file hash from the client build
const clientCss = readdirSync(ASSETS_DIR).find((f) =>
  f.startsWith("globals-") && f.endsWith(".css")
);

if (!clientCss) {
  console.log("[fix-ssr-css-hash] No globals CSS found in client build, skipping.");
  process.exit(0);
}

const clientHash = clientCss.match(/^globals-(.+)\.css$/)?.[1];

// Patch each SSR bundle file that references a different globals hash
const ssrFiles = readdirSync(SSR_DIR).filter((f) => f.endsWith(".mjs"));
let patched = 0;

for (const file of ssrFiles) {
  const filePath = join(SSR_DIR, file);
  const content = readFileSync(filePath, "utf8");
  const replaced = content.replace(
    /globals-([a-zA-Z0-9_-]+)\.css/g,
    (match, ssrHash) => {
      if (ssrHash !== clientHash) {
        patched++;
        return `globals-${clientHash}.css`;
      }
      return match;
    }
  );
  if (replaced !== content) {
    writeFileSync(filePath, replaced);
  }
}

if (patched > 0) {
  console.log(
    `[fix-ssr-css-hash] Patched ${patched} reference(s): globals-*→globals-${clientHash}.css`
  );
} else {
  console.log("[fix-ssr-css-hash] Hashes already match, no patching needed.");
}
