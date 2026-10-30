/**
 * Shared set-up of a match test file: the stack from global-setup.ts, one Chromium,
 * signed-in accounts, real players (the engine) and bot peers (no engine).
 *
 *   const w = matchWorld();
 *   describe.skipIf(w.skip)(w.title('nemesis'), () => {
 *     beforeAll(() => w.up({ players: ['a', 'b'], bots: 2 }), 600_000);
 *     afterAll(() => w.down());
 *     it('…', async () => { const [a, b] = w.players; … });
 *   });
 */
import { chromium, type Browser } from 'playwright';
import { inject } from 'vitest';
import { signedInPlayers, type Player } from '../lib/accounts';
import { openBot, type BotPeer } from '../lib/bot';
import { chromiumLaunchOptions } from '../lib/chromium';
import { openMpPlayer, type MpPlayer, type OpenOptions } from '../lib/mp-player';
import { leaveMatch } from '../lib/match-flow';

/** Software WebGL costs per pixel: real players use a small canvas. */
export const VIEWPORT = { width: 640, height: 360 };

let accountSeq = 0;

export function matchWorld() {
  const stack = inject('matchStack');
  const required = process.env.BALATRO_E2E_REQUIRE_MATCH === '1';
  const skip = !stack.baseUrl && !required;
  const w = {
    skip,
    baseUrl: stack.baseUrl ?? '',
    socketUrl: stack.socketUrl ?? '',
    browser: null as Browser | null,
    accounts: [] as Player[],
    players: [] as MpPlayer[],
    bots: [] as BotPeer[],
    title: (name: string) => (skip ? `${name} (skipped: ${stack.reason})` : name),
    /** Fresh signed-in contexts (accounts are unique per call). */
    async accountsFor(labels: string[]): Promise<Player[]> {
      if (!stack.baseUrl) throw new Error(`match stack unavailable: ${stack.reason}`);
      w.browser ??= await chromium.launch(chromiumLaunchOptions());
      const run = `${Date.now().toString(36)}${(accountSeq++).toString(36)}`;
      const made = await signedInPlayers(w.browser, stack.baseUrl, labels, run, {
        viewport: VIEWPORT,
        offset: w.accounts.length,
      });
      w.accounts.push(...made);
      return made;
    },
    async player(label: string, opts: OpenOptions = {}): Promise<MpPlayer> {
      const [acc] = await w.accountsFor([label]);
      const p = await openMpPlayer(acc!, w.baseUrl, opts);
      w.players.push(p);
      return p;
    },
    async bot(label: string, opts: { score?: string } = {}): Promise<BotPeer> {
      const [acc] = await w.accountsFor([label]);
      const b = await openBot(acc!, w.baseUrl, w.socketUrl, opts);
      w.bots.push(b);
      return b;
    },
    async up(spec: { players?: string[]; bots?: number; botScore?: string }) {
      const players = await Promise.all((spec.players ?? []).map((l) => w.player(l)));
      const bots: BotPeer[] = [];
      for (let i = 0; i < (spec.bots ?? 0); i++) bots.push(await w.bot(`bot${i + 1}`, { score: spec.botScore }));
      return { players, bots };
    },
    /** Lua/protocol errors seen by every real player and bot so far. */
    errors(): string[] {
      return [
        ...w.players.flatMap((p) => p.luaErrors().map((e) => `${p.label}: ${e}`)),
        ...w.bots.flatMap((b) => b.errors.filter((e) => /pageerror|\[mp\].*(fail|error|invalid)/i.test(e)).map((e) => `${b.label}: ${e}`)),
      ];
    },
    /** After each test: every real player out of its match/lobby, whatever the test left. */
    async cleanup() {
      for (const p of w.players) {
        await p.context.setOffline(false).catch(() => {});
        await leaveMatch(p).catch(() => {});
      }
    },
    async down() {
      for (const a of w.accounts) await a.context.close().catch(() => {});
      await w.browser?.close().catch(() => {});
      w.accounts = [];
      w.players = [];
      w.bots = [];
      w.browser = null;
    },
  };
  return w;
}
