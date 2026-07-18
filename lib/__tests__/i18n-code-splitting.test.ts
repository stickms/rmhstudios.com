import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { LOCALES } from "@/lib/i18n/config";
import { LOCALE_LOADERS } from "@/lib/i18n/resources";

/**
 * Regression guard: only the user's SELECTED locale is ever shipped to the
 * client — the per-language catalogs must stay code-split behind dynamic
 * `import()`, never statically bundled.
 *
 * The one intentional exception is `resources.en-core` (the small core-namespace
 * English catalog), which is statically bundled as the universal per-key
 * fallback. Every other catalog — including the full English one
 * (`resources.en`) — must load lazily, so a single page load fetches only the
 * active locale (its core inlined by the SSR loader, the rest as one chunk).
 *
 * These are SOURCE checks (no build required) so they run in the normal suite
 * and fail fast the moment someone reintroduces a static locale import.
 */

const ROOT = process.cwd();

// A per-locale catalog specifier: `resources.<locale>` (the full per-language
// module, incl. `resources.en`) or a raw `locales/<locale>/…` JSON path.
// `resources.en-core` is deliberately NOT matched — the `(?![\w-])` lookahead
// rejects the trailing `-core`, since the core catalog is the one we DO bundle.
const LOCALE_ALT = LOCALES.join("|");
const CATALOG_SPECIFIER = new RegExp(
  `(?:resources\\.(?:${LOCALE_ALT})(?![\\w-])|(?:^|/)locales/(?:${LOCALE_ALT})/)`,
);

/**
 * The catalog specifiers a source STATICALLY imports — via `import … from "x"`,
 * a bare `import "x"`, or `export … from "x"`. A dynamic `import("x")` (the
 * code-splitting mechanism we WANT) is intentionally not reported.
 */
function staticCatalogImports(src: string): string[] {
  const hits: string[] = [];
  const strRe = /["'`]([^"'`\n]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(src))) {
    const spec = m[1];
    if (!CATALOG_SPECIFIER.test(spec)) continue;
    const before = src.slice(Math.max(0, m.index - 24), m.index);
    const isDynamicImport = /\bimport\s*\(\s*$/.test(before); // import("x")
    const isStaticImport = /\bfrom\s*$/.test(before) || /\bimport\s*$/.test(before);
    if (!isDynamicImport && isStaticImport) hits.push(spec);
  }
  return hits;
}

/** Recursively collect .ts/.tsx files under `dir`, skipping node_modules/tests. */
function collectSources(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      collectSources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Files excluded from the client-delivery scan:
 *  - `*.server.ts(x)` — stubbed out of the client bundle by stubServerFiles().
 *  - `lib/i18n/resources.*` — the loader (checked on its own below) and the
 *    per-locale split modules themselves (which legitimately import their JSON
 *    and are only ever reached via dynamic import()).
 *  - `app/routes/api/**` — server-only request handlers, never shipped to the
 *    browser.
 *  - `routeTree.gen.ts` — generated.
 */
function isExcludedFromClientScan(relPath: string): boolean {
  const p = relPath.split(sep).join("/");
  return (
    /\.server\.[tj]sx?$/.test(p) ||
    p.startsWith("lib/i18n/resources.") ||
    p.startsWith("app/routes/api/") ||
    p.endsWith("routeTree.gen.ts")
  );
}

describe("i18n code-splitting (only the selected locale reaches the client)", () => {
  it("LOCALE_LOADERS has exactly one lazy loader per locale", () => {
    expect(Object.keys(LOCALE_LOADERS).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(typeof LOCALE_LOADERS[locale]).toBe("function");
    }
  });

  it("the client loader (resources.ts) statically imports only en-core; every locale is dynamic", () => {
    const src = readFileSync(join(ROOT, "lib/i18n/resources.ts"), "utf8");
    // No per-locale catalog is statically imported here — they must all be
    // reached via the dynamic import() loaders in LOCALE_LOADERS.
    expect(staticCatalogImports(src)).toEqual([]);
    // And there is a dynamic import() for every locale (the split points).
    for (const locale of LOCALES) {
      expect(src).toMatch(new RegExp(`import\\([^)]*resources\\.${locale}\\b`));
    }
  });

  it("no client-shipped module statically imports a per-locale catalog", () => {
    const files = [
      ...collectSources(join(ROOT, "app")),
      ...collectSources(join(ROOT, "components")),
      ...collectSources(join(ROOT, "hooks")),
      ...collectSources(join(ROOT, "stores")),
      ...collectSources(join(ROOT, "lib")),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (isExcludedFromClientScan(rel)) continue;
      const bad = staticCatalogImports(readFileSync(file, "utf8"));
      if (bad.length) offenders.push(`${rel} → ${bad.join(", ")}`);
    }
    // A non-empty list means a locale catalog would be statically bundled and
    // shipped to every visitor. Move the import behind LOCALE_LOADERS instead.
    expect(offenders).toEqual([]);
  });
});
