/**
 * Matchmaking, parties and invite links (PLAN §6.3 E2E-17/18; MM-01..06, LOB-04): one real
 * browser and bot peers over the local hub.
 *   E2E-17: two searchers on the casual Nemesis queue are matched; the setup (ruleset vote,
 *           trap vote when Balanced/Expanded rolls, deck draft) runs to the match start.
 *   E2E-18: a party of two queues for Royale and is placed in the same lobby as a solo.
 *   LOB-04: `/balatro?lobby=CODE` joins that lobby once the engine runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { openMpPlayer } from '../lib/mp-player';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();


describe.skipIf(w.skip)(w.title('queue, party and invite link (1 browser + bots)'), () => {
  let p: MpPlayer;

  beforeAll(async () => {
    p = await w.player('searcher');
  }, 600_000);

  afterAll(() => w.down());

  it('E2E-17: casual Nemesis — matched, voted, drafted, started', async () => {
    const bot = await w.bot('qbot');
    await p.ui('queue', { queueMode: 'pvp_nemesis' });
    await p.waitUi((u) => u.queue === 'searching', 'searching', 30_000);
    await bot.ui('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    // Matched into one casual lobby (the hub's 10 s gather, then a host claim).
    await waitFor(
      'matched into a lobby',
      async () => {
        const [s, b] = [await p.snap(), await bot.state()];
        return !!s.code && s.code === b.code;
      },
      120_000,
      1000,
    );
    // The setup: vote whenever a vote is open, draft whenever it is our turn (the bot times out → random).
    const deadline = Date.now() + 360_000;
    while (Date.now() < deadline && !(await p.snap()).runId) {
      const ui = await p.uiState().catch(() => null);
      if (ui?.setup?.phase === 'voting') await p.cmd('vote', { option: 'random' }).catch(() => {});
      if (ui?.setup?.kind === 'draft') await p.mp('draft').catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
    }
    const s = await p.snap();
    expect(s.runId).toBeTruthy();
    expect(s.lobby?.kind).toBe('casual');
    await p.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
    expect(w.errors()).toEqual([]);
    await p.cmd('forfeit').catch(() => {});
    await leaveMatch(p);
    await bot.close();
  });

  it('E2E-18: a party of two queues for Royale and lands with a solo searcher in one lobby', async () => {
    const mate = await w.bot('mate');
    const solo = await w.bot('solo');
    await p.ui('create', { queueMode: 'pvp_royale', kind: 'party' });
    const party = (await p.waitSnap((s) => !!s.code, 'party lobby')).code!;
    await mate.ui('ui_join', { code: party });
    await p.waitSnap((s) => (s.lobby?.players.length ?? 0) === 2, 'mate in the party', 120_000);
    const me = (await p.snap()).me;
    await waitFor('mate ready', async () => !!(await p.snap()).lobby?.players.find((x) => x.id !== me && x.ready), 60_000, 1000);
    await solo.ui('ui_queue', { op: 'join', queueMode: 'pvp_royale' });
    await p.cmd('mp_send', { t: 'ui_party_queue', d: { queueMode: 'pvp_royale' } });
    await waitFor(
      'party and solo in one casual lobby',
      async () => {
        const [a, b, c] = [await p.snap(), await mate.state(), await solo.state()];
        return !!a.code && a.code !== party && a.code === b.code && a.code === c.code;
      },
      180_000,
      1000,
    );
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
    await mate.close();
    await solo.close();
  });

  it('LOB-04: /balatro?lobby=CODE joins that lobby once the engine runs', async () => {
    const host = await w.bot('linkhost');
    await host.ui('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'bot lobby');
    const [acc] = await w.accountsFor(['linked']);
    const linked = await openMpPlayer(acc!, w.baseUrl, { path: `/balatro?lobby=${code}`, open: false });
    w.players.push(linked);
    await linked.waitSnap((s) => s.code === code && s.role === 'member', 'joined through the link', 180_000);
    expect(new URL(linked.page.url()).searchParams.get('lobby')).toBeNull();
    expect(w.errors()).toEqual([]);
    await leaveMatch(linked);
    await host.close();
  });
});
