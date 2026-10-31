/**
 * Lua L2: in-engine specs in the real love.wasm (PLAN §6.1), project `engine`:
 *
 *   pnpm test:balatro:e2e --project engine
 *
 * Boots the harness page (no DB, no hub; testing/balatro-e2e/engine/page) against
 * the committed packs and runs every lib/balatro/lua/mp_test/specs/*_spec.lua inside
 * ONE engine boot, one vitest test per spec file in name order (the harness returns to
 * the main menu between files). Then it boots a second, fresh browser context WITHOUT
 * the MP pack and checks the reports that must be identical across boots: a vanilla
 * seed's first shop, and the golden seeds of sp_invariance_spec (first 3 shops, tags and
 * bosses) — single-player invariance before MP loads, after it loads, and after a
 * practice mount/unmount.
 *
 * BALATRO_E2E_ISOLATE=1 also runs every spec file alone in its own fresh boot (order
 * independence; slow, so the nightly CI run sets it).
 * Needs Chromium (Playwright's, or CHROME_PATH) — it fails, never skips, without it.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  defaultEngineQuery,
  openEngine,
  startEngineStack,
  type EnginePage,
  type EngineStack,
} from '../lib/engine-driver';
import { toTap, type SpecSummary } from '../lib/channel';
import { MP_TEST_DIR } from '../lib/build-harness';

/** Every spec file, in the order the harness lists them (sorted names). */
const SPEC_FILES = readdirSync(path.join(MP_TEST_DIR, 'specs'))
  .filter((f) => f.endsWith('_spec.lua'))
  .map((f) => f.replace(/\.lua$/, ''))
  .sort();

/** Per spec file: software-rendered runs on a shared CI runner. */
const FILE_TIMEOUT_MS = Number(process.env.BALATRO_E2E_SPEC_TIMEOUT_MS || 1_200_000);
/** The harness gives up on a spec file this long before vitest's own timeout, so it can say why. */
const WATCHDOG_MARGIN_MS = 30_000;

const t0 = Date.now();
const stamp = () => `${Math.round((Date.now() - t0) / 1000)} s`;

/**
 * Progress while a file runs: every test result (and a Lua crash) as the page logs it, so a
 * slow or stuck file shows where it is instead of printing nothing until it ends.
 */
const progress = (line: string) => {
  if (/^(ok {2}|FAIL|skip|CRASH)/.test(line))
    process.stdout.write(`#   [${stamp()}] ${line.slice(0, 600)}\n`);
};

/**
 * Runs one spec file, failing with the page's last log lines if it is still running after
 * `ms` (a hung or far too slow spec, reported before the CI job's own timeout kills the run
 * with no output). On a timeout or a lost page the page is closed: `reopen` gives the next file
 * a fresh boot.
 */
async function runFile(page: EnginePage, file: string, ms: number): Promise<SpecSummary> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void page
        .pageState()
        .catch(() => null)
        .then((st) => {
          const tail = st ? st.logs.slice(-40).join('\n') : '(page state unavailable)';
          // vitest may show only the message's first line: the tail goes to the log as well
          process.stdout.write(
            `# ${file}: watchdog after ${Math.round(ms / 1000)} s; last engine log lines:\n${tail}\n`,
          );
          reject(
            new Error(
              `${file} still running after ${Math.round(ms / 1000)} s (status ${st?.status ?? '?'}); last engine log lines:\n${tail}`,
            ),
          );
        });
    }, ms);
  });
  try {
    return await Promise.race([page.runSpecs({ files: [file] }), watchdog]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let stack: EngineStack;
let first: EnginePage | null = null;
/** A file timed out or lost the page, so later files ran in another boot. */
let lostBoot = false;
const reports: Record<string, unknown> = {};

const failuresOf = (s: SpecSummary) =>
  s.tests.filter((t) => !t.ok).map((t) => `${t.name}: ${t.msg}`);

beforeAll(async () => {
  stack = await startEngineStack();
  first = await openEngine(stack.browser, stack.server.url, {
    query: defaultEngineQuery(),
    onLog: progress,
  });
}, 300_000);

/** A fresh boot for the files after one that timed out or lost its page. */
async function reopen(): Promise<EnginePage> {
  await first?.close().catch(() => {});
  first = await openEngine(stack.browser, stack.server.url, {
    query: defaultEngineQuery(),
    onLog: progress,
  });
  return first;
}

afterAll(async () => {
  await first?.close().catch(() => {});
  await stack?.close();
});

describe('engine-spec harness (one boot)', () => {
  it('boots the shipped core pack to the main menu with the harness installed', async () => {
    expect(first!.version).toBe('1.0.1o-FULL');
    expect(await first!.call('ping')).toBe('pong');
    expect(await first!.call<string[]>('list_specs')).toEqual(SPEC_FILES);
  });

  for (const file of SPEC_FILES) {
    it(
      `${file} is green after the files before it`,
      async () => {
        const started = Date.now();
        process.stdout.write(`# [${stamp()}] ${file} …\n`);
        let s: SpecSummary;
        try {
          s = await runFile(first ?? (await reopen()), file, FILE_TIMEOUT_MS - WATCHDOG_MARGIN_MS);
        } catch (e) {
          // The page is stuck in this file (or gone): the next file gets a fresh boot.
          lostBoot = true;
          await first?.close().catch(() => {});
          first = null;
          throw e;
        }
        Object.assign(reports, s.reports);
        process.stdout.write(
          `# ${file} (${Math.round((Date.now() - started) / 1000)} s)\n${toTap(s)}\n`,
        );
        if (Object.keys(s.reports).length)
          process.stdout.write(`# reports ${JSON.stringify(s.reports).slice(0, 4000)}\n`);
        expect(s.tests.length).toBeGreaterThan(0);
        expect(failuresOf(s)).toEqual([]);
      },
      FILE_TIMEOUT_MS,
    );
  }

  it('saw no Lua crash and no page errors', async () => {
    expect(lostBoot, 'a spec file timed out or lost its page (see above)').toBe(false);
    const page = first ?? (await reopen());
    const s = await page.pageState();
    expect(s.status).toBe('ready');
    expect(page.errors.filter((e) => !/favicon|AudioContext|audio/i.test(e))).toEqual([]);
  });

  it(
    'a second, fresh boot without the MP pack deals the same golden seeds (SP invariance)',
    async () => {
      const shop = reports.first_shop;
      expect(typeof shop).toBe('string');
      const golden = reports.sp_golden;
      expect(golden && typeof golden).toBe('object');
      // In the first boot: MP loaded (after every content spec mounted/unmounted) and after
      // one more practice cycle — both must be equal …
      expect(reports.sp_golden_remount).toEqual(golden);
      // One software-rendered page at a time: the first boot has done its part.
      await first?.close();
      first = null;
      // … and a boot where MP never loads at all (no ?mp=1) is the reference.
      const second = await openEngine(stack.browser, stack.server.url, { query: '' });
      try {
        const again = await second.runSpecs({ files: ['engine_smoke_spec', 'sp_invariance_spec'] });
        process.stdout.write(`${toTap(again)}\n`);
        expect(failuresOf(again)).toEqual([]);
        expect(again.reports.first_shop).toBe(shop);
        expect(again.reports.sp_golden_vanilla).toEqual(golden);
      } finally {
        await second.close();
      }
    },
    FILE_TIMEOUT_MS,
  );
});

describe.skipIf(process.env.BALATRO_E2E_ISOLATE !== '1')(
  'engine specs in isolation (fresh boot each)',
  () => {
    for (const file of SPEC_FILES) {
      it(
        `${file} is green alone`,
        async () => {
          const page = await openEngine(stack.browser, stack.server.url, {
            query: defaultEngineQuery(),
          });
          try {
            const s = await page.runSpecs({ files: [file] });
            process.stdout.write(`# ${file} alone\n${toTap(s)}\n`);
            expect(s.tests.length).toBeGreaterThan(0);
            expect(failuresOf(s)).toEqual([]);
          } finally {
            await page.close();
          }
        },
        FILE_TIMEOUT_MS + 300_000,
      );
    }
  },
);
