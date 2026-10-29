/**
 * Items over the wire: a `loadout` command through the match host, the public `items` field and
 * the private pending / spawn-room flags in the snapshot stream, the answer event to the owner,
 * and the predicting client rebuilding the owner's unlock weapon from its defindex with the same
 * numbers the server uses.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TF_CLASS_SOLDIER } from '../../core/constants';
import { SnapshotClient, type TimedEvent } from '../../client/net/snapshot-client';
import { restorePlayerFromRecords } from '../../client/net/prediction';
import { Tf2MatchHost } from '../../server/tf2-match-host';
import { matchOptions, roomWorld } from '../../server/match.test-support';
import { hookPlayer } from './attributes';
import { decodeItems } from './loadout';
import { setItemCatalog } from './registry';
import { testCatalog } from './__fixtures__/catalog';

beforeEach(() => setItemCatalog(testCatalog()));
afterAll(() => setItemCatalog(null));

function pump(
  host: Tf2MatchHost,
  client: SnapshotClient,
  ticks: number,
  events: TimedEvent[] = [],
): void {
  for (let i = 0; i < ticks; i++) {
    host.tick();
    for (const p of host.drainOutgoing()) {
      if (p.to !== 1) continue;
      if (p.reliable) events.push(...(client.onReliable(p.data)?.events ?? []));
      else {
        const s = client.onSnapshot(p.data);
        if (s) events.push(...s.cosmetic);
      }
    }
  }
}

describe('items over the wire', () => {
  it('equip → pending → resupply → every client sees the items; the owner predicts the unlock', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 4, botCount: 0 }), {
      world: roomWorld(),
    });
    const client = new SnapshotClient();
    host.addPlayer(1, { name: 'Solly' });
    host.onCommand(1, { kind: 'team', team: 'red' });
    host.onCommand(1, { kind: 'class', cls: 'soldier' });
    pump(host, client, 300);
    const p = host.playerOf(1)!;
    expect(p.playerClass).toBe(TF_CLASS_SOLDIER);
    expect(decodeItems(String(client.localPlayer()!.items)).weapons.map((w) => w.item)).toEqual([
      18, 10, 6,
    ]);

    p.ownRespawnRoomCount = 0;
    const events: TimedEvent[] = [];
    host.onCommand(1, {
      kind: 'loadout',
      cls: 'soldier',
      slots: {
        primary: { item: 127 },
        secondary: { item: 133 },
        cosmetic1: { item: 30001, paint: 5029, style: 1 },
      },
    });
    pump(host, client, 4, events);
    const answer = events.map((e) => e.event).find((e) => e.type === 'loadout');
    expect(answer).toMatchObject({ type: 'loadout', status: 'pending', cls: TF_CLASS_SOLDIER });
    expect(client.localPlayer()!.loadoutPending).toBe(true);

    p.regenerate();
    pump(host, client, 4);
    const me = client.localPlayer()!;
    expect(me.loadoutPending).toBe(false);
    const items = decodeItems(String(me.items));
    expect(items.weapons.find((w) => w.slot === 'primary')?.item).toBe(127);
    expect(items.weapons.find((w) => w.slot === 'secondary')).toMatchObject({
      item: 133,
      worn: true,
    });
    expect(items.cosmetics).toEqual([{ item: 30001, paint: 5029, style: 1 }]);

    // The predicting client: a client-side world, the owner restored from his own records.
    const clientWorld = roomWorld(3);
    const ghost = clientWorld.addPlayer('ghost', {});
    restorePlayerFromRecords(ghost, me, client.localWeapons());
    const server = p.weapons[0]!;
    const predicted = ghost.weapons[0]!;
    expect(predicted.defindex).toBe(127);
    expect(predicted.classname).toBe(server.classname);
    expect((predicted as typeof server & { stats: unknown }).stats).toEqual(
      (server as typeof server & { stats: unknown }).stats,
    );
    expect(ghost.weapons[1]).toBeNull();
    expect(ghost.wornAttributes.length).toBe(1);
    expect(hookPlayer(ghost, 'rocket_jump_dmg_reduction', 1)).toBeCloseTo(
      hookPlayer(p, 'rocket_jump_dmg_reduction', 1),
      6,
    );
  });

  it('a refused equip answers the owner only', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 4, botCount: 0 }), {
      world: roomWorld(),
    });
    const client = new SnapshotClient();
    host.addPlayer(1, { name: 'Solly' });
    host.onCommand(1, { kind: 'team', team: 'red' });
    host.onCommand(1, { kind: 'class', cls: 'soldier' });
    pump(host, client, 300);
    const events: TimedEvent[] = [];
    host.onCommand(1, { kind: 'loadout', cls: 'soldier', slots: { primary: { item: 215 } } });
    pump(host, client, 4, events);
    expect(events.map((e) => e.event).find((e) => e.type === 'loadout')).toMatchObject({
      status: 'refused',
      reason: 'invalid',
    });
  });
});
