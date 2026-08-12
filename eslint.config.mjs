import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import local from './eslint-local-rules/index.js';

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      '.output/**',
      '.tanstack/**',
      '.vinxi/**',
      'bazel-*/**',
      'dist-server/**',
      'build/**',
      'node_modules/**',
      'public/vibe-packages/**',
      // Plain JS server files — CommonJS require() is intentional
      'webhook-server.cjs',
      'check_db.js',
      'sync_db.js',
    ],
  },

  // ── Base configs ──────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Node scripts & build tooling (plain .mjs, not in the TS program) ──────
  // typescript-eslint disables no-undef for .ts files (tsc already checks it),
  // but plain JS/MJS still needs its globals declared. These run under Node and
  // some drive a browser via Playwright `page.evaluate()`, so they legitimately
  // reference both Node and DOM globals.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        AbortController: 'readonly',
        queueMicrotask: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // DOM globals referenced inside Playwright page.evaluate() callbacks.
        document: 'readonly',
        window: 'readonly',
        getComputedStyle: 'readonly',
        self: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
      },
    },
  },

  // ── Service workers (browser ServiceWorkerGlobalScope) ────────────────────
  // Matched by a glob, not by filename: `public/sw.js` was named literally, so
  // the SECOND service worker added (`sw-share-target.js`, the POST share
  // target) fell through to the DOM-microsite block below and tripped no-undef
  // on `self` and `Response`. Any `public/sw*.js` is a worker.
  {
    files: ['public/sw*.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        skipWaiting: 'readonly',
        registration: 'readonly',
        importScripts: 'readonly',
        addEventListener: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Used by the offline write outbox (B10) and the share-target handler.
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        crypto: 'readonly',
        // `WorkerNavigator` — a real member of ServiceWorkerGlobalScope, not a
        // DOM leak. The push handler reads `navigator.setAppBadge` so the
        // unread count is right even when no page is open, which is the whole
        // reason the badge lives here rather than only in the app.
        navigator: 'readonly',
      },
    },
  },

  // ── Static browser microsites under public/ (hand-authored DOM scripts) ───
  // Plain browser <script> assets served as-is (e.g. the rmh-internal-affairs
  // site), not part of the app bundle or the TS program, so eslint needs their
  // DOM/browser globals declared or every `document`/`setTimeout` reference
  // trips no-undef. `public/sw.js` keeps its own service-worker block above.
  {
    files: ['public/**/*.js'],
    ignores: ['public/sw*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        FormData: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
      },
    },
  },

  // ── React Hooks ───────────────────────────────────────────────────────────
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // These rules are too strict for the many valid patterns used
      // throughout this codebase (mount-time setState, ref-based animation
      // loops, cascading effect guards, etc.).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },

  // ── Accessibility (jsx-a11y) ──────────────────────────────────────────────
  // Rules that are already at zero violations are enforced as "error" so
  // regressions can't land. Rules with an existing backlog stay at "warn" so
  // they surface in PRs without blocking the build; promote each to "error" as
  // it is driven to zero.
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      // Enforced (zero violations — keep them at zero).
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      // Backlog (existing violations — surface as warnings, promote when clean).
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-role': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/heading-has-content': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },

  // ── Repo-local rules ──────────────────────────────────────────────────────
  // Conventions no published plugin can know about. Kept at "warn" for the same
  // reason as the jsx-a11y backlog above: there are existing violations, and a
  // rule that turns the build red on the day it lands gets disabled rather than
  // driven to zero. Promote to "error" once the count reaches zero.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { local },
    rules: {
      'local/no-adhoc-user-select': 'warn',
      // "error", not "warn", unlike its neighbour: this one has no backlog. The
      // four offending sites were fixed on 2026-08-11 (they were carrying a
      // 431 KB / 116 KB-gzip icon chunk onto every page that reached them), so
      // the count is zero and the only direction it can move is up. The failure
      // is invisible — bytes, not correctness — which is exactly why it needs to
      // fail the build rather than add a line to a warning list nobody reads.
      // See docs/loading-audit-2026-08-11/02-critical-path.md §1.
      'local/no-lucide-namespace-import': 'error',
      // Same shape as the rule above, same reason for "error": the backlog is
      // zero as of 2026-08-12, and the failure is invisible.
      //
      // `Providers` wraps the app in `<LazyMotion>` and `lib/motion-features.ts`
      // exists ONLY so the heavy animation/gesture/layout/drag drivers load in an
      // async chunk after first paint. Importing `motion` opts that module out:
      // it bundles its own full feature implementation, which lands in whatever
      // chunk the module belongs to — the SHARED ENTRY when the module is
      // reachable from a route's top level. So one file importing `motion`
      // silently cancels the split for every page that loads it, and the 121
      // files that correctly use `m` get nothing.
      //
      // Fifteen modules had regressed to `motion` (including `radial/Parallax`,
      // which is in the site shell and therefore on every `_site` route's
      // critical path); all fixed 2026-08-12. See
      // docs/performance-audit-2026-08-12.md §1.3.
      //
      // `m`, `AnimatePresence`, `LazyMotion`, `MotionConfig`, the hooks and all
      // types are unrestricted — only the `motion` component is the problem.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'framer-motion',
              importNames: ['motion'],
              message:
                'Import `m as motion` instead. `motion` ships its own full feature bundle and defeats the <LazyMotion> split in components/Providers.tsx (docs/performance-audit-2026-08-12.md §1.3).',
            },
          ],
        },
      ],
    },
  },

  // ── Tests may hold the whole icon set ─────────────────────────────────────
  // `local/no-lucide-namespace-import` is about BUNDLE SIZE, and a test is never
  // bundled — nothing a `*.test.ts` imports reaches a browser. Meanwhile
  // `lib/__tests__/catalog.test.ts` needs the full set for a check that cannot be
  // written any other way: it asserts every catalog entry's `iconName` names a
  // real Lucide icon. That check is the reason the catalog schema deliberately
  // does NOT validate `iconName` itself (doing so would drag the icon set into
  // every bundle that reads the catalog), so moving it out of a test would
  // recreate exactly the problem the rule exists to prevent.
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'testing/**/*.{ts,tsx}'],
    rules: {
      'local/no-lucide-namespace-import': 'off',
    },
  },

  // ── NOT ENABLED: raw <img> dimension rule (OPT-29) ────────────────────────
  // The proposed rule is:
  //
  //   'no-restricted-syntax': ['warn', {
  //     selector:
  //       "JSXOpeningElement[name.name='img']:not(:has(JSXAttribute[name.name='width'])):not(:has(JSXAttribute[name.name='srcSet']))",
  //     message: 'Raw <img> needs width+height (CLS) — or use <OptimizedImage>.',
  //   }]
  //
  // Measured on 2026-08-05 it fires **98 times** across `app/` and
  // `components/`. The quality bar in CONTRIBUTING.md is "add no new warnings
  // relative to the base branch", so landing it here would hand every
  // subsequent PR a 98-warning inheritance and the rule would be deleted rather
  // than driven to zero — the failure mode the jsx-a11y block above is written
  // to avoid. It belongs in its own change that fixes the 98 sites and enables
  // the rule in the same commit. Left here as the record of the measurement so
  // the next person does not have to re-derive it.

  // ── Project-wide rule overrides ───────────────────────────────────────────
  {
    rules: {
      // New in ESLint 10's recommended set, where it ships as an ERROR. It
      // fires 39 times across `lib/`, `components/`, `server/` and `scripts/`,
      // and almost every hit is the same deliberate shape: a defensive
      // initializer before a conditional assignment (`let ok = false` guarding
      // a try/catch, `let localBossDamage = 0` before the branches of a sim
      // step). Those initializers are load-bearing for readability and for TS's
      // definite-assignment analysis — dropping them to satisfy the rule would
      // make the code worse, not better.
      //
      // So this follows the jsx-a11y backlog convention above: surface as a
      // warning, promote when clean. A handful of the 39 ARE genuinely useless
      // (e.g. `return (h ^= h >>> 16) >>> 0` in lib/versecraft/gen/rng.ts, where
      // nothing reads `h` again) and are worth fixing in their own change.
      'no-useless-assignment': 'warn',
      // Downgrade from error to warning so the build isn't blocked.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch (_)` is this repo's established "deliberately ignored" marker
          // — it appears throughout the service worker and the telemetry paths,
          // where swallowing is the point (telemetry must never throw). The rule
          // checks caught errors separately from vars and defaults to flagging
          // ALL of them, so the `^_` convention was honoured everywhere EXCEPT
          // the one place it is used most. Saying so removes the warnings rather
          // than suppressing them case by case.
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Downgrade pre-existing code quality issues to warnings.
      // Tighten these as the codebase is cleaned up.
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Prevent debug console.log in production paths
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
