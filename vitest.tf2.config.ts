/**
 * The TF2 browser game's suite — `pnpm test:tf2`.
 *
 * Separate from the main suite because the main suite is scoped to what breaks
 * money, user data, privacy, auth or a deploy (docs/testing.md), and these
 * tests are about how the game plays: movement against the SDK's numbers,
 * weapon damage, map logic, the network protocol. Tests that need real game
 * files read a Steam install from `TF2_ROOT` and skip without one; CI runs
 * the rest in .github/workflows/tf2-game-tests.yml.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/tf2-game/**/*.test.ts',
      'scripts/tf2-game/**/*.test.ts',
      'server/socket-server/tf2/**/*.test.ts',
      // The single-player layer (Half-Life 2 demo, Portal: First Slice) on the same engine.
      'lib/sp-game/**/*.test.ts',
      // Counter-Strike: Global Offensive (de_dust2) on the same engine.
      'lib/csgo-game/**/*.test.ts',
      // Harmonic: the original story shooter on the same engine (docs/plans/harmonic/).
      'lib/harmonic-game/**/*.test.ts',
    ],
    testTimeout: 60_000,
    pool: 'threads',
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
});
