/**
 * Vitest configuration for RMHbox tests
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'testing/**/*.test.ts',
      'lib/cookgame/__tests__/**/*.test.ts',
      'components/cookgame/models/__tests__/**/*.test.ts',
      'lib/dream-rift/__tests__/**/*.test.ts',
      'lib/gabriels-horn/__tests__/**/*.test.ts',
      'lib/laundry-sort/__tests__/**/*.test.ts',
      'lib/massive-march/__tests__/**/*.test.ts',
      'lib/rmhark-ai/__tests__/**/*.test.ts',
      'lib/slice-it/__tests__/**/*.test.ts',
      'lib/rmhladder/**/*.test.ts',
      'lib/homes/**/*.test.ts',
      'lib/isleworks/__tests__/**/*.test.ts',
      'lib/kaikai-debt/__tests__/**/*.test.ts',
      'lib/personas/__tests__/**/*.test.ts',
      'lib/predictions/__tests__/**/*.test.ts',
      'lib/tournaments/__tests__/**/*.test.ts',
      'lib/game-saves/__tests__/**/*.test.ts',
      'lib/temple-of-joy/__tests__/**/*.test.ts',
      'lib/temple-of-joy/__tests__/**/*.test.tsx',
      'lib/__tests__/**/*.test.ts',
      'lib/api/__tests__/**/*.test.ts',
      // The AI seam (provider routing, prompt registry, injection framing).
      // These deliberately never call the network — they test the framing and
      // the routing table, which are the parts that regress silently.
      'lib/ai/__tests__/**/*.test.ts',
      'lib/search/__tests__/**/*.test.ts',
      'lib/liquid-gl/__tests__/**/*.test.ts',
      'lib/daily-puzzles/__tests__/**/*.test.ts',
      'lib/nightrail/__tests__/**/*.test.ts',
      'lib/market/__tests__/**/*.test.ts',
      'lib/versecraft/gen/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/render/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/render/**/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/game/**/__tests__/**/*.test.ts',
      'components/rmhladder/**/*.test.tsx',
      'components/motion/__tests__/**/*.test.tsx',
      'components/errors/__tests__/**/*.test.tsx',
    ],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
