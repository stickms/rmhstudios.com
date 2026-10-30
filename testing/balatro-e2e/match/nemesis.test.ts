/**
 * Nemesis 1v1 between two real browsers over the local hub (PLAN §6.3): the match loop,
 * end screens and Return to Lobby (E2E-01), a PvP tie (E2E-02), chat and the draw vote
 * (E2E-11), a member's network drop (E2E-12), a member's reload and rejoin (E2E-14), kick
 * and a version mismatch (E2E-21), relay fallback (E2E-15). The same two pages play every
 * test (an engine boot is the expensive part); each test makes its own lobby.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { openMpPlayer } from '../lib/mp-player';
import { hostLobby, playAnte, setupMatch, SHORT, waitResult } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();
const WIN = 1_000_000;

interface Inbox {
  list: { t: string; d: Record<string, unknown>; n: number }[];
  counts: Record<string, number>;
  size: number;
}
const inbox = (p: MpPlayer, t?: string) => p.cmd<Inbox>('mp_inbox', t ? { t } : {});

/** Back to the MP menu after a match (or out of a lobby). */
async function leave(p: MpPlayer) {
  const s = await p.snap();
  if (s.role) await p.cmd('mp_send', { t: 'ui_leave', d: {} }).catch(() => {});
  await p.waitSnap((x) => x.role === null, 'out of the lobby', 120_000);
  await p.cmd('wait_state', ['MENU', 120]).catch(() => {});
}

describe.skipIf(w.skip)(w.title('nemesis 1v1 (2 browsers)'), () => {
  let a: MpPlayer;
  let b: MpPlayer;

  beforeAll(async () => {
    ({
      players: [a, b],
    } = (await w.up({ players: ['host', 'guest'] })) as { players: MpPlayer[] });
  }, 600_000);

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
    await a.cmd('mp_send', { t: 'ui_return_lobby', d: {} });
    await b.cmd('mp_send', { t: 'ui_return_lobby', d: {} });
    await a.waitSnap((s) => !s.lobby?.started && s.code === code, 'host back in the lobby');
    const lobby = await hostLobby(a);
    expect(lobby.code).toBe(code);
    expect(lobby.players.find((p) => p.id !== lobby.hostId)?.ready).toBe(false);
    expect(w.errors()).toEqual([]);
    await leave(b);
    await leave(a);
  });

  it('E2E-02: a PvP tie costs no life; the next ante decides', async () => {
    await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 1 });
    const [ta, tb] = await Promise.all([playAnte(a, { chips: 5000 }), playAnte(b, { chips: 5000 })]);
    expect(ta.result).toBeNull();
    expect(tb.result).toBeNull();
    expect((await a.snap()).lives).toMatchObject({ [(await a.snap()).me!]: 1 });
    await Promise.all([playAnte(a, { chips: 0 }), playAnte(b, { chips: WIN })]);
    expect(await waitResult(a)).toBe('lose');
    expect(await waitResult(b)).toBe('win');
    expect(w.errors()).toEqual([]);
    await leave(b);
    await leave(a);
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
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const pressed = await a.cmd<{ sent: boolean }>('timer_press');
    expect(pressed.sent).toBe(true);
    await waitFor('the guest loses a life to the timer', async () => (await a.snap()).lives[guestId] === 1, 120_000, 1000);
    await b.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(w.errors()).toEqual([]);
    await a.cmd('forfeit').catch(() => {});
    await leave(b);
    await leave(a);
  });

  it('E2E-08 / E2E-23: Small World and The Order — same bans, bosses and shops on both peers, purchases diverging', async () => {
    await setupMatch(a, [b], 'pvp_smallworld', { pvpStartRound: 2, startingLives: 1, timer: false });
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
    for (const slot of [1, 2]) if (await a.cmd('buy', [slot]).then(() => true, () => false)) break;
    await Promise.all([a.cmd('leave_shop'), b.cmd('leave_shop')]);
    const [s2a, s2b] = await Promise.all([shop(a), shop(b)]);
    expect(s2a).toBe(s2b);
    expect((await a.cmd<St>('mp_state')).boss).toBe((await b.cmd<St>('mp_state')).boss);
    expect(w.errors()).toEqual([]);
    await a.cmd('forfeit').catch(() => {});
    await leave(b);
    await leave(a);
  });

  it('E2E-11: chat reaches the other player, a mute hides it; a unanimous draw vote draws', async () => {
    const { code } = await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 2 });
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const before = (await inbox(a, 'chat_line')).list.length;
    await b.cmd('mp_send', { t: 'ui_chat', d: { text: 'gl hf' } });
    await waitFor('chat line at the host', async () => (await inbox(a, 'chat_line')).list.length > before, 60_000, 500);
    const line = (await inbox(a, 'chat_line')).list.at(-1)!.d;
    expect(line.text).toBe('gl hf');
    // Mute the guest: the next line is not delivered to Lua.
    const guestId = (await b.snap()).me!;
    await a.cmd('mp_send', { t: 'ui_mute', d: { userId: guestId, on: true } });
    const muted = (await inbox(a, 'chat_line')).list.length;
    await b.cmd('mp_send', { t: 'ui_chat', d: { text: 'muted line' } });
    await new Promise((r) => setTimeout(r, 3000));
    expect((await inbox(a, 'chat_line')).list.slice(muted).map((l) => l.d.text)).not.toContain('muted line');
    // Draw vote (REF-17): both vote → draw for both.
    await a.cmd('vote', { kind: 'draw' });
    await b.cmd('vote', { kind: 'draw' });
    expect(await waitResult(a)).toBe('draw');
    expect(await waitResult(b)).toBe('draw');
    expect(w.errors()).toEqual([]);
    await leave(b);
    await leave(a);
  });

  it('E2E-12: a member drops for 5 s → away → back, and the match completes', async () => {
    await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 1 });
    const guestId = (await b.snap()).me!;
    await b.context.setOffline(true);
    await waitFor(
      'host sees the guest away',
      async () => !!(await hostLobby(a)).players.find((p) => p.id === guestId && (p.away || !p.connected)),
      60_000,
      500,
    );
    await new Promise((r) => setTimeout(r, 5000));
    await b.context.setOffline(false);
    await waitFor(
      'host sees the guest back',
      async () => !!(await hostLobby(a)).players.find((p) => p.id === guestId && !p.away && p.connected),
      120_000,
      1000,
    );
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(b, { chips: 0 })]);
    expect(await waitResult(a)).toBe('win');
    expect(await waitResult(b)).toBe('lose');
    expect(w.errors()).toEqual([]);
    await leave(b);
    await leave(a);
  });

  it('E2E-14: a member reloads mid-run, rejoins from the snapshot, and the match continues', async () => {
    const { runId } = await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 2 });
    // Into the first shop, then reload.
    await b.cmd('select_blind');
    await b.cmd('win_blind');
    await b.cmd('cash_out');
    await b.page.reload();
    const again = await openMpPlayer(
      { account: { label: 'guest', email: '', name: '', password: '' }, context: b.context },
      w.baseUrl,
      { page: b.page, open: false, skipGoto: true },
    );
    // The page autoloads MP with the rejoin hint; the seat is held — rejoin it.
    await again.cmd('mp_open', { intent: 'rejoin' }).catch(() => {});
    await again.cmd('mp_send', { t: 'ui_seat', d: { op: 'rejoin' } }).catch(() => {});
    await again.waitSnap((s) => s.runId === runId, 'rejoined the same match', 240_000);
    const restore = await waitFor('a rejoin restore', async () => (await inbox(again, 'rejoin_restore')).list.length > 0, 240_000, 1000)
      .then(() => true)
      .catch(() => false);
    expect(restore).toBe(true);
    // Play on: the host wins the next PvP rounds.
    await again.cmd('wait_state', ['BLIND_SELECT', 300], 320_000).catch(() => again.cmd('leave_shop'));
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(again, { chips: 0 })]);
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(again, { chips: 0 })]);
    expect(await waitResult(a)).toBe('win');
    expect(await waitResult(again)).toBe('lose');
    w.players.splice(w.players.indexOf(b), 1, again);
    b = again;
    expect(w.errors()).toEqual([]);
    await leave(b);
    await leave(a);
  });

  it('E2E-21: a kicked member cannot rejoin; a mismatched build is refused', async () => {
    const lobby = await (async () => {
      await a.ui('create', { queueMode: 'pvp_nemesis', kind: 'private' });
      const s = await a.waitSnap((x) => !!x.code, 'lobby');
      return s.code!;
    })();
    await b.ui('join', { code: lobby });
    await waitFor('guest seated', async () => (await hostLobby(a)).players.length === 2, 120_000, 500);
    const guestId = (await b.snap()).me!;
    await a.cmd('mp_send', { t: 'ui_kick', d: { userId: guestId } });
    await b.waitSnap((s) => s.role === null, 'guest kicked out', 60_000);
    const mark = (await inbox(b, 'lobby_error')).list.length;
    await b.ui('join', { code: lobby });
    await waitFor('kicked join refused', async () => (await inbox(b, 'lobby_error')).list.length > mark, 60_000, 500);
    expect((await hostLobby(a)).players.map((p) => p.id)).not.toContain(guestId);
    // A build with another content hash (test override) is refused (LOB-15, D-36).
    const odd = await w.player('oddbuild', { overrides: { contentHash: `${'f'.repeat(24)}-v1` } });
    const m2 = (await inbox(odd, 'lobby_error')).list.length;
    await odd.ui('join', { code: lobby });
    await waitFor('mismatched build refused', async () => (await inbox(odd, 'lobby_error')).list.length > m2, 60_000, 500);
    const codes = (await inbox(odd, 'lobby_error')).list.slice(m2).map((e) => e.d.code);
    expect(codes.join(',')).toMatch(/version|mismatch|hash/);
    await odd.close();
    w.players.splice(w.players.indexOf(odd), 1);
    await leave(a);
  });

  it('E2E-15: with ICE blocked the pair falls back to the hub relay and plays a full 1v1', async () => {
    const relayed = await w.player('relayed', { overrides: { p2p: { blockCandidates: true } } });
    await setupMatch(a, [relayed], 'pvp_nemesis');
    await waitFor(
      'the relayed member shows conn=relay',
      async () => (await hostLobby(a)).players.some((p) => p.conn === 'relay'),
      120_000,
      1000,
    );
    await Promise.all([playAnte(a, { chips: 0 }), playAnte(relayed, { chips: WIN })]);
    expect(await waitResult(relayed)).toBe('win');
    expect(await waitResult(a)).toBe('lose');
    expect(w.errors()).toEqual([]);
    await leave(relayed);
    await leave(a);
  });
});
