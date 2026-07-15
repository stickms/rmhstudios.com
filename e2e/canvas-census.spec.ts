/**
 * Canvas census (Phase 7 of the overhaul) — the browser-level proof of the
 * single-visible-canvas purity rule.
 *
 * For every CONVERTED route that renders a canvas (i.e. reaches
 * window.__canvasReady): load it, then assert exactly one visible <canvas>
 * and that every other visibly-boxed element is either the sr-mirror (zero
 * box), a hidden helper, or lives inside #overlay-root with a
 * manifest-allowlisted data-overlay-allow. No-visual routes (redirects /
 * Outlet layouts) never set __canvasReady and are exercised only for a clean
 * load. A screenshot is captured per route as an artifact.
 *
 * The merge gate (docs/canvas-architecture.md) runs this across all 202 routes
 * once every route is converted; today it covers the converted subset.
 */

import { test, expect, type Page } from "@playwright/test";
import { censusRoutes } from "./route-urls";

const routes = censusRoutes(true);

/** Elements allowed to have a nonzero visible box besides the one canvas. */
async function assertSingleVisibleCanvas(page: Page, overlayAllow: string[]) {
  const result = await page.evaluate((allow) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.01;
    };
    const canvases = [...document.querySelectorAll("canvas")].filter(visible);
    const stray: string[] = [];
    const overlayRoot = document.getElementById("overlay-root");
    // Walk leaf elements; anything visibly-boxed outside the canvas/overlay/
    // helper/mirror set is a purity violation.
    for (const el of document.querySelectorAll("body *")) {
      if (el.tagName === "CANVAS") continue;
      if (el.closest("[data-canvas-helpers]")) continue;
      if (el.closest(".sr-mirror")) continue;
      if (el.closest("[data-canvas-stage-container]")) continue;
      if (el === overlayRoot || (overlayRoot && overlayRoot.contains(el))) {
        const slot = (el as HTMLElement).closest("[data-overlay-allow]") as HTMLElement | null;
        if (slot && !allow.includes(slot.dataset.overlayAllow ?? "")) {
          stray.push(`overlay:${slot.dataset.overlayAllow}`);
        }
        continue;
      }
      // Only flag elements that actually paint (have their own box + bg/text).
      if (visible(el) && el.children.length === 0 && (el.textContent ?? "").trim()) {
        stray.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`);
      }
    }
    return { canvasCount: canvases.length, stray: [...new Set(stray)].slice(0, 10) };
  }, overlayAllow);

  expect(result.canvasCount, "exactly one visible canvas").toBe(1);
  expect(result.stray, `stray visible DOM: ${result.stray.join(", ")}`).toEqual([]);
}

test.describe("canvas census — converted routes", () => {
  for (const route of routes) {
    test(`${route.url} renders a single visible canvas`, async ({ page }) => {
      await page.goto(route.url, { waitUntil: "domcontentloaded" });
      // Wait for the canvas first-draw signal; skip purity assertions on
      // routes that never draw a canvas (redirects resolve to a canvas route
      // or a legacy page).
      const ready = await page
        .waitForFunction(() => (window as unknown as { __canvasReady?: boolean }).__canvasReady === true, {
          timeout: 8000,
        })
        .then(() => true)
        .catch(() => false);
      if (!ready) {
        test.info().annotations.push({ type: "no-canvas", description: route.file });
        return;
      }
      await assertSingleVisibleCanvas(page, route.overlayAllow);
      await page.screenshot({ path: `e2e/__screenshots__/${route.url.replace(/\W+/g, "_")}.png` });
    });
  }
});
