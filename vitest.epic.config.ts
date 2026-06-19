import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/epic/**/*.test.ts'],
    testTimeout: 60_000, // pagination/build tests spin up Chromium
  },
});
