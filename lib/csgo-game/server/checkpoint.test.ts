/**
 * Host migration for CS:GO: a bomb-defusal match with bots, written down mid-round (sim/checkpoint),
 * packed and restored through CsMatchHost.restore into a fresh world, then both run on with the same
 * inputs — identical, field for field. The engine's registry dispatches a CS checkpoint restored
 * through Tf2MatchHost.restore (the listen worker's path) to CsMatchHost.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { NAV_HULL_CS, NavGenerator } from '../../tf2-game/bots/nav/generate';
import { packCheckpoint, unpackCheckpoint } from '../../tf2-game/sim/checkpoint/pack';
import { Tf2MatchHost } from '../../tf2-game/server/tf2-match-host';
import { matchOptions } from '../../tf2-game/server/match.test-support';
import {
  asMapCollision,
  csCollision,
  csNavBsp,
  csTestWorld,
  setupCs,
} from '../__fixtures__/cs-world';
import { csCheckpointCatalog } from '../checkpoint-catalog';
import { CsMatchHost } from './cs-match-host';
import type { CsPlayer } from '../player';

beforeAll(setupCs);

/** The first object whose encoding differs (readable). */
function firstDiff(a: { objs: unknown[] }, b: { objs: unknown[] }): string | null {
  const n = Math.max(a.objs.length, b.objs.length);
  for (let i = 0; i < n; i++) {
    const ea = JSON.stringify(a.objs[i]);
    const eb = JSON.stringify(b.objs[i]);
    if (ea !== eb) return `object ${i}: ${ea?.slice(0, 300)} vs ${eb?.slice(0, 300)}`;
  }
  return null;
}

describe('CS:GO checkpoints', () => {
  it('a match with bots restores mid-round and runs on identically', async () => {
    const nav = new NavGenerator(csNavBsp(), asMapCollision(csCollision()), {
      hull: NAV_HULL_CS,
    }).run();
    const options = matchOptions({
      game: 'csgo',
      variant: 'de',
      map: 'de_dust2',
      maxPlayers: 8,
      botCount: 6,
      seed: 77,
    });
    const settings = { freezeTime: 2, roundRestartDelay: 2 };
    const a = new CsMatchHost(
      { ...options },
      { world: csTestWorld({ seed: 77, settings }), nav, console: { kind: 'listen', ownerId: 1 } },
    );
    a.addPlayer(1, { name: 'Host', userId: 'u1' });
    a.onCommand(1, { kind: 'team', team: 'blue' });
    a.onCommand(1, { kind: 'extra', command: 'mp_c4timer', args: ['30'] });
    const host = a.csPlayerOf(1)!;
    expect(host.team).toBe(3);
    for (let i = 0; i < 66 * 25; i++) {
      a.tick();
      a.drainOutgoing();
    }
    // Mid-fight: some money moved, somebody has died.
    const deaths = (a.world.players() as CsPlayer[]).reduce((n, p) => n + p.stats.deaths, 0);
    expect(deaths).toBeGreaterThan(0);

    const catalog = csCheckpointCatalog();
    const cp = a.checkpoint(catalog);
    const restored = await unpackCheckpoint(await packCheckpoint(cp));
    // The listen worker's path: Tf2MatchHost.restore hands a CS checkpoint to the CS host.
    const b = Tf2MatchHost.restore(
      { ...options },
      { world: csTestWorld({ seed: 77, settings }), nav, console: { kind: 'listen', ownerId: 1 } },
      restored,
      catalog,
    );
    expect(b).toBeInstanceOf(CsMatchHost);
    expect(b.serverConsole.value('mp_c4timer')).toBe('30');
    expect(Tf2MatchHost.checkpointSeats(cp).map((s) => s.userId)).toEqual(['u1']);
    // Compared after each tick (the restored console tells its rejoining clients the replicated cvars).
    for (let i = 0; i < 1500; i++) {
      a.tick();
      a.drainOutgoing();
      b.tick();
      b.drainOutgoing();
      if (i === 0 || i === 499)
        expect(firstDiff(a.checkpoint(catalog).graph, b.checkpoint(catalog).graph)).toBeNull();
    }
    expect(firstDiff(a.checkpoint(catalog).graph, b.checkpoint(catalog).graph)).toBeNull();
    expect(b.world.tickCount).toBe(a.world.tickCount);
  }, 120_000);
});
