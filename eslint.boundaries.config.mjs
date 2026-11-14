// Boundary + cycle rules (audit item A5). NOT part of `pnpm lint`: these rules
// have existing violations, so they run through the ratchet instead
// (`pnpm lint:ratchet`, scripts/check-lint-ratchet.ts), which compares per-file
// counts against eslint-baseline/boundaries.json and fails if any count rises.
// When A1 introduces features/ and packages/, grow this into the full
// eslint-plugin-boundaries element map from the plan and shrink the baseline.
import tseslint from 'typescript-eslint';
import path from 'node:path';
import importX, {
  createNodeResolver,
} from 'eslint-plugin-import-x';

/**
 * Game / app feature directories (the per-feature dirs under components/ and
 * lib/; the catalog is lib/catalog). Shared code must not
 * reach into these. Add a new game/app here when it is added to the catalog.
 */
export const FEATURE_DIRS =
  [
    'altair',
    'balatro',
    'baccarat',
    'blackjack',
    'csgo-game',
    'cursed-logic',
    'dream-rift',
    'dunesday',
    'gabriels-horn',
    'hearthworks',
    'holdem',
    'house-always-wins',
    'kaikai-debt',
    'kowloon-knockout',
    'laundry-sort',
    'lights-out',
    'lockdown',
    'marathon',
    'neon-driftway',
    'nightrail',
    'pf2ecal',
    'plinko',
    'rebar-rutabaga',
    'rideshare',
    'rmh-capital',
    'rmh-datacenter',
    'rmh-pmc',
    'rmhbox',
    'rmhcalculator',
    'rmhcode',
    'rmhfashion',
    'rmhladder',
    'rmhmusic',
    'rmhstudy',
    'rmhtube',
    'rmhtype',
    'rmhvibe',
    'roulette',
    'signal-forge',
    'slice-it',
    'sohumtracker',
    'sp-game',
    'speedrun',
    'synapse-storm',
    'temple-of-joy',
    'tf2-game',
    'tf2-hud',
    'vega',
    'velum2099',
    'versecraft',
    'void-breaker',
  ];

// NOTE: flat config does not merge `no-restricted-imports` options across
// blocks (the last matching block wins), so each block lists its full set.
const featurePattern =
  {
    regex: `^(@/(components|lib)/(${FEATURE_DIRS.join('|')})|@features)(/|$)`,
    message:
      'Shared code (ui/shared/hooks/stores/utils) must not import a game/app feature directory. Move the shared piece into ui/ or shared/.',
  };
const libLayerPattern =
  {
    regex:
      '^@/components(/|$)',
    message:
      'lib/ must not import from components/ (lib is the lower layer).',
  };
// *.server modules: value imports are server-only; type imports are erased.
// Client trees only. Files using createServerFn (e.g. components/events/EventsColumn.tsx)
// import server modules type-only today, so no value-import allow-list is needed.
const serverPattern =
  {
    regex:
      '\\.server(\\.ts)?$',
    allowTypeImports: true,
    message:
      'Value imports of *.server modules belong in server functions/handlers only (type-only imports are fine).',
  };
// unrs-resolver (with tsconfig `paths`, for the `@/` alias) can return paths
// relative to the cwd; import-x compares resolved paths with the absolute file
// name, so a relative result silently disables no-cycle. Normalise to absolute.
const nodeResolver =
  createNodeResolver(
    {
      extensions:
        [
          '.ts',
          '.tsx',
          '.js',
          '.jsx',
          '.mjs',
          '.json',
        ],
      tsconfig:
        {
          configFile:
            path.resolve(
              'tsconfig.json',
            ),
        },
    },
  );
const absoluteResolver =
  {
    ...nodeResolver,
    resolve(
      source,
      file,
      ...rest
    ) {
      const r =
        nodeResolver.resolve(
          source,
          file,
          ...rest,
        );
      return r &&
        r.found &&
        r.path
        ? {
            ...r,
            path: path.resolve(
              r.path,
            ),
          }
        : r;
    },
  };
const restrict =
  (
    ...patterns
  ) => [
    'error',
    {
      patterns,
    },
  ];
const ts =
  '*.{ts,tsx}';

export default tseslint.config(
  {
    ignores:
      [
        '.cache/**',
        '.output/**',
        '.tanstack/**',
        '.vinxi/**',
        'bazel-*/**',
        'dist-server/**',
        'build/**',
        'node_modules/**',
        'public/**',
        'app/routeTree.gen.ts',
      ],
  },
  {
    files:
      [
        `**/${ts}`,
      ],
    languageOptions:
      {
        parser:
          tseslint.parser,
        parserOptions:
          {
            ecmaFeatures:
              {
                jsx: true,
              },
          },
      },
    linterOptions:
      {
        noInlineConfig: true,
        reportUnusedDisableDirectives:
          'off',
      },
    plugins:
      {
        'import-x':
          importX,
      },
    settings:
      {
        'import-x/extensions':
          [
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.mjs',
          ],
        'import-x/resolver-next':
          [
            absoluteResolver,
          ],
      },
  },
  // Import cycles, scoped to the client/shared trees to keep the run fast
  // (the node tier in server/ is covered by tsc and its bundles).
  {
    files:
      [
        `components/**/${ts}`,
        `lib/**/${ts}`,
        `hooks/**/${ts}`,
        `stores/**/${ts}`,
        `features/**/${ts}`,
      ],
    rules:
      {
        'import-x/no-cycle':
          [
            'error',
            {
              maxDepth: 4,
              ignoreExternal: true,
            },
          ],
      },
  },
  // lib/ is below components/ in the layering.
  // A feature's engine/ (and server/, net/, api/) is the lib half of the feature; its ui/ is the components half.
  {
    files:
      [
        `lib/**/${ts}`,
        `features/*/engine/**/${ts}`,
        `features/*/server/**/${ts}`,
        `features/*/net/**/${ts}`,
      ],
    rules:
      {
        'no-restricted-imports':
          restrict(
            libLayerPattern,
          ),
      },
  },
  // Client trees: no value imports of .server modules.
  {
    files:
      [
        `components/**/${ts}`,
        `hooks/**/${ts}`,
        `stores/**/${ts}`,
        `features/*/ui/**/${ts}`,
      ],
    rules:
      {
        'no-restricted-imports':
          restrict(
            serverPattern,
          ),
      },
  },
  // Shared dirs must not import feature dirs.
  {
    files:
      [
        `components/ui/**/${ts}`,
        `components/shared/**/${ts}`,
        `hooks/**/${ts}`,
        `stores/**/${ts}`,
      ],
    rules:
      {
        'no-restricted-imports':
          restrict(
            featurePattern,
            serverPattern,
          ),
      },
  },
  // lib shared files: feature rule plus the layering rule.
  {
    files:
      [
        `lib/shared/**/${ts}`,
        `lib/utils/**/${ts}`,
        'lib/utils.ts',
      ],
    rules:
      {
        'no-restricted-imports':
          restrict(
            featurePattern,
            libLayerPattern,
          ),
      },
  },
  // Server-side files may value-import .server modules.
  {
    files:
      [
        `**/*.server.{ts,tsx}`,
        `**/api/**/${ts}`,
      ],
    rules:
      {
        'no-restricted-imports':
          'off',
      },
  },
);
