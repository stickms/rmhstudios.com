/**
 * The Balatro multiplayer suite — `pnpm test:balatro`.
 *
 * Separate from the main suite for the same reason as the TF2 suite: the main
 * suite is scoped to what breaks money, user data, privacy, auth or a deploy
 * (docs/testing.md), and these tests are about how multiplayer Balatro plays —
 * the referee, the timers, the P2P transport, the hub's signalling, the pack
 * builder and the Lua mailbox. The mission-critical slices (the hub auth walk,
 * rate-limit coverage, save-path safety, the pack manifest) stay in the main
 * suite. `vitest.config.ts` excludes exactly the globs included here, and
 * lib/__tests__/test-discovery.test.ts checks that the two never overlap.
 *
 * The Lua L1 specs (lib/balatro/lua/spec/*_spec.lua) run inside this suite via
 * lib/balatro/mp/__tests__/lua-specs.test.ts, which needs `lua5.1` on PATH
 * (or `LUA51=/path/to/lua5.1`) and fails, rather than skips, without it.
 * CI: .github/workflows/balatro-mp-tests.yml.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export const BALATRO_SUITE_GLOBS = [
  'lib/balatro/mp/**/*.test.ts',
  'lib/shared/p2p/**/*.test.ts',
  'server/socket-server/balatro/**/*.test.ts',
  'scripts/balatro/**/*.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    include: BALATRO_SUITE_GLOBS,
    testTimeout: 60_000,
    pool: 'threads',
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent' },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
});
