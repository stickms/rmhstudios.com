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
      'lib/rmhark-ai/__tests__/**/*.test.ts',
      'lib/rmhladder/**/*.test.ts',
      'lib/homes/**/*.test.ts',
      'lib/personas/__tests__/**/*.test.ts',
      'lib/predictions/__tests__/**/*.test.ts',
      'lib/tournaments/__tests__/**/*.test.ts',
      'lib/__tests__/**/*.test.ts',
      'lib/liquid-gl/__tests__/**/*.test.ts',
      'lib/daily-puzzles/__tests__/**/*.test.ts',
      'lib/market/__tests__/**/*.test.ts',
      'lib/versecraft/gen/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/render/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/render/**/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/game/**/__tests__/**/*.test.ts',
      'components/rmhladder/**/*.test.tsx',
      'components/motion/__tests__/**/*.test.tsx',
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
