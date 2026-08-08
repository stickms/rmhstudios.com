import type { LaunchOptions } from 'playwright';

/**
 * How the epic pipeline launches Chromium.
 *
 * `paginate()` measures real layout in a browser and `buildEpic()` prints the
 * PDF from one, so both need a Chromium and there is no useful fallback. Where
 * that Chromium comes from differs per machine, so the path is an env var
 * rather than a hardcode:
 *
 *   • Nothing set — Playwright resolves the build it downloaded. The normal
 *     developer case, and what `.github/workflows/epic-tests.yml` gets after
 *     `playwright install chromium`.
 *   • `CHROME_PATH` — use that binary instead. Container images commonly ship a
 *     provisioned Chromium whose build number does not match the pinned
 *     Playwright version, and `chromium.launch()` fails looking for a build that
 *     will never be there. Same variable `scripts/perf/canvas2d-probe.mjs` uses.
 *
 * The sandbox flags match the other Playwright callers in `scripts/` and
 * `testing/e2e/`: containers run as a user that cannot use the Chromium sandbox,
 * and `/dev/shm` is usually too small for a page this tall.
 */
export function launchOptions(): LaunchOptions {
  return {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  };
}
