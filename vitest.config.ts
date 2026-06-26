/**
 * Vitest configuration for RMHbox tests
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'testing/**/*.test.ts',
      'lib/dream-rift/__tests__/**/*.test.ts',
      'lib/rmhark-ai/__tests__/**/*.test.ts',
      'lib/personas/__tests__/**/*.test.ts',
      'lib/predictions/__tests__/**/*.test.ts',
      'lib/__tests__/**/*.test.ts',
      'lib/kowloon-knockout/render/__tests__/**/*.test.ts',
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
