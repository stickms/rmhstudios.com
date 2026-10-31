/**
 * Nemesis 1v1 resilience between two real browsers over the local hub (PLAN §6.3): a member's
 * network drop (E2E-12), a member's reload and rejoin (E2E-14), kick and a version mismatch
 * (E2E-21), relay fallback (E2E-15). Split from nemesis.test.ts so CI runs the two halves on
 * parallel shards (testing/balatro-e2e/shards.ts); the same two pages play every test here,
 * and each test makes its own lobby.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { openMpPlayer } from '../lib/mp-player';
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

describe.skipIf(w.skip)(w.title('nemesis 1v1 resilience (2 browsers)'), () => {
  let a: MpPlayer;
  let b: MpPlayer;

  beforeAll(async () => {
    ({
      players: [a, b],
    } = (await w.up({ players: ['host', 'guest'] })) as { players: MpPlayer[] });
  }, 600_000);

  afterEach(() => w.cleanup(), 300_000);
  afterAll(() => w.down());

  it('E2E-12: a member drops for 5 s → away → back, and the match completes', async () => {
    await setupMatch(a, [b], 'pvp_nemesis', { ...SHORT, startingLives: 1 });
    const guestId = (await b.snap()).me!;
    // A network drop: the hub socket goes (offline emulation) and so does the P2P link (offline
    // emulation does not reach WebRTC, so the page's peer connections are closed too).
    await b.context.setOffline(true);
    try {
      await b.page.evaluate(() => {
        for (const pc of (window as unknown as { __e2ePeers?: RTCPeerConnection[] }).__e2ePeers ??
          [])
          pc.close();
      });
      await waitFor(
        'host sees the guest away',
        async () =>
          !!(await hostLobby(a)).players.find((p) => p.id === guestId && (p.away || !p.connected)),
        60_000,
        500,
      );
      await new Promise((r) => setTimeout(r, 5000));
    } finally {
      await b.context.setOffline(false);
    }
    await waitFor(
      'host sees the guest back',
      async () =>
        !!(await hostLobby(a)).players.find((p) => p.id === guestId && !p.away && p.connected),
      120_000,
      1000,
    );
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(b, { chips: 0 })]);
    expect(await waitResult(a)).toBe('win');
    expect(await waitResult(b)).toBe('lose');
    expect(w.errors()).toEqual([]);
    await leaveMatch(b);
    await leaveMatch(a);
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
    // The page autoloads MP with the rejoin hint (MP.open('rejoin') — opening it again from
    // here would start a second menu wipe under the restore); the hub answers the seat query
    // and the Seat held prompt appears: press Rejoin, as a player does.
    await again.cmd('mp_notice', { i: 1, name: 'seat_held', seconds: 120 }, 150_000);
    await again.waitSnap((s) => s.runId === runId, 'back in the same match', 240_000);
    await waitFor(
      'a rejoin restore',
      async () => ((await inbox(again, 'rejoin_restore')).counts.rejoin_restore ?? 0) > 0,
      240_000,
      1000,
    ).catch((e: Error) => {
      throw new Error(`${e.message}\n${again.errors.join('\n')}`);
    });
    // The restored run is the shop the guest reloaded in; play on from there.
    const st = await again.cmd<{ state: string }>('wait_state', ['SHOP', 300], 320_000).then(
      () => ({ state: 'SHOP' }),
      () => again.cmd<{ state: string }>('state'),
    );
    expect(st.state).toBe('SHOP');
    await again.cmd('leave_shop');
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(again, { chips: 0 })]);
    await Promise.all([playAnte(a, { chips: WIN }), playAnte(again, { chips: 0 })]);
    expect(await waitResult(a)).toBe('win');
    expect(await waitResult(again)).toBe('lose');
    w.players.splice(w.players.indexOf(b), 1, again);
    b = again;
    expect(w.errors()).toEqual([]);
    await leaveMatch(b);
    await leaveMatch(a);
  });

  it('E2E-21: a kicked member cannot rejoin; a mismatched build is refused', async () => {
    const lobby = await (async () => {
      await a.ui('create', { queueMode: 'pvp_nemesis', kind: 'private' });
      const s = await a.waitSnap((x) => !!x.code, 'lobby');
      return s.code!;
    })();
    await b.ui('join', { code: lobby });
    await waitFor(
      'guest seated',
      async () => (await hostLobby(a)).players.length === 2,
      120_000,
      500,
    );
    const guestId = (await b.snap()).me!;
    await a.cmd('mp_send', { t: 'ui_kick', d: { userId: guestId } });
    await b.waitSnap((s) => s.role === null, 'guest kicked out', 60_000);
    const mark = await count(b, 'lobby_error');
    await b.ui('join', { code: lobby });
    await waitFor(
      'kicked join refused',
      async () => (await count(b, 'lobby_error')) > mark,
      60_000,
      500,
    );
    expect((await hostLobby(a)).players.map((p) => p.id)).not.toContain(guestId);
    // A build with another content hash (test override) is refused (LOB-15, D-36).
    const odd = await w.player('oddbuild', { overrides: { contentHash: `${'f'.repeat(24)}-v1` } });
    const m2 = await count(odd, 'lobby_error');
    await odd.ui('join', { code: lobby });
    await waitFor(
      'mismatched build refused',
      async () => (await count(odd, 'lobby_error')) > m2,
      60_000,
      500,
    );
    const codes = (await inbox(odd, 'lobby_error', m2)).list.map((e) => e.d.code);
    expect(codes.join(',')).toMatch(/version|mismatch|hash/);
    await odd.close();
    w.players.splice(w.players.indexOf(odd), 1);
    await leaveMatch(a);
  });

  it('E2E-15: with ICE blocked on both sides the pair falls back to the hub relay and plays a full 1v1', async () => {
    // Both ends drop their candidates (one blocked side is not enough: the other side's
    // candidates plus peer-reflexive ones still form a direct path on localhost).
    const relayed = await w.player('relayed', { overrides: { p2p: { blockCandidates: true } } });
    const host = await w.bot('relayhost', { score: '10', block: true });
    await host.ui('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'bot lobby');
    for (const [k, v] of Object.entries(SHORT))
      await host.ui('ui_set_option', { key: k, value: v });
    await relayed.ui('join', { code });
    await waitFor(
      'the relayed member shows conn=relay',
      async () => !!(await relayed.snap()).lobby?.players.some((p) => p.conn === 'relay'),
      180_000,
      1000,
    );
    await relayed.cmd('ready');
    const me = (await relayed.snap()).me;
    await waitFor(
      'ready seen by the host',
      async () => !!(await relayed.snap()).lobby?.players.find((p) => p.id === me)?.ready,
      60_000,
      1000,
    );
    await host.ui('ui_start', {});
    await relayed.waitSnap((s) => !!s.runId, 'match started over the relay', 300_000);
    await relayed.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
    await playAnte(relayed, { chips: WIN });
    expect(await waitResult(relayed)).toBe('win');
    expect(w.errors()).toEqual([]);
    await leaveMatch(relayed);
    await host.close();
  });
});
