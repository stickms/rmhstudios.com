/**
 * Playwright side of the engine-spec harness: start the static stack, open a
 * harness page in a fresh browser context (fresh IndexedDB → no cached pack, no
 * saves), wait for the main menu, send commands, run in-engine specs.
 *
 *   const stack = await startEngineStack();          // build + static server
 *   const engine = await openEngine(stack.browser, stack.server.url);
 *   const summary = await engine.runSpecs();         // every mp_test/specs/*_spec.lua
 *   await engine.call('start_run', { seed: 'ABC' }); // any autopilot command
 *   await engine.close(); await stack.close();
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { buildHarness } from './build-harness';
import { chromiumLaunchOptions } from './chromium';
import { zSpecSummary, type SpecResult, type SpecSummary } from './channel';
import { REPO_ROOT, startStaticServer, type StaticServer } from './static-server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The harness query that MP specs need: `mp=1` (extract the MP pack) whenever the pack
 * manifest lists one, else none. Specs that need the pack skip themselves without it.
 */
export function defaultEngineQuery(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'lib/balatro/game-pack.json'), 'utf8'),
    ) as { mp?: { file?: string } };
    return manifest.mp?.file ? 'mp=1' : '';
  } catch {
    return '';
  }
}

/** Software-rendered boot on a CI runner: download + unpack + engine start. */
export const BOOT_TIMEOUT_MS = Number(process.env.BALATRO_E2E_BOOT_TIMEOUT_MS ?? 240_000);

interface PageState {
  status: 'booting' | 'ready' | 'crashed' | 'failed';
  version: string;
  error: string;
  logs: string[];
  specs: SpecResult[];
  phases: string[];
}

export interface EngineStack {
  browser: Browser;
  server: StaticServer;
  close(): Promise<void>;
}

export async function startEngineStack(): Promise<EngineStack> {
  const bundleDir = await buildHarness();
  const server = await startStaticServer({ bundleDir });
  const browser = await chromium.launch(chromiumLaunchOptions());
  return {
    browser,
    server,
    async close() {
      await browser.close().catch(() => {});
      await server.close();
    },
  };
}

export class CommandError extends Error {
  constructor(
    readonly cmd: string,
    readonly data: unknown,
  ) {
    super(
      `${cmd} failed: ${typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : JSON.stringify(data)}`,
    );
  }
}

export interface EnginePage {
  page: Page;
  context: BrowserContext;
  version: string;
  /** Console errors and page errors seen so far. */
  errors: string[];
  call<T = unknown>(cmd: string, args?: unknown[] | Record<string, unknown>): Promise<T>;
  runSpecs(opts?: { files?: string[]; filter?: string }): Promise<SpecSummary>;
  pageState(): Promise<PageState>;
  close(): Promise<void>;
}

export async function openEngine(
  browser: Browser,
  baseUrl: string,
  opts: {
    query?: string;
    timeoutMs?: number;
    verbose?: boolean;
    /** Receives the page's log lines (engine prints, spec results) about once a second. */
    onLog?: (line: string) => void;
  } = {},
): Promise<EnginePage> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 500)}`);
    if (opts.verbose) process.stdout.write(`[page] ${m.text()}\n`);
  });
  await page.goto(`${baseUrl}/${opts.query ? `?${opts.query}` : ''}`);
  let tail: ReturnType<typeof setInterval> | null = null;
  if (opts.onLog) {
    const onLog = opts.onLog;
    tail = setInterval(() => {
      page
        .evaluate(
          () =>
            (
              window as unknown as { __balatroEngine?: { drain(): string[] } }
            ).__balatroEngine?.drain() ?? [],
        )
        .then(
          (lines) => lines.forEach(onLog),
          () => {},
        );
    }, 1000);
  }
  const stopTail = () => {
    if (tail) clearInterval(tail);
    tail = null;
  };

  const pageState = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __balatroEngine: { state: PageState } }).__balatroEngine
        .state;
      return { ...s, logs: s.logs.slice(-200), specs: [...s.specs], phases: [...s.phases] };
    });

  // An uncaught page error while booting (an FS error in a preRun step, say)
  // leaves the page booting forever: fail on it at once.
  let failBoot: (e: Error) => void = () => {};
  const bootError = new Promise<never>((_, reject) => {
    failBoot = reject;
  });
  const onBootError = (e: Error) =>
    failBoot(new Error(`page error while booting: ${e.message}\n${e.stack ?? ''}`));
  page.on('pageerror', onBootError);
  try {
    await Promise.race([
      bootError,
      page.waitForFunction(
        () => {
          const e = (window as unknown as { __balatroEngine?: { state: PageState } })
            .__balatroEngine;
          return !!e && e.state.status !== 'booting';
        },
        undefined,
        { timeout: opts.timeoutMs ?? BOOT_TIMEOUT_MS, polling: 250 },
      ),
    ]);
  } catch (e) {
    const s = await pageState().catch(() => null);
    stopTail();
    await context.close().catch(() => {});
    throw new Error(
      `engine did not reach the main menu: ${String(e)}\nstatus ${s?.status} phases ${s?.phases.join(', ')}\n${s ? s.logs.join('\n') : ''}\n${errors.join('\n')}`,
      { cause: e },
    );
  } finally {
    page.off('pageerror', onBootError);
  }
  const booted = await pageState();
  if (booted.status !== 'ready') {
    stopTail();
    await context.close().catch(() => {});
    throw new Error(`engine ${booted.status}: ${booted.error}\n${booted.logs.join('\n')}`);
  }

  const call = async <T>(
    cmd: string,
    args: unknown[] | Record<string, unknown> = [],
  ): Promise<T> => {
    const r = await page.evaluate(
      ([c, a]) =>
        (
          window as unknown as {
            __balatroEngine: {
              call(c: string, a: unknown): Promise<{ ok: boolean; data: unknown }>;
            };
          }
        ).__balatroEngine.call(c as string, a),
      [cmd, args] as const,
    );
    if (!r.ok) throw new CommandError(cmd, r.data);
    return r.data as T;
  };

  return {
    page,
    context,
    version: booted.version,
    errors,
    call,
    async runSpecs(o = {}) {
      const data = await call('run_specs', {
        ...(o.files ? { files: o.files } : {}),
        ...(o.filter ? { filter: o.filter } : {}),
      });
      return zSpecSummary.parse(data);
    },
    pageState,
    close: () => {
      stopTail();
      return context.close();
    },
  };
}
