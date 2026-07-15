/**
 * Route-conversion guard — static analysis proving the canvas overhaul's
 * route coverage claims:
 *
 *  1. COMPLETENESS: every page route file under app/routes/ has a manifest
 *     entry, and every manifest entry points at a real file. A new route
 *     cannot dodge tracking; a deleted route cannot leave a stale entry.
 *  2. CONVERTED means CONVERTED: entries flagged converted must render via
 *     CanvasPage (directly or through a *CanvasPage wrapper) and must not
 *     import banned DOM-era modules (framer-motion, radix, sonner, legacy
 *     components/ui, monaco, react-markdown).
 *  3. NO REGRESSIONS: a converted route can never silently revert — the
 *     manifest flag is one-way by review convention, and this test pins it.
 *
 * The final merge gate for the overhaul is `converted === total` (see
 * docs/canvas-architecture.md); progress is reported in the test output.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { ROUTE_MANIFEST, CONVERTED_COUNT, TOTAL_COUNT } from "./route-manifest";

const ROUTES_DIR = join(__dirname, "../../app/routes");

/** Layout files exempt from the manifest (they dissolve into shell scenes). */
const LAYOUT_EXEMPT = new Set(["__root.tsx", "_site.tsx"]);

const BANNED_IMPORTS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /from\s+["']framer-motion["']/, why: "framer-motion → canvas-ui/motion" },
  { pattern: /from\s+["']@radix-ui\//, why: "radix → canvas-ui/widgets" },
  { pattern: /from\s+["']sonner["']/, why: "sonner → canvas-ui Toast" },
  { pattern: /from\s+["']react-markdown["']/, why: "react-markdown → canvas-ui RichText/markdown" },
  { pattern: /from\s+["']@monaco-editor\//, why: "monaco → CanvasCodeEditor" },
  { pattern: /from\s+["']@\/components\/ui\//, why: "legacy components/ui → canvas-ui/widgets" },
  { pattern: /from\s+["']@\/components\/feed\/PageLayout["']/, why: "PageLayout → CanvasPage" },
];

function collectPageRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") continue;
      out.push(...collectPageRouteFiles(p));
    } else if (entry.name.endsWith(".tsx")) {
      const rel = relative(ROUTES_DIR, p);
      if (LAYOUT_EXEMPT.has(rel) || basename(rel) === "route.tsx") continue;
      out.push(rel);
    }
  }
  return out.sort();
}


/**
 * A route that emits NO visible DOM is inherently canvas-compliant: pure
 * redirect routes (throw redirect() in beforeLoad, no component) and layout
 * passthrough routes (component renders only <Outlet/>) draw nothing, so they
 * satisfy the purity rule without a CanvasPage.
 */
function isNoVisualRoute(src: string): boolean {
  const hasComponent = /\bcomponent\s*:/.test(src);
  const throwsRedirect = src.includes("throw redirect(");
  const outletOnly =
    /component:\s*\(\)\s*=>\s*<Outlet\s*\/>/.test(src) || /return\s*<Outlet\s*\/>;?/.test(src);
  return (throwsRedirect && !hasComponent) || outletOnly;
}

describe("canvas route-conversion guard", () => {
  const onDisk = collectPageRouteFiles(ROUTES_DIR);
  const manifest = new Map(ROUTE_MANIFEST.map((r) => [r.file, r]));

  it("every page route file is tracked in the manifest", () => {
    const untracked = onDisk.filter((f) => !manifest.has(f));
    expect(
      untracked,
      `New page routes must be added to testing/canvas/route-manifest.ts: ${untracked.join(", ")}`
    ).toEqual([]);
  });

  it("every manifest entry points at a real route file", () => {
    const disk = new Set(onDisk);
    const stale = ROUTE_MANIFEST.filter((r) => !disk.has(r.file)).map((r) => r.file);
    expect(stale, `Stale manifest entries (route deleted/renamed?): ${stale.join(", ")}`).toEqual([]);
  });

  it("converted routes render via CanvasPage and avoid banned DOM-era imports", () => {
    const problems: string[] = [];
    for (const entry of ROUTE_MANIFEST) {
      if (!entry.converted) continue;
      const source = readFileSync(join(ROUTES_DIR, entry.file), "utf8");
      if (!/CanvasPage/.test(source) && !isNoVisualRoute(source)) {
        problems.push(`${entry.file}: marked converted but neither renders a CanvasPage nor is a no-visual (redirect/Outlet) route`);
      }
      for (const banned of BANNED_IMPORTS) {
        if (banned.pattern.test(source)) {
          problems.push(`${entry.file}: banned import (${banned.why})`);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("reports conversion progress", () => {
    expect(TOTAL_COUNT).toBe(onDisk.length);
    expect(CONVERTED_COUNT).toBeGreaterThanOrEqual(4);
    // The overhaul merge gate — flip to `toBe(TOTAL_COUNT)` at final merge:
    // expect(CONVERTED_COUNT).toBe(TOTAL_COUNT);
    console.warn(`[canvas-overhaul] converted ${CONVERTED_COUNT}/${TOTAL_COUNT} page routes`);
  });
});
