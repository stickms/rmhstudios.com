/**
 * Host migration mid-match (PLAN §6.3 E2E-13), one real browser plus bot peers: a bot hosts,
 * the real player is the successor, the host's page closes after ante 1 and the match is
 * played to its end under the new host. Split from formats.test.ts so CI runs it on its own
 * shard (testing/balatro-e2e/shards.ts).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { BotPeer } from '../lib/bot';
import type { MpPlayer } from '../lib/mp-player';
import { admitted, playAnte, waitResult, leaveMatch } from '../lib/match-flow';
import { waitFor } from '../lib/stack';
import { matchWorld } from './world';

const w = matchWorld();
const WIN = 1_000_000;

async function fresh(n: number, scores: string[]): Promise<BotPeer[]> {
  for (const b of w.bots.splice(0)) await b.close().catch(() => {});
  const out: BotPeer[] = [];
  for (let i = 0; i < n; i++) out.push(await w.bot(`bot${i + 1}`, { score: scores[i] ?? '100' }));
  return out;
}

describe.skipIf(w.skip)(w.title('host migration (1 browser + bots)'), () => {
  let p: MpPlayer;

  beforeAll(async () => {
    p = await w.player('real');
  }, 600_000);

  afterEach(() => w.cleanup(), 300_000);
  afterAll(() => w.down());

  it('E2E-13: the host closes mid-match → the successor takes over → the match completes', async () => {
    const bots = await fresh(2, ['100', '50']);
    // A bot hosts; the real player is a member (and, joining first, the successor).
    const host = bots[0]!;
    await host.ui('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'bot lobby');
    for (const [k, v] of Object.entries({ pvpStartRound: 1, startingLives: 2, timer: false }))
      await host.ui('ui_set_option', { key: k, value: v });
    await p.ui('join', { code });
    // Admitted before the second bot joins: the successor is the earliest-admitted player.
    await p.waitSnap(
      (s) => s.code === code && s.role === 'member' && admitted(s),
      'admitted to the bot lobby',
      120_000,
    );
    await bots[1]!.ui('ui_join', { code });
    await waitFor(
      '3 players',
      async () => ((await p.snap()).lobby?.players.length ?? 0) === 3,
      120_000,
      1000,
    );
    await p.cmd('ready');
    await waitFor(
      'all ready',
      async () => (await p.snap()).lobby!.players.filter((x) => x.ready).length >= 2,
      60_000,
      1000,
    );
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
    for (let ante = 2; ante <= 5 && !result; ante++)
      result = (await playAnte(p, { chips: WIN })).result;
    expect(await waitResult(p)).toBe('win');
    expect(w.errors()).toEqual([]);
    await leaveMatch(p);
  });
});
