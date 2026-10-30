/**
 * The Balatro multiplayer end-to-end suite — `pnpm test:balatro:e2e` (STUB).
 *
 * WS0 scaffolding: WS14 owns this file and fills it in (PLAN §6.1, §6.3):
 * - project `engine`: L2 in-engine specs (lib/balatro/lua/mp_test/specs/*_spec.lua)
 *   in the real love.wasm on a static harness (no DB, no hub);
 * - project `match`: multi-browser matches against throwaway Postgres + hub +
 *   `vite dev`, plus bot-peer pages.
 * Chromium comes from `CHROME_PATH` (the scripts/epic/browser.ts pattern).
 * Until WS14 lands, it collects nothing and passes.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['testing/balatro-e2e/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: 'forks',
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
});
