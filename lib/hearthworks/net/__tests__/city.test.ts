import { describe, expect, it } from 'vitest';
import { UTILITY_IDS, ZONE_IDS } from '../../content';
import type { LocalCommand } from '../../store';
import { roadAt, stepWorld, utilityAt, worldHash, zoneAt, type World } from '../../world';
import { arena } from '../../world/__tests__/arena';
import { decodeWorld, encodeWorld } from '../../save';
import { HostSession } from '../host';
import { PeerSession } from '../peer';
import { localCommandSchema, peerMessageSchema } from '../protocol';
import { linkPair, settle, type TestLink } from './memory-link';

/** Every city command type, in a well-formed example — so adding one without a schema fails here AND at compile time. */
const SAMPLES: LocalCommand[] = [
  { type: 'placeRoad', x: 4, z: 5 },
  { type: 'placeRoad', x: 4, z: 5, x2: 9, z2: 5 },
  { type: 'removeRoad', x: 4, z: 5, x2: 4, z2: 9 },
  { type: 'zone', zone: 'homes', x: 4, z: 5, x2: 8, z2: 7 },
  { type: 'unzone', x: 4, z: 5 },
  { type: 'placeUtility', kind: 'windmill', x: 4, z: 5 },
  { type: 'removeUtility', x: 4, z: 5 },
  { type: 'claimMilestone', id: 'hamlet' },
  { type: 'setTaxRate', rate: 12 },
];

describe('the city commands on the wire', () => {
  const ok = (cmd: unknown) => localCommandSchema.safeParse(cmd).success;

  it('accepts every city command type and every zone and utility id', () => {
    for (const c of SAMPLES) expect(ok(c)).toBe(true);
    for (const zone of ZONE_IDS) expect(ok({ type: 'zone', zone, x: 1, z: 1 })).toBe(true);
    for (const kind of UTILITY_IDS)
      expect(ok({ type: 'placeUtility', kind, x: 1, z: 1 })).toBe(true);
    for (const c of SAMPLES)
      expect(peerMessageSchema.safeParse({ t: 'cmd', seq: 1, cmd: c }).success).toBe(true);
  });

  it('refuses junk: unknown ids, non-integer or negative tiles, extra keys, spoofed identity', () => {
    expect(ok({ type: 'zone', zone: 'casino', x: 1, z: 1 })).toBe(false);
    expect(ok({ type: 'placeUtility', kind: 'reactor', x: 1, z: 1 })).toBe(false);
    expect(ok({ type: 'placeRoad', x: 1.5, z: 1 })).toBe(false);
    expect(ok({ type: 'placeRoad', x: -1, z: 1 })).toBe(false);
    expect(ok({ type: 'placeRoad', x: 1, z: 1, x2: 'a' })).toBe(false);
    expect(ok({ type: 'placeRoad', x: 1, z: 1, playerId: 'bob' })).toBe(false);
    expect(ok({ type: 'claimMilestone', id: '' })).toBe(false);
    expect(ok({ type: 'claimMilestone', id: 'x'.repeat(64) })).toBe(false);
    expect(ok({ type: 'removeUtility', x: 1 })).toBe(false);
    for (const rate of [-1, 21, 9.5, '9', null, Number.NaN]) expect(ok({ type: 'setTaxRate', rate })).toBe(false);
    expect(ok({ type: 'setTaxRate' })).toBe(false);
    expect(ok({ type: 'setTaxRate', rate: 9, playerId: 'bob' })).toBe(false);
    expect(ok({ type: 'setTaxRate', rate: 0 })).toBe(true);
    expect(ok({ type: 'setTaxRate', rate: 20 })).toBe(true);
  });
});

describe('replicas stay identical while a town is built and grows', () => {
  function setup() {
    const world = arena(32, 9);
    for (const id of ['hosty', 'alice', 'bob']) {
      stepWorld(world, 0, [{ type: 'join', playerId: id }]);
      world.players[id].money = 4000;
      world.players[id].x = 3;
      world.players[id].z = 3;
    }
    const host = new HostSession(world, 'hosty');
    const peers = new Map<string, PeerSession>();
    const links: TestLink[] = [];
    for (const id of ['alice', 'bob']) {
      const [h, p] = linkPair();
      host.addPeer(id, h);
      peers.set(id, new PeerSession(id, p));
      links.push(h, p);
    }
    settle(links);
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        host.step();
        settle(links);
      }
    };
    tick(2);
    return { host, peers, links, tick };
  }

  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as object)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  const same = (a: World, b: World) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

  it('orders road, zone, utility and claim commands from three players into the same town on every replica', () => {
    const { host, peers, links, tick } = setup();
    const alice = peers.get('alice')!;
    const bob = peers.get('bob')!;
    const m = 16;
    alice.send({ type: 'placeRoad', x: m, z: m, x2: m + 8, z2: m });
    bob.send({ type: 'zone', zone: 'homes', x: m + 1, z: m - 1, x2: m + 6, z2: m - 1 });
    host.submit({ type: 'placeUtility', kind: 'windmill', x: m + 8, z: m - 1 });
    host.submit({ type: 'placeUtility', kind: 'well', x: m + 8, z: m + 1 });
    bob.send({ type: 'zone', zone: 'market', x: m + 1, z: m + 1, x2: m + 3, z2: m + 1 });
    tick(3);
    // The peers' own predicted views already show the same town once their commands are acknowledged.
    expect(roadAt(host.world, m + 8, m)).toBe(true);
    expect(zoneAt(host.world, m + 3, m - 1)).toBe('homes');
    expect(utilityAt(host.world, m + 8, m - 1)).toBe('windmill');
    expect(same(alice.view!, host.world)).toBe(true);
    expect(same(bob.view!, host.world)).toBe(true);

    // Let it grow for a few game minutes, with a late edit now and then, and compare as it goes.
    for (let i = 0; i < 16; i++) {
      tick(100);
      if (i === 3) alice.send({ type: 'placeRoad', x: m + 9, z: m, x2: m + 9, z2: m + 5 });
      if (i === 6) bob.send({ type: 'removeRoad', x: m + 9, z: m + 3 });
      if (i === 9) host.submit({ type: 'unzone', x: m + 1, z: m - 1, x2: m + 2, z2: m - 1 });
      if (i % 5 === 4) {
        tick(3);
        expect(same(alice.view!, host.world)).toBe(true);
        expect(same(bob.view!, host.world)).toBe(true);
      }
    }
    expect(host.world.city.population).toBeGreaterThan(0);

    // A latecomer admitted now is handed the whole town in its snapshot and keeps in step.
    const [h, p] = linkPair();
    host.addPeer('carol', h);
    const carol = new PeerSession('carol', p);
    links.push(h, p);
    settle(links);
    tick(5);
    expect(carol.ready).toBe(true);
    expect(worldHash(carol.view!)).toBe(worldHash(host.world));
    // A tax rate set by a peer reaches every replica, and a latecomer's snapshot carries it.
    bob.send({ type: 'setTaxRate', rate: 15 });
    tick(3);
    expect(host.world.city.taxRate).toBe(15);
    expect(alice.view!.city.taxRate).toBe(15);
    expect(bob.view!.city.taxRate).toBe(15);
    expect(same(alice.view!, host.world)).toBe(true);
    const [h2, p2] = linkPair();
    host.addPeer('dave', h2);
    const dave = new PeerSession('dave', p2);
    links.push(h2, p2);
    settle(links);
    tick(5);
    expect(dave.view!.city.taxRate).toBe(15);
    expect(worldHash(dave.view!)).toBe(worldHash(host.world));
    // …and the snapshot round trip alone preserves the hash.
    expect(worldHash(decodeWorld(encodeWorld(host.world)))).toBe(worldHash(host.world));
  }, 60_000);
});
