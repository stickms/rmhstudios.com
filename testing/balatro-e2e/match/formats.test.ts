/**
 * Every multi-player format over the local hub (PLAN §6.3), one real browser (the engine,
 * driven by the autopilot) plus bot peers (testing/balatro-e2e/bot: the real session
 * runtime and WebRTC with a scripted player, no engine) to fill the lobby:
 *   E2E-04 Nemesis rotation with 3 · E2E-05 Royale with 4 · E2E-06 Manhunt 1+2 ·
 *   E2E-07 Teams 2v2 · E2E-20 single-player save and seed untouched by an MP loss ·
 *   E2E-13 host migration mid-match (the host's page closes).
 * A bot plays every ante: both normal blinds beaten, Ready, one hand of its fixed score.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { BotPeer } from '../lib/bot';
import type { MpPlayer } from '../lib/mp-player';
import { hostLobby, playAnte, setupMatch, waitResult, leaveMatch } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();
const WIN = 1_000_000;

type Outcome = { t: string; [k: string]: unknown };
const outcomes = async (p: MpPlayer): Promise<Outcome[]> =>
  (await p.cmd<{ list: { d: { o: Outcome } }[] }>('mp_inbox', { t: 'outcome' })).list.map((e) => e.d.o);


async function fresh(n: number, scores: string[]): Promise<BotPeer[]> {
  for (const b of w.bots.splice(0)) await b.close().catch(() => {});
  const out: BotPeer[] = [];
  for (let i = 0; i < n; i++) out.push(await w.bot(`bot${i + 1}`, { score: scores[i] ?? '100' }));
  return out;
}

describe.skipIf(w.skip)(w.title('formats (1 browser + bots)'), () => {
  let p: MpPlayer;

  beforeAll(async () => {
    p = await w.player('real');
  }, 600_000);

  afterEach(() => w.cleanup(), 300_000);
  afterAll(() => w.down());

  it('E2E-04: Nemesis with 3 — a bye each ante, pairings before Ready, no repeated pair', async () => {
    const bots = await fresh(2, ['100', '200']);
    await setupMatch(p, bots, 'pvp_nemesis', { pvpStartRound: 1, startingLives: 3, timer: false });
    const pairs = new Set<string>();
    for (let ante = 1; ante <= 2; ante++) {
      await playAnte(p, { chips: WIN });
      const pairing = (await outcomes(p)).filter((o) => o.t === 'nemesis_pairing' && o.ante === ante).at(-1) as
        | { pairing: Record<string, string> }
        | undefined;
      expect(pairing, `pairing for ante ${ante}`).toBeDefined();
      const map = pairing!.pairing;
      const byes = Object.entries(map).filter(([, v]) => v === '');
      expect(byes.length).toBe(1);
      for (const [x, y] of Object.entries(map)) if (y) pairs.add([x, y].sort().join('|'));
    }
    // Two antes, three players: the two real pairings differ.
    expect(pairs.size).toBe(2);
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });

  it('E2E-05: Royale with 4 — rank-and-cut eliminates, the real player places first', async () => {
    const bots = await fresh(3, ['300', '200', '100']);
    await setupMatch(p, bots, 'pvp_royale', { pvpStartRound: 1, startingLives: 1, timer: false });
    let result: string | null = null;
    for (let ante = 1; ante <= 4 && !result; ante++) result = (await playAnte(p, { chips: WIN })).result;
    expect(await waitResult(p)).toBe('win');
    const eliminated = (await outcomes(p)).filter((o) => o.t === 'eliminated').map((o) => o.player_id);
    expect(new Set(eliminated).size).toBe(3);
    const win = (await outcomes(p)).find((o) => o.t === 'win') as { places?: Record<string, number> } | undefined;
    expect(win).toBeDefined();
    if (win?.places) expect(win.places[(await p.snap()).me!]).toBe(1);
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });

  it('E2E-06: Manhunt 1+2 — the Runner scoring below the best Hunter is caught', async () => {
    const bots = await fresh(2, ['500', '400']);
    await setupMatch(p, bots, 'pvp_manhunt', { pvpStartRound: 1, manhuntHunterLives: 7, timer: false });
    const lobby = await hostLobby(p);
    const me = (await p.snap()).me!;
    const runner = lobby.players.find((x) => x.team === 'RUNNER')?.id ?? me;
    expect(runner).toBe(me); // REF-01: no claimant → the first player (the host) runs
    await playAnte(p, { chips: 0 });
    expect(await waitResult(p)).toBe('lose');
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });

  it('E2E-07: Teams 2v2 — the team with the lower sum loses the shared life', async () => {
    const bots = await fresh(3, ['100', '100', '100']);
    // Real player + bot1 are A; bot2 + bot3 are B.
    await bots[0]!.ui('ui_set_team', { team: 'A' });
    const code = await (async () => {
      await p.ui('create', { queueMode: 'pvp_teams', kind: 'private' });
      return (await p.waitSnap((s) => !!s.code, 'lobby')).code!;
    })();
    for (const [k, v] of Object.entries({ pvpStartRound: 1, startingLives: 1, timer: false })) await p.ui('option', { key: k, value: v });
    for (const b of bots) await b.ui('ui_join', { code });
    await waitFor('4 players', async () => (await hostLobby(p)).players.length === 4, 180_000, 1000);
    await p.cmd('mp_send', { t: 'ui_set_team', d: { team: 'A' } });
    await bots[0]!.ui('ui_set_team', { team: 'A' });
    await bots[1]!.ui('ui_set_team', { team: 'B' });
    await bots[2]!.ui('ui_set_team', { team: 'B' });
    await waitFor(
      'teams set',
      async () => {
        const l = await hostLobby(p);
        return l.players.filter((x) => x.team === 'A').length === 2 && l.players.filter((x) => x.team === 'B').length === 2;
      },
      60_000,
      1000,
    );
    await waitFor('bots ready', async () => (await hostLobby(p)).players.filter((x) => x.ready).length >= 3, 60_000, 1000);
    await p.ui('start');
    await p.waitSnap((s) => !!s.runId, 'teams match started', 300_000);
    await p.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
    await playAnte(p, { chips: WIN });
    expect(await waitResult(p)).toBe('win');
    const teamLives = (await outcomes(p)).filter((o) => o.t === 'team_lives');
    expect(teamLives.some((o) => o.team_id === 'B' && o.lives === 0)).toBe(true);
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });

  it('E2E-20: a single-player save survives an MP loss, and the same seed deals the same shop after it', async () => {
    type Save = { exists: boolean; size?: number; hash?: string };
    // A single-player run to its first shop (vanilla writes save.jkr), outside any session.
    await p.cmd('start_run', { seed: 'RMHGOLD1', stake: 1 });
    await p.cmd('select_blind');
    await p.cmd('win_blind');
    await p.cmd('cash_out');
    const golden = await p.cmd<string>('shop_digest');
    // Leaving the run for the menu is when vanilla writes the save we then hold on to.
    await p.cmd('to_menu');
    await new Promise((r) => setTimeout(r, 3000));
    const save = await p.cmd<Save>('save_info');
    expect(save.exists).toBe(true);
    // An MP match, lost.
    const bots = await fresh(1, ['1000000000']);
    await setupMatch(p, bots, 'pvp_nemesis', { pvpStartRound: 1, startingLives: 1, timer: false });
    await playAnte(p, { chips: 0 });
    expect(await waitResult(p)).toBe('lose');
    await leaveMatch(p);
    const after = await p.cmd<Save>('save_info');
    expect(after).toEqual(save);
    // The same seed in single player again: the same first shop.
    await p.cmd('start_run', { seed: 'RMHGOLD1', stake: 1 });
    await p.cmd('select_blind');
    await p.cmd('win_blind');
    await p.cmd('cash_out');
    expect(await p.cmd<string>('shop_digest')).toBe(golden);
    expect(w.errors()).toEqual([]);
  });

  it('E2E-13: the host closes mid-match → the successor takes over → the match completes', async () => {
    const bots = await fresh(2, ['100', '50']);
    // A bot hosts; the real player is a member (and, joining first, the successor).
    const host = bots[0]!;
    await host.ui('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'bot lobby');
    for (const [k, v] of Object.entries({ pvpStartRound: 1, startingLives: 2, timer: false })) await host.ui('ui_set_option', { key: k, value: v });
    await p.ui('join', { code });
    await p.waitSnap((s) => s.code === code && s.role === 'member', 'joined the bot lobby');
    await bots[1]!.ui('ui_join', { code });
    await waitFor('3 players', async () => ((await p.snap()).lobby?.players.length ?? 0) === 3, 120_000, 1000);
    await p.cmd('ready');
    await waitFor('all ready', async () => (await p.snap()).lobby!.players.filter((x) => x.ready).length >= 2, 60_000, 1000);
    await host.ui('ui_start', {});
    await p.waitSnap((s) => !!s.runId, 'match started', 300_000);
    await p.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
    await playAnte(p, { chips: WIN });
    // The host's page goes away mid-match.
    await host.close();
    await p.waitSnap((s) => s.role === 'host', 'the real player promoted to host', 120_000);
    const changed = (await p.cmd<{ list: unknown[] }>('mp_inbox', { t: 'host_changed' })).list;
    expect(changed.length).toBeGreaterThan(0);
    let result: string | null = null;
    for (let ante = 2; ante <= 5 && !result; ante++) result = (await playAnte(p, { chips: WIN })).result;
    expect(await waitResult(p)).toBe('win');
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });
});
