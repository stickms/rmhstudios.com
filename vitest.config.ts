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
 * **2. Isolation stays ON.** Each test file gets a fresh module registry.
 * `--no-isolate` runs this suite in ~20s instead of ~30s, and it was measured:
 * nine files fail outright (shared `vi.mock` registry), and two more —
 * `lib/rmhladder/pipeline/{run,process-source}.test.ts` — fail *differently on
 * every seed* under `--sequence.shuffle`, because their in-memory Prisma
 * doubles are module state. Order-dependent red is worse than slow green, and
 * this repo's whole gate culture is built on the suite being evidence. The
 * speed came from elsewhere (see `maxWorkers` below and the notes in
 * docs/testing.md §Speed).
 */
import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';
import path from 'node:path';

/**
 * Test files are import-bound more than CPU-bound — each one pays a transform +
 * module-graph walk before its first assertion — so a worker per core leaves
 * cores idle waiting on I/O. Measured on a 4-core box, full suite: 3 workers
 * (the old default) 46s · 4 workers 41s · **6 workers 37s** · 8 workers 38s and
 * into subprocess-timeout flakes. 1.5× lands on the knee; the cap keeps a
 * 32-core laptop from opening 48 workers and paging.
 */
const maxWorkers = Math.min(12, Math.max(2, Math.ceil(availableParallelism() * 1.5)));

export default defineConfig({
  test: {
    // Every *.test.ts(x) in the repo, minus the exclusions below.
    include: ['**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-server/**',
      '**/.output/**',
      '**/.tanstack/**',
      '**/coverage/**',
      // The epic (book/textbook) content-build pipeline launches Chromium and
      // needs 60s timeouts, so it is its own suite: `pnpm test:epic`
      // (vitest.epic.config.ts), gated by .github/workflows/epic-tests.yml.
      'scripts/epic/**',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
