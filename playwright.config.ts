/**
 * Playwright config for the canvas-overhaul e2e census (Phase 7).
 *
 * `e2e/canvas-census.spec.ts` loads every converted route and asserts the
 * single-visible-canvas purity rule. Chromium is pre-installed in the managed
 * environment at /opt/pw-browsers; CI installs it explicitly. The web server
 * is the production build served on 7005 (blue port).
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 7005);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse an already-running dev/prod server locally; CI starts one.
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "node .output/server/index.mjs",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(PORT) },
      },
});
