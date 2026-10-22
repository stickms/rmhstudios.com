// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion harness route (T26) — headless Chromium walk-through.
//
//   EVERSION_LAB_OPEN=1 pnpm exec vite dev --port 7005     # terminal 1
//   node testing/e2e/eversion-lab.mjs                      # terminal 2
//
//   BASE_URL=http://localhost:7005   (default)
//   EVERSION_ARTIFACT_DIR=...        screenshots land in <dir>/eversion-lab/
//
// ## Authentication
//
// `/eversion-lab` is admin-only. A real admin session needs a seeded database
// and a login, which this suite does not want; instead the dev server is
// started with `EVERSION_LAB_OPEN=1`, the one dev-only bypass the route's gate
// honours (`components/radial/eversion/lab/access.ts` — ignored when
// NODE_ENV=production). Without the flag the script's first check fails:
// a signed-out visitor is redirected away from the route, which is also the
// proof that the gate is live.
//
// ## What it asserts
//
//  1. The route renders and the host reports ready (real WebGL2, SwiftShader).
//  2. For each of the five projections, at five scrub points (hub, wrap,
//     mid-evert, unwrap, reveal), the scrub completes and the canvas is
//     screenshotted. No `console.error` / page error occurs anywhere.
//  3. The scrubber's END key reaches the end of the timeline (SCRUB_MAX).
//  4. A real Play run completes and reports frame stats.
// ─────────────────────────────────────────────────────────────────────────────

/* global requestAnimationFrame -- referenced only inside page.evaluate() callbacks, run in the page. */
import { launchBrowser, BASE_URL, ARTIFACT_DIR, writeArtifact } from './lib/eversion-session.mjs';

const PROJECTIONS = ['mercator', 'peirce', 'stereographic', 'lambert', 'equirect'];
/** Button label → scrub time it sets (ms) — see STAGE_BUTTONS in EversionLab.tsx. */
const POINTS = [
  ['Hub (0)', 0],
  ['Wrap', 350],
  ['Mid-evert', 2250],
  ['Unwrap', 3800],
  ['Reveal', 4600],
];

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL  ${m}`);
};

const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const res = await page.goto(`${BASE_URL}/eversion-lab?eversion-debug=1`, { waitUntil: 'load' });
  if (!page.url().includes('/eversion-lab')) {
    throw new Error(
      `redirected to ${page.url()} (HTTP ${res?.status()}) — start the dev server with EVERSION_LAB_OPEN=1`,
    );
  }
  const note = page.locator('[data-eversion-lab-note]');
  await page.waitForFunction(
    () =>
      /ready|scrubbed/.test(document.querySelector('[data-eversion-lab-note]')?.textContent ?? ''),
    null,
    { timeout: 30_000 },
  );
  console.log(`host: ${await page.locator('[data-eversion-lab-mode]').textContent()}`);

  async function pickProjection(id) {
    await page.getByTestId('lab-projection').click();
    await page.getByRole('option', { name: id, exact: true }).click();
  }
  async function scrubTo(label, ms) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(
      (want) =>
        (document.querySelector('[data-eversion-lab-note]')?.textContent ?? '') ===
        `scrubbed to ${want} ms`,
      ms,
      { timeout: 20_000 },
    );
    // The scrub draws synchronously in the core; give the compositor a frame to present it.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }

  for (const projection of PROJECTIONS) {
    await pickProjection(projection);
    for (const [label, ms] of POINTS) {
      // Re-click-safe: the note only changes when the scrub result lands.
      await scrubTo(label, ms);
      const png = await page.locator('[data-eversion-lab-stage]').screenshot();
      writeArtifact(`eversion-lab/${projection}-${String(ms).padStart(4, '0')}.png`, png);
    }
    console.log(`ok    ${projection}: ${POINTS.length} scrub points`);
  }

  // The scrubber reaches the end of the timeline.
  await page.getByTestId('lab-scrub').getByRole('slider').focus();
  await page.keyboard.press('End');
  const tText = await page.locator('[data-eversion-lab-t]').textContent();
  if (!/^\d{4,} ms/.test(tText ?? ''))
    fail(`END key did not reach the end of the timeline (${tText})`);
  await page.waitForFunction(
    () =>
      /scrubbed to \d{4,} ms/.test(
        document.querySelector('[data-eversion-lab-note]')?.textContent ?? '',
      ),
    null,
    { timeout: 20_000 },
  );
  console.log(`ok    scrubber end: ${tText?.trim()} / ${await note.textContent()}`);

  // A real run.
  // SwiftShader draws a few frames a second and the timeline clamps each step
  // (MAX_DT_MS), so a full-length run is slow; fast-forward lets it finish.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: /fast-forward/i }).click();
  await page.waitForFunction(
    () => /frames/.test(document.querySelector('[data-eversion-lab-last-run]')?.textContent ?? ''),
    null,
    { timeout: 120_000 },
  );
  console.log(`ok    play: ${await page.locator('[data-eversion-lab-last-run]').textContent()}`);

  for (const p of problems) fail(p);
  writeArtifact('eversion-lab/problems.json', JSON.stringify(problems, null, 2));
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}

console.log(`screenshots: ${ARTIFACT_DIR}/eversion-lab/`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('eversion-lab: all checks passed');
