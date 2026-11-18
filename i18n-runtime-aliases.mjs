// @ts-check
import { fileURLToPath } from 'node:url';

/**
 * `i18next` and `react-i18next` resolve to the site's own runtime
 * (lib/i18n/runtime/) in every Vite build and the unit-test Vitest configs, so the 1,500 call sites
 * keep their imports and their types while the entry drops both libraries
 * (modernization audit, "small translation runtime"). TypeScript still reads the
 * real packages' types. Scripts run with tsx outside Vite and get the real
 * packages. lib/i18n/__tests__/runtime-parity.test.ts compares the two.
 */
/** @type {Record<string, string>} */
export const I18N_RUNTIME_ALIASES =
  {
    i18next:
      fileURLToPath(
        new URL(
          './lib/i18n/runtime/i18next.ts',
          import.meta
            .url,
        ),
      ),
    'react-i18next':
      fileURLToPath(
        new URL(
          './lib/i18n/runtime/react-i18next.ts',
          import.meta
            .url,
        ),
      ),
  };
