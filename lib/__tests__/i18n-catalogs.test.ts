import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, NAMESPACES } from "@/lib/i18n/config";

function load(locale: string, ns: string): Record<string, string> {
  return JSON.parse(readFileSync(join(process.cwd(), "locales", locale, `${ns}.json`), "utf8"));
}

describe("catalog integrity", () => {
  for (const ns of NAMESPACES) {
    const en = Object.keys(load("en", ns)).sort();
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      it(`${locale}/${ns} has exactly the English key set`, () => {
        expect(Object.keys(load(locale, ns)).sort()).toEqual(en);
      });
    }
  }
});
