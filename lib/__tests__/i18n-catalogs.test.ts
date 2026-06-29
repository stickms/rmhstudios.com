import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, NAMESPACES, CORE_NAMESPACES } from "@/lib/i18n/config";

function pathFor(locale: string, ns: string): string {
  return join(process.cwd(), "locales", locale, `${ns}.json`);
}
function load(locale: string, ns: string): Record<string, string> {
  return JSON.parse(readFileSync(pathFor(locale, ns), "utf8"));
}

describe("catalog integrity", () => {
  // Any namespace a locale provides must match the English key set exactly.
  // Namespaces a locale has not been translated for yet are simply absent and
  // fall back to English per key, so they are skipped here.
  for (const ns of NAMESPACES) {
    const en = Object.keys(load("en", ns)).sort();
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      if (!existsSync(pathFor(locale, ns))) continue;
      it(`${locale}/${ns} has exactly the English key set`, () => {
        expect(Object.keys(load(locale, ns)).sort()).toEqual(en);
      });
    }
  }

  // Every locale must at least provide the full core namespace set.
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    for (const ns of CORE_NAMESPACES) {
      it(`${locale} provides core namespace ${ns}`, () => {
        expect(existsSync(pathFor(locale, ns))).toBe(true);
      });
    }
  }
});
