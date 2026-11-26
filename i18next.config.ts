import { defineConfig } from 'i18next-cli';

/**
 * Extracts t("...") keys from the app into locales/en/<ns>.json. English only:
 * the other locales are written by the i18n-translate workflow on the
 * `i18n/catalogs` branch (docs/translations.md). Run it with `pnpm i18n:extract`.
 *
 * ## Why this config is load-bearing (read before changing `removeUnusedKeys`)
 *
 * The extractor can only see keys it can read as string literals in a call it
 * recognises. Everything it cannot see looks *removed* to it, and with
 * `removeUnusedKeys: true` that meant `pnpm i18n:extract` DELETED live
 * translations (~3.9k lines across the catalogs, under the old i18next-cli
 * `keepRemoved: false`). Two blind spots did the damage:
 *
 * 1. **Aliased `t`.** Roughly twenty call sites destructure the hook under
 *    another name (`const { t: ts } = useTranslation(...)`) to hold two
 *    namespaces in one component. Add the alias to `T_FUNCTIONS` in the same
 *    commit that introduces one, or its keys are invisible.
 * 2. **Keys built at runtime.** Bum's Rush stores i18n keys in its level
 *    manifest (`bums.world.w1.name`) and resolves them dynamically, with a zod
 *    regex enforcing that they ARE keys. No literal ever appears in a `t()`
 *    call, so no extractor can find them.
 *
 * So the extractor is additive only. The cost is that genuinely dead keys
 * accumulate; the cost of the alternative was deleting live translations. A
 * stale key is a few bytes, a deleted one is a visible bug. Prune
 * deliberately instead: `pnpm i18n:coverage`.
 */
const T_FUNCTIONS = ['t', '*.t', 'ts', 'tFeed', 'tl', 'tr', 'tSlice', 'tn'];

export default defineConfig({
  // English only: the other locales live on the i18n/catalogs branch and are
  // filled by the i18n-translate workflow, never by the extractor.
  locales: ['en'],
  extract: {
    input: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'features/**/*.{ts,tsx}',
      // Tests are not UI.
      '!features/**/*.test.{ts,tsx}',
      '!features/**/__tests__/**',
    ],
    output: 'locales/{{language}}/{{namespace}}.json',
    primaryLanguage: 'en',
    defaultNS: 'common',
    nsSeparator: ':',
    keySeparator: false,
    functions: T_FUNCTIONS,
    transComponents: ['Trans'],
    sort: true,
    // New keys with no literal defaultValue get an empty string, as the old extractor wrote.
    defaultValue: '',
    removeUnusedKeys: false,
  },
});
