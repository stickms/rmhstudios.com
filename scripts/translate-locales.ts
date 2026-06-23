/**
 * Generate zh/ar catalogs from the English source of truth.
 * Idempotent: only (re)translates missing or English-changed keys, and records
 * the English source it translated from in locales/<lng>/.sources.<ns>.json so
 * human edits survive. Requires the AI provider env vars used by translateText.
 *
 * Usage: pnpm run i18n:translate
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { translateText } from "@/lib/ai/text.server";
import { LOCALES, NAMESPACES, TRANSLATE_TARGETS } from "@/lib/i18n/config";
import { keysToTranslate, type Catalog } from "@/lib/i18n/diff";

const ROOT = join(process.cwd(), "locales");

function read(path: string): Catalog {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
function write(path: string, data: Catalog) {
  writeFileSync(path, JSON.stringify(sortKeys(data), null, 2) + "\n");
}
function sortKeys(data: Catalog): Catalog {
  return Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
}

async function run() {
  for (const ns of NAMESPACES) {
    const source = read(join(ROOT, "en", `${ns}.json`));
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const target = read(join(ROOT, locale, `${ns}.json`));
      const sourcesPath = join(ROOT, locale, `.sources.${ns}.json`);
      const sources = read(sourcesPath);
      const todo = keysToTranslate({ source, sources, target });
      if (todo.length === 0) {
        console.log(`[i18n] ${locale}/${ns}: up to date`);
        continue;
      }
      console.log(`[i18n] ${locale}/${ns}: translating ${todo.length} key(s)`);
      for (const key of todo) {
        try {
          target[key] = await translateText(source[key], TRANSLATE_TARGETS[locale as "zh" | "ar"]);
          sources[key] = source[key];
        } catch (err) {
          console.warn(`[i18n]   skip "${key}": ${(err as Error).message}`);
        }
      }
      write(join(ROOT, locale, `${ns}.json`), target);
      write(sourcesPath, sources);
    }
  }
}

run().then(() => console.log("[i18n] done")).catch((e) => {
  console.error(e);
  process.exit(1);
});
