/**
 * The Balatro multiplayer end-to-end suite — `pnpm test:balatro:e2e` (PLAN §6.1, §6.3).
 *
 * Three projects (`--project <name>` runs one):
 * - `harness`: unit tests of the e2e machinery itself (channel codec, static
 *   server, stack/accounts helpers): `testing/balatro-e2e/**\/*.unit.test.ts`.
 *   No browser, no network; seconds.
 * - `engine`: Lua L2 — in-engine specs (lib/balatro/lua/mp_test/specs/*_spec.lua)
 *   in the real love.wasm, headless Chromium on SwiftShader, on a static harness
 *   page (no DB, no hub): `testing/balatro-e2e/engine/**\/*.test.ts`. A hard CI gate.
 * - `match`: multi-browser matches (and bot-peer pages) against throwaway Postgres
 *   + the socket hub + `vite dev`: `testing/balatro-e2e/match/**\/*.test.ts`. Needs
 *   DATABASE_URL (or BALATRO_E2E_BASE_URL for a stack that is already up); without
 *   either it skips, unless BALATRO_E2E_REQUIRE_MATCH=1 (CI), where that fails.
 * Chromium comes from Playwright or `CHROME_PATH` (the scripts/epic/browser.ts pattern).
 * Engine and match pages are heavy (software WebGL), so files run one at a time.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const shared = {
  environment: 'node' as const,
  pool: 'forks' as const,
  fileParallelism: false,
  testTimeout: 180_000,
  hookTimeout: 300_000,
};

export default defineConfig({
  test: {
    ...shared,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'harness',
          include: ['testing/balatro-e2e/**/*.unit.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'engine',
          include: ['testing/balatro-e2e/engine/**/*.test.ts'],
          exclude: ['**/*.unit.test.ts', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'match',
          include: ['testing/balatro-e2e/match/**/*.test.ts'],
          exclude: ['**/*.unit.test.ts', '**/node_modules/**'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
});
