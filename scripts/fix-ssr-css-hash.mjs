/**
 * Fix SSR/client CSS hash mismatch.
 *
 * Vite's SSR and client builds can produce different content hashes for the
 * same entry stylesheet. The HTML is rendered by the SSR bundle, so it
 * references the SSR hash, but the actual file on disk has the client hash.
 * This script patches the SSR bundle to use the client-side hash, for each of
 * the entry sheets `__root.tsx` links (app/site-tier.css, app/app-tier.css —
 * see lib/style-tier.ts).
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ASSETS_DIR = ".output/public/assets";
const SSR_DIR = ".output/server/_ssr";
const ENTRY_SHEETS = ["site-tier", "app-tier"];

const assets = readdirSync(ASSETS_DIR);
const ssrFiles = readdirSync(SSR_DIR).filter((f) => f.endsWith(".mjs"));

for (const name of ENTRY_SHEETS) {
  const pattern = new RegExp(`^${name}-([a-zA-Z0-9_-]+)\\.css$`);
  const clientHash = assets.map((f) => f.match(pattern)?.[1]).find(Boolean);
  if (!clientHash) {
    console.log(`[fix-ssr-css-hash] No ${name} CSS found in client build, skipping.`);
    continue;
  }

  let patched = 0;
  for (const file of ssrFiles) {
    const filePath = join(SSR_DIR, file);
    const content = readFileSync(filePath, "utf8");
    const replaced = content.replace(
      new RegExp(`${name}-([a-zA-Z0-9_-]+)\\.css`, "g"),
      (match, ssrHash) => {
        if (ssrHash === clientHash) return match;
        patched++;
        return `${name}-${clientHash}.css`;
      }
    );
    if (replaced !== content) writeFileSync(filePath, replaced);
  }

  console.log(
    patched > 0
      ? `[fix-ssr-css-hash] Patched ${patched} reference(s): ${name}-*→${name}-${clientHash}.css`
      : `[fix-ssr-css-hash] ${name}: hashes already match, no patching needed.`
  );
}
