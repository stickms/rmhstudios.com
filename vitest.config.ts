/**
 * The main test suite.
 *
 *   pnpm test                 # everything below
 *   pnpm test <path…>         # a file or directory
 *   pnpm test:watch           # watch mode
 *   pnpm test:coverage        # + V8 coverage to text/html/lcov
 *
 * Two things about this file are load-bearing:
 *
 * **1. Discovery is a glob, not a list.** It used to be a hand-maintained
 * `include` array — one entry per feature directory — and it failed the way
 * every hand-maintained list fails. `lib/liquid-gl/` was renamed to
 * `lib/liquid/` and its entry became a glob matching nothing, so
 * `lib/liquid/__tests__/droplet.test.ts` and `lib/http-body.server.test.ts`
 * sat green in the repo without ever running; `vitest run lib/http-body.server.test.ts`
 * answered "No test files found" for a file that passes. A test that does not
 * run is worse than no test — it is a claim of coverage that nothing backs.
 * So: everything matching the glob runs, and the only way to opt out is an
 * explicit, commented entry in `exclude`.
 *
 * **2. Two projects, split by whether a file may share a module registry.** Files that mock a module,
 * stub a global or fake the clock (`NEEDS_OWN_REGISTRY` below) run in `isolated`, a fresh registry per file,
 * because what they change outlives them: with a shared registry the next file in the worker imports the mock.
 * Everything else runs in `shared` (`isolate: false`), which skips re-evaluating the module graph per file:
 * about 17% off the suite (247 s to 205 s on 4 cores, 2026-11-27). A blanket `--no-isolate` is still not an
 * option: on vitest 5.1.2 it fails 2484 tests in 377 files. The split is deterministic, so a new mocking test
 * lands in `isolated` by itself. If a file passes alone but fails in `shared`, add it to
 * `vitest.isolated-files.json` (one-directional: remove an entry once it passes shared).
 */
import { uiTestAliases } from './vitest.aliases.mjs';
import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ENGINE_TESTS_FROM_MAIN_SUITE } from './vitest.engine-tests.mjs';

/**
 * Test files are import-bound more than CPU-bound — each one pays a transform +
 * module-graph walk before its first assertion — so a worker per core leaves
 * cores idle waiting on I/O. Measured on a 4-core box, full suite: 3 workers
 * (the old default) 46s · 4 workers 41s · **6 workers 37s** · 8 workers 38s and
 * into subprocess-timeout flakes. 1.5× lands on the knee; the cap keeps a
 * 32-core laptop from opening 48 workers and paging.
 */
const maxWorkers = Math.min(12, Math.max(2, Math.ceil(availableParallelism() * 1.5)));

/** Files no part of this suite collects (each has its own suite or is a generated/tooling dir). */
export const EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-server/**',
  '**/.output/**',
  '**/.tanstack/**',
  '**/coverage/**',
  // Claude Code agent worktrees (gitignored) are full checkouts of other
  // branches. Collected, they run a second, stale copy of the whole suite
  // and fail the commit gate for code that is not in this tree.
  '.claude/worktrees/**',
  // The epic (book/textbook) content-build pipeline launches Chromium and
  // needs 60s timeouts, so it is its own suite: `pnpm test:epic`
  // (vitest.epic.config.ts), gated by .github/workflows/epic-tests.yml.
  'scripts/epic/**',
  // The integration suite drives a RUNNING app and a real Postgres, so it
  // is its own suite: `pnpm test:integration` (vitest.integration.config.ts),
  // gated by the `integration` job in .github/workflows/web-ci.yml.
  'testing/integration/**',
  // The TF2 browser game is gameplay, not mission-critical, so it is its
  // own suite: `pnpm test:tf2` (vitest.tf2.config.ts), gated by
  // .github/workflows/tf2-game-tests.yml.
  'lib/tf2-game/**',
  'scripts/tf2-game/**',
  'server/socket-server/tf2/**',
  // The single-player game layer (HL2 / Portal) is gameplay on the same
  // engine: it runs in the TF2 suite, `pnpm test:tf2` (vitest.tf2.config.ts).
  'lib/sp-game/**',
  // CS:GO (de_dust2) is gameplay on the same engine too: the TF2 suite runs it.
  'lib/csgo-game/**',
  // The HUD editor's and the loadout's model are the same engine project
  // (tsconfig.engine.json, audit AR4), so their tests run in that suite too.
  // Their server side is not: `*.server.test.ts` and the tests the engine
  // project names in its `exclude` are site files and stay here.
  ...ENGINE_TESTS_FROM_MAIN_SUITE,
  // Multiplayer Balatro is gameplay too: its own suite, `pnpm test:balatro`
  // (vitest.balatro.config.ts, which includes exactly these globs), gated by
  // .github/workflows/balatro-mp-tests.yml. The mission-critical Balatro
  // tests (features/balatro/engine/__tests__/saves.test.ts, the hub auth walk under
  // server/socket-server/handlers/__tests__/) stay here.
  'features/balatro/engine/mp/**',
  'lib/shared/p2p/**',
  'features/balatro/server/hub/**',
  'scripts/balatro/**',
  // Its browser end-to-end suite: `pnpm test:balatro:e2e` (vitest.balatro-e2e.config.ts).
  'testing/balatro-e2e/**',
  // The Toolbox's pure utilities (/tools) are not mission-critical either: their own
  // suite, `pnpm test:toolbox` (vitest.toolbox.config.ts), gated by .github/workflows/toolbox-tests.yml.
  'lib/toolbox/**',
  // Sprint 02's product logic (`*.product.test.ts`) is not mission-critical either: its own
  // suite, `pnpm test:product` (vitest.product.config.ts), gated by .github/workflows/product-tests.yml.
  '**/*.product.test.ts',
  '**/*.product.test.tsx',
];

/**
 * Which test files may share a module registry (`isolate: false`).
 *
 * A file that mocks a module, stubs a global or fakes the clock changes state that outlives it when the
 * registry is shared: the next file in the same worker would import the mock. So those files keep a fresh
 * registry per file (the `isolated` project) and only files that do none of that run in `shared`. The rule is
 * a pattern, not a list, so a new mocking test lands in `isolated` by itself. `vitest.isolated-files.json`
 * names the few other files that hold module state (an in-memory Prisma double, a singleton) and are
 * one-directional: remove an entry once its file passes under `isolate: false`.
 */
const NEEDS_OWN_REGISTRY =
  /\bvi\.(mock|doMock|stubGlobal|stubEnv|useFakeTimers|setSystemTime|resetModules|spyOn|hoisted)\b/;
const EXTRA_ISOLATED: string[] = (
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vitest.isolated-files.json'), 'utf8')) as { files: string[] }
).files;
function splitByIsolation(): { isolated: string[]; shared: string[] } {
  const isolated = new Set(EXTRA_ISOLATED);
  const shared: string[] = [];
  for (const file of globSync('**/*.test.{ts,tsx}', { cwd: import.meta.dirname, exclude: (name) => name === 'node_modules' || name === '.git' || name === '.output' || name === '.cache' || name === 'dist' })) {
    const rel = file.split(path.sep).join('/');
    if (isolated.has(rel)) continue;
    if (NEEDS_OWN_REGISTRY.test(readFileSync(path.resolve(import.meta.dirname, rel), 'utf8'))) isolated.add(rel);
    else shared.push(rel);
  }
  return { isolated: [...isolated].sort(), shared: shared.sort() };
}
const { isolated: ISOLATED_FILES, shared: SHARED_FILES } = splitByIsolation();

export default defineConfig({
  test: {
    // Brings the untracked generated modules (route tree, pre-paint script) up to date first.
    globalSetup: ['scripts/vitest-global-gen.ts'],
    // No persistent module cache on CI. CI restores node_modules (where the cache lives) from a
    // lockfile-keyed actions cache, so a transformed `lib/__tests__/api-handler-modules.ts` keeps
    // a stale `import.meta.glob` expansion and misses API files added since. Local runs keep it.
    fsModuleCache: !process.env.CI,
    // Every *.test.ts(x) in the repo, minus the exclusions below.
    // `include` and `exclude` live in the projects, not here: an `extends: true` project MERGES array options with
    // the root's, so a root `include` would make `isolated` collect every file.
    // Two projects over the same files, split by whether the file needs its own module registry
    // (see the header, point 2). `shared` reuses workers' module graphs across files, which is where
    // the time goes; `isolated` is the old behaviour, for the files in vitest.isolated-files.json.
    projects: [
      { extends: true, test: { name: 'isolated', isolate: true, include: ISOLATED_FILES, exclude: EXCLUDE } },
      { extends: true, test: { name: 'shared', isolate: false, include: SHARED_FILES, exclude: EXCLUDE } },
    ],
    environment: 'node',
    globals: true,
    // Threads beat forks here (~8% on the full suite): the files are
    // environment-agnostic by design — no real Postgres, network or FS — so
    // nothing needs a process boundary, and a worker_thread starts far cheaper
    // than a child process.
    pool: 'threads',
    maxWorkers,
    env: {
      /**
       * Silence the structured server logger (server/shared/logger.ts).
       *
       * The rmhbox phase tests drive real lobby state machines and minigame
       * loops, so a *green* run used to emit ~10,000 JSON log lines — a 1.4 MB
       * transcript in which the handful of lines that matter (a
       * `match_persist_error`, a deprecation warning) were invisible. Turning
       * the logger off at the source beats stubbing `console`: a test that
       * wants to assert on a log line raises the level for its own scope
       * (testing/rmhbox/phase-1/7-server-config-logger.test.ts does).
       *
       * Set through `env` rather than a setup file on purpose — a setupFiles
       * entry is a module load per test file, and at 426 files that measured
       * 4.7s of pure overhead to assign one string.
       *
       * `LOG_LEVEL=debug pnpm test …` still wins, which is how you get the
       * logs back while debugging.
       */
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Report on what the suite is actually about: shared logic, the service
      // tier and the components. Extensions are pinned — an extensionless
      // `lib/**` hands the provider every CLAUDE.md in the tree and it tries to
      // parse them as source (a wall of PARSE_ERROR that does not fail the run,
      // which is the worst kind of broken).
      include: [
        'lib/**/*.{ts,tsx}',
        'server/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'stores/**/*.{ts,tsx}',
        'features/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // Generated: 16 locale catalogs, ~1 MB of object literals.
        'lib/i18n/resources.*.ts',
      ],
      // Informational, not a gate — see docs/testing.md §Coverage.
    },
  },
  resolve: { alias: uiTestAliases },
});
