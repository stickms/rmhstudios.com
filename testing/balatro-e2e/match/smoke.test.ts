/**
 * Match project smoke (PLAN §6.3): the multi-browser stack works — the hub and `vite dev`
 * against a throwaway Postgres (match/global-setup.ts), signed-in browser contexts — and
 * every player's /balatro boots the real game (the pack route serves a signed-in session;
 * no page error).
 *
 *   DATABASE_URL=… BETTER_AUTH_SECRET=<32+> pnpm test:balatro:e2e --project match
 *   BALATRO_E2E_BASE_URL=http://localhost:7997 pnpm test:balatro:e2e --project match   (stack already up)
 *
 * Without a stack it skips, unless BALATRO_E2E_REQUIRE_MATCH=1 (CI), where it fails.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hubReady } from '../lib/stack';
import type { Player } from '../lib/accounts';
import { matchWorld } from './world';

const w = matchWorld();
const PLAYERS = Number(process.env.BALATRO_E2E_PLAYERS ?? 2);

describe.skipIf(w.skip)(w.title('match stack'), () => {
  let players: Player[] = [];

  beforeAll(async () => {
    players = await w.accountsFor(Array.from({ length: PLAYERS }, (_, i) => `s${i + 1}`));
  }, 600_000);

  afterAll(() => w.down());

  it('has a hub that answers the engine.io handshake', async () => {
    expect(await hubReady(w.socketUrl)).toBe(true);
  });

  it(`boots /balatro for ${PLAYERS} signed-in players at once`, async () => {
    const results = await Promise.all(
      players.map(async ({ account, context }) => {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const pack = page.waitForResponse((r) => /\/api\/balatro\/pack\/core-[0-9a-f]{12}\.zip$/.test(r.url()), {
          timeout: 300_000,
        });
        await page.goto(`${w.baseUrl}/balatro`, { timeout: 300_000 });
        const res = await pack;
        await page.waitForSelector('.balatro-frame canvas', { timeout: 300_000 });
        const out = { label: account.label, url: page.url(), pack: res.status(), errors };
        await page.close();
        return out;
      }),
    );
    for (const r of results) {
      expect(r.url, r.label).toContain('/balatro');
      expect(r.pack, r.label).toBe(200);
      expect(r.errors, r.label).toEqual([]);
    }
  });
});
