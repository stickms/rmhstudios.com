/**
 * The product suite — `pnpm test:product`.
 *
 * Sprint 02 (docs/autonomous/sprint-02) deepens existing product surfaces:
 * flashcard tests, typing lessons, the webhooks console, read-aloud and more.
 * Their pure logic — question generators, lesson curricula, importers, search
 * matchers — fails as a wrong answer on screen, which is not one of the five
 * mission-critical criteria the main suite is scoped to (docs/testing.md §What
 * is not tested). Those tests are named `*.product.test.ts` and run here.
 *
 * A test that does meet a criterion (ownership checks, secrets, auth, a user's
 * data) keeps the plain `*.test.ts` name and stays in the main suite.
 *
 * `vitest.config.ts` excludes exactly the glob included here, and
 * lib/__tests__/test-discovery.test.ts checks that the two never overlap.
 * CI: .github/workflows/product-tests.yml.
 */
import path from 'node:path';
import { FRAMER_MOTION_INTERNALS } from './framer-motion-internals.mjs';
import { I18N_RUNTIME_ALIASES } from './i18n-runtime-aliases.mjs';
import { defineConfig } from 'vitest/config';

export const PRODUCT_SUITE_GLOBS =
  [
    '**/*.product.test.ts',
    '**/*.product.test.tsx',
  ];

export default defineConfig(
  {
    test: {
      environment:
        'node',
      include:
        PRODUCT_SUITE_GLOBS,
      exclude:
        [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/.output/**',
          '.claude/worktrees/**',
        ],
      // The suite fills up feature by feature; an empty run is not a failure.
      passWithNoTests: true,
      pool: 'threads',
      env: {
        LOG_LEVEL:
          process
            .env
            .LOG_LEVEL ??
          'silent',
      },
    },
    resolve:
      {
        alias:
          {
            ...FRAMER_MOTION_INTERNALS,
            ...I18N_RUNTIME_ALIASES,
            '@': path.resolve(
              import.meta
                .dirname,
            ),
            '@features':
              path.resolve(
                import.meta
                  .dirname,
                'features',
              ),
          },
      },
  },
);
