import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, buildingAt, type World } from '../../world';
import { HostSession, PEER_COMMANDS_PER_SECOND } from '../host';
import { PeerSession } from '../peer';
import { encodeJson } from '../protocol';
import { linkPair, settle, type TestLink } from './memory-link';

/** Structural equality: key order is irrelevant (a decoded snapshot emits keys in schema order). */
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
      : v;
const same = (a: World, b: World) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** A player that already exists in the world with some stock, as a loaded save would have. */
function withStock(world: World, id: string, inventory: World['players'][string]['inventory']) {
  stepWorld(world, 0, [{ type: 'join', playerId: id }]);
  world.players[id].inventory = inventory;
  world.players[id].x = 2;
  world.players[id].z = 2;
}

function setup(peerIds: string[] = ['alice', 'bob'], prepare?: (w: World) => void) {
  const world = createWorld(5, 32);
  prepare?.(world);
  const host = new HostSession(world, 'hosty');
  const peers = new Map<string, PeerSession>();
  const hostEnds: TestLink[] = [];
  const peerEnds: TestLink[] = [];
  for (const id of peerIds) {
    const [h, p] = linkPair();
    host.addPeer(id, h);
    peers.set(id, new PeerSession(id, p));
    hostEnds.push(h);
    peerEnds.push(p);
  }
  const all = [...hostEnds, ...peerEnds];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      host.step();
      settle(all);
    }
  };
  settle(all);
  tick(2); // the joins go through the stream
  return { host, peers, hostEnds, peerEnds, all, tick };
}

describe('replication', () => {
  it('admits peers with a snapshot, then keeps every replica identical to the host through the tick stream', () => {
    const { host, peers, tick } = setup();
    const a = peers.get('alice')!;
    expect(a.ready).toBe(true);
    const m = Math.floor(host.world.size / 2);
    a.send({ type: 'place', kind: 'cottage', x: m + 1, z: m });
    peers.get('bob')!.send({ type: 'place', kind: 'road', x: m + 2, z: m });
    host.submit({ type: 'place', kind: 'road', x: m + 3, z: m });
    tick(3);
    expect(Object.keys(host.world.players).sort()).toEqual(['alice', 'bob', 'hosty']);
    for (const p of peers.values()) {
      // peers' pending commands are all acknowledged, so the view equals the confirmed host state
      expect(same(p.view!, host.world)).toBe(true);
    }
    expect(buildingAt(host.world, m + 1, m)?.kind).toBe('cottage');
  });

  it("shows a peer's own command instantly (prediction) and applies it exactly once when acknowledged", () => {
    const { host, peers, tick } = setup(['alice']);
    const a = peers.get('alice')!;
    const m = Math.floor(host.world.size / 2);
    const before = a.view!.players.alice.money;
    a.send({ type: 'place', kind: 'cottage', x: m + 1, z: m });
    // not a single tick has run, yet the peer already sees the building and the debit
    expect(buildingAt(a.view!, m + 1, m)?.kind).toBe('cottage');
    expect(a.view!.players.alice.money).toBe(before - 120);
    tick(2);
    expect(a.view!.players.alice.money).toBe(before - 120);
    expect(host.world.players.alice.money).toBe(before - 120);
  });

  it('corrects a prediction the host refuses: the view converges to the truth', () => {
    const { host, peers, tick } = setup();
    const m = Math.floor(host.world.size / 2);
    peers.get('alice')!.send({ type: 'place', kind: 'cottage', x: m + 1, z: m });
    // bob predicts the same tile; the host orders alice first, so bob's is refused
    peers.get('bob')!.send({ type: 'place', kind: 'kitchen', x: m + 1, z: m });
    expect(buildingAt(peers.get('bob')!.view!, m + 1, m)?.kind).toBe('kitchen');
    tick(3);
    expect(buildingAt(host.world, m + 1, m)?.kind).toBe('cottage');
    expect(same(peers.get('bob')!.view!, host.world)).toBe(true);
    expect(host.world.players.bob.money).toBe(300); // never charged
  });
});

describe('a hostile or broken peer', () => {
  it('cannot spoof another player, join as someone else, or send malformed commands', () => {
    const { host, peers, peerEnds, tick } = setup(['alice', 'bob']);
    const raw = (m: unknown) => peerEnds[0].send(encodeJson(m as never));
    raw({ t: 'cmd', seq: 0, cmd: { type: 'sell', item: 'bread', qty: 1, playerId: 'bob' } }); // extra key
    raw({ t: 'cmd', seq: 1, cmd: { type: 'join' } }); // not a peer's to send
    raw({ t: 'cmd', seq: 2, cmd: { type: 'place', kind: 'nuke', x: 1, z: 1 } });
    raw({ t: 'cmd', seq: 3, cmd: { type: 'sell', item: 'bread', qty: -3 } });
    raw({ t: 'nonsense' });
    peerEnds[0].send(new Uint8Array([9, 9, 9]));
    peerEnds[0].send(new Uint8Array(0));
    peerEnds[0].send(new Uint8Array(100_000).fill(1)); // far over the size cap
    const before = JSON.stringify(host.world.players);
    tick(3);
    expect(JSON.stringify(host.world.players)).toBe(before);
    expect(host.stats.rejectedFrames).toBeGreaterThanOrEqual(7);
    expect(peers.get('bob')!.view!.players.bob.money).toBe(300);
  });

  it('is rate limited: a flood in one tick applies at most a second of commands', () => {
    const { host, peers, tick } = setup(['alice']);
    const a = peers.get('alice')!;
    const m = Math.floor(host.world.size / 2);
    for (let i = 0; i < 500; i++) a.send({ type: 'remove', x: m, z: m });
    tick(1);
    expect(host.stats.rateLimited).toBeGreaterThan(300);
    expect(PEER_COMMANDS_PER_SECOND).toBeLessThanOrEqual(60);
  });
});

describe('desync recovery', () => {
  it('notices a lost tick, asks for a snapshot and converges again', () => {
    const { host, peers, hostEnds, peerEnds, all, tick } = setup(['alice']);
    const a = peers.get('alice')!;
    const m = Math.floor(host.world.size / 2);
    // drop exactly one tick message on its way to alice
    let dropped = false;
    hostEnds[0].filter = (d) => {
      if (!dropped && d[0] === 1) {
        dropped = true;
        return false;
      }
      return true;
    };
    host.submit({ type: 'place', kind: 'road', x: m + 1, z: m });
    host.step(); // lost
    settle(all);
    host.submit({ type: 'place', kind: 'road', x: m + 2, z: m });
    tick(3); // gap noticed → resync → snapshot
    expect(a.stats.resyncs).toBe(1);
    expect(a.ready).toBe(true);
    expect(same(a.view!, host.world)).toBe(true);
    expect(peerEnds[0].open).toBe(true);
  });
});

describe('host migration', () => {
  it('names the longest-connected peer as successor', () => {
    const { host, peers } = setup(['alice', 'bob']);
    expect(host.successor()).toBe('alice');
    expect(peers.get('alice')!.successor).toBe('alice');
    expect(peers.get('bob')!.successor).toBe('alice');
  });

  it('promotes the successor from its replica; peers rebind and nothing is lost or doubled', () => {
    const { host, peers, hostEnds, peerEnds, all, tick } = setup(['alice', 'bob'], (w) =>
      withStock(w, 'bob', { bread: 2 }),
    );
    const m = Math.floor(host.world.size / 2);
    // Give the old world something real to preserve: a stall, a kitchen and sold bread.
    peers.get('alice')!.send({ type: 'place', kind: 'stall', x: m + 1, z: m });
    peers.get('alice')!.send({ type: 'place', kind: 'kitchen', x: m + 2, z: m });
    tick(3);
    peers.get('bob')!.send({ type: 'sell', item: 'bread', qty: 1 });
    tick(2);
    const moneyBeforeLoss = host.world.players.bob.money;
    expect(peers.get('bob')!.view!.players.bob.inventory.bread).toBe(1);

    // Bob sells again, but the old host dies before bob's link ever carries it back: the cmd stays pending.
    hostEnds.forEach((l) => (l.filter = () => false));
    peers.get('bob')!.send({ type: 'sell', item: 'bread', qty: 1 }); // pending: the old host dies before applying it
    // ---- the host vanishes ----
    for (const l of hostEnds) l.close();
    expect(peers.get('alice')!.hostLost).toBe(true);
    expect(peers.get('bob')!.hostLost).toBe(true);

    const successor = peers.get(peers.get('bob')!.successor!)!;
    expect(successor.myId).toBe('alice');
    const newHost = successor.promote();
    expect(newHost.world.players.bob.money).toBe(moneyBeforeLoss); // the replica carried everything over

    // bob reconnects to the new host
    const [nh, nb] = linkPair();
    newHost.addPeer('bob', nh);
    peers.get('bob')!.rebind(nb);
    const links = [nh, nb];
    settle(links);
    for (let i = 0; i < 3; i++) {
      newHost.step();
      settle(links);
    }
    const bob = peers.get('bob')!;
    expect(bob.ready).toBe(true);
    expect(same(bob.view!, newHost.world)).toBe(true);
    // the resent sell is applied by the new host exactly once (it never reached the old one)
    expect(newHost.world.players.bob.money).toBe(moneyBeforeLoss + 40);
    expect(newHost.world.players.bob.inventory.bread).toBe(0);
    expect(buildingAt(newHost.world, m + 1, m)?.kind).toBe('stall');
    expect(newHost.successor()).toBe('bob');
    void all;
    void peerEnds;
  });

  it('does not apply a command twice when it is resent to a new host that already saw it', () => {
    const world = createWorld(5, 32);
    withStock(world, 'alice', { bread: 3 });
    const oldHost = new HostSession(world, 'h');
    const [h1, p1] = linkPair();
    const [h2, p2] = linkPair();
    oldHost.addPeer('alice', h1);
    oldHost.addPeer('bob', h2);
    const alice = new PeerSession('alice', p1);
    const bob = new PeerSession('bob', p2);
    const all = [h1, p1, h2, p2];
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        oldHost.step();
        settle(all);
      }
    };
    settle(all);
    tick(2);
    alice.send({ type: 'place', kind: 'stall', x: 17, z: 16 });
    tick(2);
    // alice's sell reaches the host, which applies it and ticks it to everyone...
    alice.send({ type: 'sell', item: 'bread', qty: 1 });
    settle(all);
    // ...but the host-to-alice direction goes dead first, so alice never learns it was applied
    h1.filter = () => false;
    oldHost.step();
    settle(all);
    expect(bob.view!.players.alice.inventory.bread).toBe(2); // bob (the successor) saw it
    expect(alice.view!.players.alice.inventory.bread).toBe(2); // alice's own prediction
    h1.close();
    h2.close();
    const newHost = bob.promote();
    const moneyAfterOneSale = newHost.world.players.alice.money;
    const [nh, na] = linkPair();
    newHost.addPeer('alice', nh);
    alice.rebind(na); // resends the unacked sell
    for (let i = 0; i < 4; i++) {
      newHost.step();
      settle([nh, na]);
    }
    expect(newHost.world.players.alice.money).toBe(moneyAfterOneSale); // sold once, not twice
    expect(newHost.world.players.alice.inventory.bread).toBe(2);
    void stepWorld;
  });
});
