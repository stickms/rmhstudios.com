/**
 * The Toolbox suite — `pnpm test:toolbox`.
 *
 * The twenty utilities under `/tools` (docs/autonomous/sprint-01) are pure,
 * client-side logic: parsers, converters and calculators whose worst failure is
 * a wrong answer on screen. That is not one of the five mission-critical
 * criteria the main suite is scoped to (docs/testing.md §What is not tested), so
 * their tests run here instead, as the TF2 and Balatro suites do.
 * `vitest.config.ts` excludes exactly the glob included here, and
 * lib/__tests__/test-discovery.test.ts checks that the two never overlap.
 * CI: .github/workflows/toolbox-tests.yml.
 */
import path from 'node:path';
import { FRAMER_MOTION_INTERNALS } from './framer-motion-internals.mjs';
import { I18N_RUNTIME_ALIASES } from './i18n-runtime-aliases.mjs';
import { defineConfig } from 'vitest/config';

export const TOOLBOX_SUITE_GLOBS = ['lib/toolbox/**/*.test.ts'];

export default defineConfig({
  test: {
    environment: 'node',
    include: TOOLBOX_SUITE_GLOBS,
    pool: 'threads',
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent' },
  },
  resolve: {
    alias: {
      ...FRAMER_MOTION_INTERNALS,
      ...I18N_RUNTIME_ALIASES,
      '@': path.resolve(import.meta.dirname),
      '@features': path.resolve(import.meta.dirname, 'features'),
    },
  },
});
