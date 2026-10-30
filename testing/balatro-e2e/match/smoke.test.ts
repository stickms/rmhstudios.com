/**
 * Match project, wave-1 scaffolding (PLAN §6.3; WS14b adds E2E-01…24 on top):
 * proves the multi-browser stack — the hub and `vite dev` against a throwaway
 * Postgres, N signed-in browser contexts — and that every player's /balatro boots
 * the real game (the pack route serves a signed-in session; no page error).
 *
 *   DATABASE_URL=… BETTER_AUTH_SECRET=<32+> pnpm test:balatro:e2e --project match
 *   BALATRO_E2E_BASE_URL=http://localhost:7997 pnpm test:balatro:e2e --project match   (stack already up)
 *
 * Without a stack it skips, unless BALATRO_E2E_REQUIRE_MATCH=1 (CI), where it fails.
 */
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedInPlayers, type Player } from '../lib/accounts';
import { chromiumLaunchOptions } from '../lib/chromium';
import { hubReady, stackConfig, startStack, type RunningStack } from '../lib/stack';

const cfg = stackConfig();
const required = process.env.BALATRO_E2E_REQUIRE_MATCH === '1';
const PLAYERS = Number(process.env.BALATRO_E2E_PLAYERS ?? 2);

// The reason rides in the suite name (no stdout writes at module scope: `vitest list
// --json`, which lib/__tests__/test-discovery.test.ts runs, must stay parseable).
const skip = cfg.mode === 'unavailable' && !required;
const title =
  skip && cfg.mode === 'unavailable' ? `match stack (skipped: ${cfg.reason})` : 'match stack';

describe.skipIf(skip)(title, () => {
  let stack: RunningStack;
  let browser: Browser;
  let players: Player[] = [];

  beforeAll(async () => {
    stack = await startStack(cfg);
    browser = await chromium.launch(chromiumLaunchOptions());
    players = await signedInPlayers(
      browser,
      stack.baseUrl,
      Array.from({ length: PLAYERS }, (_, i) => `p${i + 1}`),
    );
  }, 600_000);

  afterAll(async () => {
    for (const p of players) await p.context.close().catch(() => {});
    await browser?.close().catch(() => {});
    await stack?.close();
  });

  it('has a hub that answers the engine.io handshake', async () => {
    expect(await hubReady(stack.socketUrl)).toBe(true);
  });

  it(`boots /balatro for ${PLAYERS} signed-in players at once`, async () => {
    const results = await Promise.all(
      players.map(async ({ account, context }) => {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const pack = page.waitForResponse(
          (r) => /\/api\/balatro\/pack\/core-[0-9a-f]{12}\.zip$/.test(r.url()),
          {
            timeout: 300_000,
          },
        );
        await page.goto(`${stack.baseUrl}/balatro`, { timeout: 300_000 });
        const res = await pack;
        await page.waitForSelector('.balatro-frame canvas', { timeout: 300_000 });
        return { label: account.label, url: page.url(), pack: res.status(), errors };
      }),
    );
    for (const r of results) {
      expect(r.url, r.label).toContain('/balatro');
      expect(r.pack, r.label).toBe(200);
      expect(r.errors, r.label).toEqual([]);
    }
  });
});
