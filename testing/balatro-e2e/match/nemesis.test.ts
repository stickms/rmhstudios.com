/**
 * Nemesis 1v1 between two real browsers over the local hub (PLAN §6.3): the match loop,
 * end screens and Return to Lobby (E2E-01), a PvP tie (E2E-02), the ante timer (E2E-10),
 * Small World and The Order (E2E-08/23), chat and the draw vote (E2E-11). The same two pages
 * play every test (an engine boot is the expensive part); each test makes its own lobby.
 * Drops, reloads, kicks and the relay are in nemesis-resilience.test.ts (another CI shard).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { hostLobby, playAnte, setupMatch, SHORT, waitResult, leaveMatch } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();
const WIN = 1_000_000;

interface Inbox {
  list: { t: string; d: Record<string, unknown>; n: number }[];
  counts: Record<string, number>;
  size: number;
}
const inbox = (p: MpPlayer, t?: string, since = 0) =>
  p.cmd<Inbox>('mp_inbox', t ? { t, since } : { since });
/** How many messages of type t Lua has received so far (monotonic; the kept list is a ring). */
const count = async (p: MpPlayer, t: string) => (await inbox(p, t)).counts[t] ?? 0;

describe.skipIf(w.skip)(w.title('nemesis 1v1 (2 browsers)'), () => {
  let a: MpPlayer;
  let b: MpPlayer;

  beforeAll(async () => {
    ({
      players: [a, b],
    } = (await w.up({ players: ['host', 'guest'] })) as { players: MpPlayer[] });
  }, 600_000);

  afterEach(() => w.cleanup(), 300_000);
  afterAll(() => w.down());

  it('E2E-01: Balanced 1v1 is played to a win and a loss; Return to Lobby resets ready', async () => {
    const { code } = await setupMatch(a, [b], 'pvp_nemesis');
    const [ra, rb] = await Promise.all([playAnte(a, { chips: WIN }), playAnte(b, { chips: 0 })]);
    expect(ra.ante).toBe(1);
    expect(rb.ante).toBe(1);
    expect(await waitResult(a)).toBe('win');
    expect(await waitResult(b)).toBe('lose');
    const [sa, sb] = [await a.snap(), await b.snap()];
    expect(sa.result).toBe('win');
    expect(sb.result).toBe('lose');
    // The end screen offers Return to Lobby in a private lobby (LOB-17).
    await leaveMatch(a, 'return_lobby');
    await leaveMatch(b, 'return_lobby');
    await a.waitSnap((s) => !s.lobby?.started && s.code === code, 'host back in the lobby');
    const lobby = await hostLobby(a);
    expect(lobby.code).toBe(code);
    expect(lobby.players.find((p) => p.id !== lobby.hostId)?.ready).toBe(false);
    expect(w.errors()).toEqual([]);
    await leaveMatch(b);
    await leaveMatch(a);
  });

  it('E2E-02: a PvP tie costs no life; the next ante decides', async () => {
    await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 1 });
    // An exact tie: at 1e20 a one-card hand is below the double's resolution, so both
    // players report the same score whatever cards they hold.
    const [ta, tb] = await Promise.all([
      playAnte(a, { chips: 1e20 }),
      playAnte(b, { chips: 1e20 }),
    ]);
    expect(ta.result ?? null).toBeNull();
    expect(tb.result ?? null).toBeNull();
    expect((await a.snap()).lives).toMatchObject({ [(await a.snap()).me!]: 1 });
    await Promise.all([playAnte(a, { chips: 0 }), playAnte(b, { chips: WIN })]);
    expect(await waitResult(a)).toBe('lose');
    expect(await waitResult(b)).toBe('win');
    expect(w.errors()).toEqual([]);
    await leaveMatch(b);
    await leaveMatch(a);
  });

  it('E2E-10: the ante timer — a press makes the opponent tick, expiry costs a life; a hidden tab keeps the clock', async () => {
    await setupMatch(a, [b], 'pvp_nemesis', {
      pvpStartRound: 1,
      startingLives: 2,
      timer: true,
      timerBaseSeconds: 12,
      timerIncrementSeconds: 0,
      timerForgiveness: 0,
    });
    const guestId = (await b.snap()).me!;
    // The host reaches the PvP pillar and readies; the guest dawdles at its first blind select.
    for (let i = 0; i < 2; i++) {
      await a.cmd('select_blind');
      await a.cmd('win_blind');
      await a.cmd('cash_out');
      await a.cmd('leave_shop');
    }
    await a.cmd('pvp_ready');
    // The guest's tab goes hidden while it is being timed (TIM-09: the TS clock keeps running).
    await b.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // The press needs the timer the session pushes after Ready (TIM-02 press rules).
    await waitFor(
      'the host timer is pressable',
      async () => !!(await a.mp<{ timer_pressable?: boolean }>('hud')).timer_pressable,
      60_000,
      500,
    );
    const pressed = await a.cmd<{ sent: boolean }>('timer_press');
    expect(pressed.sent).toBe(true);
    await waitFor(
      'the guest loses a life to the timer',
      async () => (await a.snap()).lives[guestId] === 1,
      120_000,
      1000,
    );
    await b.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(w.errors()).toEqual([]);
    await a.cmd('forfeit').catch(() => {});
    await leaveMatch(b);
    await leaveMatch(a);
  });

  it('E2E-08 / E2E-23: Small World and The Order — same bans, bosses and shops on both peers, purchases diverging', async () => {
    await setupMatch(a, [b], 'pvp_smallworld', {
      pvpStartRound: 2,
      startingLives: 1,
      timer: false,
    });
    type St = { banned_digest: string | null; boss: string | null; seed: string | null };
    const [sa, sb] = [await a.cmd<St>('mp_state'), await b.cmd<St>('mp_state')];
    expect(sa.banned_digest).toBeTruthy();
    expect(sa.banned_digest).toBe(sb.banned_digest);
    expect(sa.boss).toBe(sb.boss);
    expect(sa.seed).toBe(sb.seed);
    const shop = async (p: MpPlayer) => {
      await p.cmd('select_blind');
      await p.cmd('win_blind');
      await p.cmd('cash_out');
      return p.cmd<string>('shop_digest');
    };
    const [s1a, s1b] = await Promise.all([shop(a), shop(b)]);
    expect(s1a).toBe(s1b);
    // Diverge: the host buys the first joker it can afford, the guest buys nothing.
    for (const slot of [1, 2])
      if (
        await a.cmd('buy', [slot]).then(
          () => true,
          () => false,
        )
      )
        break;
    await Promise.all([a.cmd('leave_shop'), b.cmd('leave_shop')]);
    const [s2a, s2b] = await Promise.all([shop(a), shop(b)]);
    expect(s2a).toBe(s2b);
    expect((await a.cmd<St>('mp_state')).boss).toBe((await b.cmd<St>('mp_state')).boss);
    expect(w.errors()).toEqual([]);
    await a.cmd('forfeit').catch(() => {});
    await leaveMatch(b);
    await leaveMatch(a);
  });

  it('E2E-11: chat reaches the other player, a mute hides it; a unanimous draw vote draws', async () => {
    const { code } = await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 2 });
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const before = await count(a, 'chat_line');
    await b.cmd('mp_send', { t: 'ui_chat', d: { text: 'gl hf' } });
    await waitFor(
      'chat line at the host',
      async () => (await count(a, 'chat_line')) > before,
      60_000,
      500,
    );
    const line = (await inbox(a, 'chat_line', before)).list.at(-1)!.d;
    expect(line.text).toBe('gl hf');
    // Mute the guest: the next line is not delivered to Lua.
    const guestId = (await b.snap()).me!;
    await a.cmd('mp_send', { t: 'ui_mute', d: { userId: guestId, on: true } });
    const muted = await count(a, 'chat_line');
    await b.cmd('mp_send', { t: 'ui_chat', d: { text: 'muted line' } });
    await new Promise((r) => setTimeout(r, 3000));
    expect((await inbox(a, 'chat_line', muted)).list.map((l) => l.d.text)).not.toContain(
      'muted line',
    );
    // Draw vote (REF-17): both vote → draw for both.
    await a.cmd('vote', { kind: 'draw' });
    await b.cmd('vote', { kind: 'draw' });
    expect(await waitResult(a)).toBe('draw');
    expect(await waitResult(b)).toBe('draw');
    expect(w.errors()).toEqual([]);
    await leaveMatch(b);
    await leaveMatch(a);
  });
});
