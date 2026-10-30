/**
 * Bot peers for large lobbies (PLAN §6.3 E2E-22): builds testing/balatro-e2e/bot/entry.ts
 * once with esbuild and serves it at `${baseUrl}/__balatro_e2e_bot` through Playwright
 * routing, so each bot is a signed-in browser context on the app's own origin (the hub
 * sees its session cookie and its Origin) running the real MP runtime without the engine.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import type { Page } from 'playwright';
import type { Player } from './accounts';
import { REPO_ROOT } from './static-server';
import { waitFor } from './stack';

export const BOT_PATH = '/__balatro_e2e_bot';

let bundle: Promise<string> | null = null;

export function buildBot(socketUrl: string): Promise<string> {
  bundle ??= (async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'balatro-bot-')), 'bot.js');
    await build({
      entryPoints: [path.join(REPO_ROOT, 'testing/balatro-e2e/bot/entry.ts')],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      outfile: out,
      logLevel: 'silent',
      alias: { '@': REPO_ROOT },
      define: {
        'import.meta.env.VITE_BALATRO_MP_TEST': '"1"',
        'import.meta.env.VITE_SOCKET_URL': JSON.stringify(socketUrl),
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
        'import.meta.env.MODE': '"test"',
        'import.meta.env.SSR': 'false',
        'import.meta.env': '{}',
        'process.env.NODE_ENV': '"test"',
      },
    });
    return readFileSync(out, 'utf8');
  })();
  return bundle;
}

export interface BotPeer {
  label: string;
  page: Page;
  errors: string[];
  ui(t: string, d?: Record<string, unknown>): Promise<void>;
  state<T = Record<string, unknown>>(): Promise<T>;
  outcomes(): Promise<{ t: string; [k: string]: unknown }[]>;
  waitState(pred: (s: { code: string | null; runId: string | null; role: string | null; result: string | null }) => boolean, what: string, timeoutMs?: number): Promise<void>;
  setScore(n: string): Promise<void>;
  close(): Promise<void>;
}

export async function openBot(player: Player, baseUrl: string, socketUrl: string, opts: { score?: string } = {}): Promise<BotPeer> {
  const js = await buildBot(socketUrl);
  const { context, account } = player;
  await context.route(`${baseUrl}${BOT_PATH}*`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.js')) return route.fulfill({ contentType: 'text/javascript', body: js });
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><title>bot</title><script src="${BOT_PATH}.js"></script>`,
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (/\[mp\]|error/i.test(m.text()) && m.type() !== 'log') errors.push(m.text().slice(0, 800));
  });
  await page.goto(`${baseUrl}${BOT_PATH}${opts.score ? `?score=${opts.score}` : ''}`);
  await page.waitForFunction(() => !!(window as unknown as { __balatroBot?: unknown }).__balatroBot, undefined, { timeout: 60_000 });
  type Api = Record<string, (...a: unknown[]) => unknown>;
  const call = <T>(fn: string, ...args: unknown[]) =>
    page.evaluate(([f, a]) => ((window as unknown as { __balatroBot: Api }).__balatroBot[f as string](...(a as unknown[])) as T), [fn, args] as const) as Promise<T>;
  const state = () => call<{ code: string | null; runId: string | null; role: string | null; result: string | null; hub: string }>('state');
  await waitFor(`${account.label}: bot hub`, async () => (await state()).hub === 'connected', 60_000, 500);
  return {
    label: account.label,
    page,
    errors,
    ui: (t, d = {}) => call('ui', t, d),
    state: state as BotPeer['state'],
    outcomes: () => call('outcomes'),
    waitState: async (pred, what, timeoutMs = 120_000) => {
      let last: unknown;
      await waitFor(`${account.label}: ${what}`, async () => pred((last = await state()) as never), timeoutMs, 500).catch((e: Error) => {
        throw new Error(`${e.message}\nlast: ${JSON.stringify(last)}\nerrors: ${errors.join('\n')}`);
      });
    },
    setScore: (n) => call('setScore', n),
    close: () => page.close(),
  };
}
