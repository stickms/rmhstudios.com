/**
 * The epic (book/textbook) content-build suite — `pnpm test:epic`.
 *
 * Separate from the main suite for one reason: `scripts/epic/paginate.ts`
 * measures real layout by launching Chromium through Playwright, so these
 * tests need a browser on the machine and minutes of budget, while every test
 * in `vitest.config.ts` is deliberately environment-agnostic. Mixing them
 * would make the fast suite depend on a browser install.
 *
 * Run it after `pnpm exec playwright install chromium`, or point `CHROME_PATH`
 * at a Chromium you already have (`scripts/epic/browser.ts`) — container images
 * often ship one whose build number does not match the pinned Playwright
 * version. Without either, the three pagination/build tests fail at launch
 * rather than skipping, which is on purpose: a silent skip is how a content
 * pipeline rots unnoticed. CI installs the browser in
 * .github/workflows/epic-tests.yml.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/epic/**/*.test.ts'],
    testTimeout: 60_000, // pagination/build tests spin up Chromium
    pool: 'threads',
  },
});
