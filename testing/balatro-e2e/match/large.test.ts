/**
 * A 16-player lobby (PLAN §6.3 E2E-22): one real browser and 15 bot peers. The lobby fills,
 * starts, every player gets an ante-1 Nemesis pairing (16 → eight pairs, no bye), and when
 * the host's page closes mid-match the successor takes over a room of 15 and the match
 * goes on (the next ante's pairing arrives from the new host).
 * BALATRO_E2E_BOTS overrides the bot count (default 15).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BotPeer } from '../lib/bot';
import type { MpPlayer } from '../lib/mp-player';
import { playAnte } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();
const BOTS = Number(process.env.BALATRO_E2E_BOTS ?? 15);

type Outcome = { t: string; [k: string]: unknown };
const outcomes = async (p: MpPlayer): Promise<Outcome[]> =>
  (await p.cmd<{ list: { d: { o: Outcome } }[] }>('mp_inbox', { t: 'outcome' })).list.map((e) => e.d.o);

describe.skipIf(w.skip)(w.title(`large lobby (1 browser + ${BOTS} bots)`), () => {
  let p: MpPlayer;
  const bots: BotPeer[] = [];

  beforeAll(async () => {
    p = await w.player('real');
    for (let i = 0; i < BOTS; i++) bots.push(await w.bot(`b${i + 1}`, { score: String(10 + i) }));
  }, 900_000);

  afterAll(() => w.down());

  it(`E2E-22: ${BOTS + 1} players start; ante-1 pairings for all; host migration in the large room`, async () => {
    const host = bots[0]!;
    await host.ui('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'bot lobby');
    for (const [k, v] of Object.entries({ pvpStartRound: 1, startingLives: 4, timer: false })) await host.ui('ui_set_option', { key: k, value: v });
    // The real player joins first, so it is the successor.
    await p.ui('join', { code });
    await p.waitSnap((s) => s.code === code && s.role === 'member', 'joined', 120_000);
    for (const b of bots.slice(1)) await b.ui('ui_join', { code });
    await waitFor('the room is full', async () => ((await p.snap()).lobby?.players.length ?? 0) === BOTS + 1, 300_000, 2000);
    await p.cmd('ready');
    await waitFor('all ready', async () => (await p.snap()).lobby!.players.filter((x) => x.ready).length >= BOTS, 120_000, 2000);
    await host.ui('ui_start', {});
    await p.waitSnap((s) => !!s.runId, 'match started', 300_000);
    await p.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
    await waitFor('ante-1 pairing', async () => (await outcomes(p)).some((o) => o.t === 'nemesis_pairing' && o.ante === 1), 120_000, 1000);
    const pairing = (await outcomes(p)).find((o) => o.t === 'nemesis_pairing' && o.ante === 1)!.pairing as Record<string, string>;
    expect(Object.keys(pairing).length).toBe(BOTS + 1);
    if ((BOTS + 1) % 2 === 0) expect(Object.values(pairing).filter((v) => v === '').length).toBe(0);
    for (const [x, y] of Object.entries(pairing)) if (y) expect(pairing[y]).toBe(x);
    await playAnte(p, { chips: 1_000_000 });
    // Host migration in a room of BOTS+1.
    await host.close();
    await p.waitSnap((s) => s.role === 'host', 'the real player promoted', 180_000);
    await playAnte(p, { chips: 1_000_000 });
    await waitFor('ante-2 pairing from the new host', async () => (await outcomes(p)).some((o) => o.t === 'nemesis_pairing' && o.ante === 2), 180_000, 1000);
    const live = bots.slice(1);
    const states = await Promise.all(live.map((b) => b.state<{ runId: string | null }>()));
    expect(states.every((s) => s.runId === states[0]!.runId)).toBe(true);
    expect(w.errors()).toEqual([]);
  });
});
