/**
 * The integration suite — `pnpm test:integration`.
 *
 * Black-box tests of real user flows (auth, posting, social writes, coin
 * transfers, the developer API) against a RUNNING app and a real Postgres —
 * plus a few files that drive a server module's SQL/transactions directly on the
 * same database (communities-invites, tag-feed, migrations) —
 * the layer `pnpm test` deliberately never touches (its files are
 * environment-agnostic by design; see vitest.config.ts). Gated on every PR by
 * the `integration` job in .github/workflows/web-ci.yml, which builds the app,
 * migrates a throwaway Postgres, boots `.output/server`, and runs this.
 *
 * Locally: build (`pnpm build:frontend`), migrate a scratch database, start
 * `node .output/server/index.mjs` with DATABASE_URL / BETTER_AUTH_SECRET /
 * BETTER_AUTH_URL, then:
 *
 *   INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=… pnpm test:integration
 *
 * DATABASE_URL must be the SAME database the server uses: the suite seeds a
 * few rows directly (a subscription, a coin balance) and asserts on the ledger.
 * Never point it at anything but a throwaway database.
 *
 * Files run one at a time on purpose. Every request comes from one IP, and the
 * app's real per-IP rate limits (10 sign-ups / posts per minute) stay ON — the
 * suite budgets its requests under them rather than switching them off, so the
 * build it tests is the build that ships.
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['testing/integration/**/*.test.ts'],
    globalSetup: ['testing/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
