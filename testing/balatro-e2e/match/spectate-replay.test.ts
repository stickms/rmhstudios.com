/**
 * Spectating and replays (PLAN §6.3 E2E-19; MM-07, REP-02..05): a real player hosts a
 * match against a bot; a second real browser finds it in the spectate list and joins
 * mid-match as a spectator (it receives the logs so far, then live events); after the
 * match the player's My Replays lists it, and opening it plays it back.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { playAnte, setupMatch, waitResult } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();

type Box = { list: { t: string; d: Record<string, unknown> }[] };
const inbox = (p: MpPlayer, t: string) => p.cmd<Box>('mp_inbox', { t });

describe.skipIf(w.skip)(w.title('spectate and replay (2 browsers + 1 bot)'), () => {
  let host: MpPlayer;
  let watcher: MpPlayer;

  beforeAll(async () => {
    ({
      players: [host, watcher],
    } = (await w.up({ players: ['host', 'watcher'] })) as { players: MpPlayer[] });
  }, 600_000);

  afterAll(() => w.down());

  it('E2E-19: spectate list → mid-match join (full logs) → My Replays playback', async () => {
    const bot = await w.bot('opponent', { score: '10' });
    const { code, runId } = await setupMatch(host, [bot], 'pvp_nemesis', { pvpStartRound: 1, startingLives: 2, timer: false });
    await playAnte(host, { chips: 1_000_000 });

    // MM-07: the running lobby is in the hub's spectate list.
    await watcher.cmd('mp_send', { t: 'ui_spectate_list', d: {} });
    await waitFor(
      'spectate list with the lobby',
      async () => (await inbox(watcher, 'spectate_view')).list.some((e) => (e.d.lobbies as { code: string }[]).some((l) => l.code === code)),
      60_000,
      1000,
    );
    // Mid-match join as a spectator: it receives the match so far.
    await watcher.cmd('mp_send', { t: 'ui_spectate', d: { code } });
    await watcher.waitSnap((s) => s.role === 'spectator' && s.code === code, 'spectating', 120_000);
    await waitFor('the log so far reaches the spectator', async () => (await inbox(watcher, 'replay_feed')).list.length > 0, 120_000, 1000);
    const before = (await inbox(watcher, 'replay_feed')).list.reduce((n, e) => n + (e.d.events as unknown[]).length, 0);
    expect(before).toBeGreaterThan(0);

    // The match ends while watched; live events keep arriving.
    await playAnte(host, { chips: 1_000_000 });
    expect(await waitResult(host)).toBe('win');
    await waitFor(
      'live events after the join',
      async () => (await inbox(watcher, 'replay_feed')).list.reduce((n, e) => n + (e.d.events as unknown[]).length, 0) > before,
      60_000,
      1000,
    );

    // REP-03: My Replays lists the finished match; open → playback.
    await host.cmd('mp_send', { t: 'ui_leave', d: {} });
    await host.waitSnap((s) => s.role === null, 'host left', 120_000);
    await host.cmd('mp_send', { t: 'ui_replay', d: { op: 'list' } });
    let id = '';
    await waitFor(
      'the replay in My Replays',
      async () => {
        const views = (await inbox(host, 'replay_view')).list;
        const items = views.flatMap((v) => (v.d.list as { id: string }[] | undefined) ?? []);
        id = items.find((i) => i.id.includes(runId))?.id ?? items[0]?.id ?? '';
        return !!id;
      },
      60_000,
      1000,
    );
    await host.cmd('mp_send', { t: 'ui_replay', d: { op: 'open', id } });
    await waitFor(
      'playback started',
      async () => (await inbox(host, 'replay_view')).list.some((v) => !!(v.d.playing as { id?: string } | null)?.id),
      120_000,
      1000,
    );
    await host.cmd('mp_send', { t: 'ui_replay', d: { op: 'close' } }).catch(() => {});
    expect(w.errors()).toEqual([]);
    await watcher.cmd('mp_send', { t: 'ui_leave', d: {} }).catch(() => {});
  });
});
