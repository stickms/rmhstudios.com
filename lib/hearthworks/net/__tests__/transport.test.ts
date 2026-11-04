import { describe, expect, it } from 'vitest';
import { FakeNet, fakeConnection, type PathConfig } from '../../../shared/p2p/fake-channel.test-support';
import type { Scheduler } from '../../../shared/p2p/connector';
import { createHearthworksStore } from '../../store';
import { TICK_MS, createWorld, stepWorld } from '../../world';
import { newFarmhand } from '../../world/farmhands';
import { channelPairToLink } from '../channel-link';
import { signalPayload } from '../connector';
import { hostDriver, peerDriver } from '../driver';
import { HostSession } from '../host';
import { LOCAL_PLAYER_ID, rekeyPlayer } from '../identity';
import { PeerSession } from '../peer';
import { localCommandSchema, peerMessageSchema } from '../protocol';

function sched(net: FakeNet): Scheduler {
  return {
    now: () => net.now,
    mono: () => net.now,
    after(ms, fn) {
      let live = true;
      net.at(net.now + ms, () => live && fn());
      return () => (live = false);
    },
    every(ms, fn) {
      let live = true;
      const arm = () => net.at(net.now + ms, () => live && (fn(), arm()));
      arm();
      return () => (live = false);
    },
  };
}

/** A host-side and a member-side link over negotiated fake channels (latency 20 ms, DataChannel-like limits). */
function links(path: Partial<PathConfig> = {}, kind: 'direct' | 'relay' = 'direct') {
  const net = new FakeNet();
  const s = sched(net);
  const conn = fakeConnection(net, { latencyMs: 20, ...path }, 30);
  const host = channelPairToLink(conn.host, kind, s);
  const member = channelPairToLink(conn.member, kind, s);
  const settle = async (ms: number) => {
    for (let t = 0; t < ms; t += 10) {
      net.advance(net.now + 10);
      for (let i = 0; i < 3; i++) await Promise.resolve();
    }
  };
  return { net, conn, host, member, settle };
}

const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);

describe('channelPairToLink', () => {
  it('opens only when both channels are open, and tells a listener that arrives late', async () => {
    const { host, settle } = links();
    expect(host.open).toBe(false);
    let opened = 0;
    host.onopen = () => opened++;
    await settle(100);
    expect(host.open).toBe(true);
    expect(opened).toBe(1);
    let late = 0;
    host.onopen = () => late++;
    await settle(10);
    expect(late).toBe(1);
  });

  it('carries a snapshot-sized frame intact: fragmented under the DataChannel limit, reassembled whole', async () => {
    // 600 KB is more than a DataChannel will take in one message (the fake refuses above 256 KiB, like Chromium).
    const { host, member, settle, conn } = links({ bandwidth: 5_000_000 });
    const got: Uint8Array[] = [];
    member.onmessage = (d) => got.push(d);
    await settle(100);
    const frame = bytes(600_000);
    host.send(frame);
    await settle(2_000);
    expect(got).toHaveLength(1);
    expect(got[0].byteLength).toBe(frame.byteLength);
    expect(got[0].every((b, i) => b === frame[i])).toBe(true);
    // Nothing above the interoperable 16 KB SCTP size ever hit the reliable channel.
    expect(conn.host.reliable.sent).toBeGreaterThan(30);
    // And the pings stayed on the unreliable channel, inside the MTU.
    expect((conn.host.unreliable as { overMtu: number }).overMtu).toBe(0);
  });

  it('keeps messages in order, and holds those that arrive before a listener is set', async () => {
    const { host, member, settle } = links();
    await settle(100);
    for (let i = 0; i < 5; i++) host.send(Uint8Array.from([i + 1, 7, 7]));
    await settle(200); // arrive while the member has no onmessage
    const got: number[] = [];
    member.onmessage = (d) => got.push(d[0]);
    await settle(10);
    expect(got).toEqual([1, 2, 3, 4, 5]);
    host.send(Uint8Array.from([6, 7, 7]));
    await settle(100);
    expect(got).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('refuses a frame above the 1 MiB cap instead of buffering it', async () => {
    const { host, member, settle } = links();
    const got: Uint8Array[] = [];
    member.onmessage = (d) => got.push(d);
    await settle(100);
    host.send(bytes(1 << 21));
    await settle(500);
    expect(got).toEqual([]);
    expect(host.open).toBe(true);
  });

  it('closes both ends when one closes, and a late onclose listener still hears of it once', async () => {
    const { host, member, settle } = links();
    await settle(100);
    host.close();
    await settle(200);
    expect(host.open).toBe(false);
    expect(member.open).toBe(false);
    let closed = 0;
    member.onclose = () => closed++;
    await settle(10);
    expect(closed).toBe(1);
  });

  it('times out a partitioned link (a vanished peer) after 10 s on a direct path, 60 s on the relay', async () => {
    for (const [kind, ms] of [['direct', 10_500], ['relay', 60_500]] as const) {
      const { host, conn, settle } = links({}, kind);
      await settle(100);
      for (const c of [conn.host.reliable, conn.host.unreliable, conn.member.reliable, conn.member.unreliable]) (c as { partition: boolean }).partition = true;
      await settle(ms - 1_500);
      expect(host.open).toBe(true);
      await settle(2_000);
      expect(host.open).toBe(false);
      expect(host.closedReason).toBe('timeout');
    }
  });

  it('carries a real session: snapshot join, ticks and commands through fragmenting links', async () => {
    const { host: hl, member: ml, settle } = links({ bandwidth: 2_000_000 });
    const world = createWorld(5, 96); // the largest world: the biggest snapshot there is
    const hostSession = new HostSession(world, 'hosty');
    await settle(100);
    const peer = new PeerSession('ann', ml);
    hostSession.addPeer('ann', hl);
    await settle(1_000);
    expect(peer.ready).toBe(true);
    for (let i = 0; i < 3; i++) {
      hostSession.step();
      await settle(100);
    }
    const m = Math.floor(world.size / 2);
    peer.send({ type: 'place', kind: 'road', x: m + 2, z: m });
    for (let i = 0; i < 3; i++) {
      hostSession.step();
      await settle(100);
    }
    expect(peer.view!.buildings.some((b) => b.x === m + 2 && b.z === m)).toBe(true);
    expect(peer.view!.tick).toBe(world.tick);
  });
});

describe('identity', () => {
  it('re-keys the offline player to the account: seat, money and owned workers', () => {
    const w = createWorld(5, 24);
    stepWorld(w, 0, [{ type: 'join', playerId: LOCAL_PLAYER_ID }]);
    w.players[LOCAL_PLAYER_ID].money = 777;
    w.workers.push(newFarmhand(90, LOCAL_PLAYER_ID, { x: 1, z: 1 }, { x: 1, z: 1 }, 0, 100));
    rekeyPlayer(w, LOCAL_PLAYER_ID, 'acct-1');
    expect(Object.keys(w.players)).toEqual(['acct-1']);
    expect(w.players['acct-1']).toMatchObject({ id: 'acct-1', money: 777 });
    expect(w.workers[0].ownerId).toBe('acct-1');
  });

  it('lets an existing seat of the account win over the placeholder (a world this account hosted before)', () => {
    const w = createWorld(5, 24);
    stepWorld(w, 0, [{ type: 'join', playerId: 'acct-1' }, { type: 'join', playerId: LOCAL_PLAYER_ID }]);
    w.players['acct-1'].money = 5;
    w.players[LOCAL_PLAYER_ID].money = 999;
    rekeyPlayer(w, LOCAL_PLAYER_ID, 'acct-1');
    expect(Object.keys(w.players)).toEqual(['acct-1']);
    expect(w.players['acct-1'].money).toBe(5);
  });

  it('does nothing for a world without the placeholder or when the ids match', () => {
    const w = createWorld(5, 24);
    stepWorld(w, 0, [{ type: 'join', playerId: 'acct-1' }]);
    const before = JSON.stringify(w);
    rekeyPlayer(w, LOCAL_PLAYER_ID, 'acct-1');
    rekeyPlayer(w, 'acct-1', 'acct-1');
    expect(JSON.stringify(w)).toBe(before);
  });
});

describe('the command schema covers every command the world has', () => {
  const m = 12;
  const samples = [
    { type: 'move', x: 1.5, z: 2 },
    { type: 'place', kind: 'cottage', x: m, z: m, rot: 1 },
    { type: 'remove', x: m, z: m },
    { type: 'plant', crop: 'wheat', x: m, z: m },
    { type: 'harvest', x: m, z: m },
    { type: 'cook', recipe: 'bread' },
    { type: 'sell', item: 'wheat', qty: 3 },
    { type: 'forage', x: m, z: m },
    { type: 'serve', npcId: 4 },
    { type: 'collect', x: m, z: m },
    { type: 'hire', x: m, z: m },
    { type: 'fire', workerId: 9 },
    { type: 'buySkin', skin: 'citizen' },
    { type: 'setSkin', skin: 'citizen' },
  ];

  it.each(samples)('accepts a peer\'s $type command', (cmd) => {
    // `crop`, `item` and `skin` ids are checked against the catalogs, so a stale sample would fail here first.
    const r = localCommandSchema.safeParse(cmd);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(peerMessageSchema.safeParse({ t: 'cmd', seq: 0, cmd }).success).toBe(true);
  });

  it.each(samples)('rejects a $type command that smuggles in a player id or an extra field', (cmd) => {
    expect(localCommandSchema.safeParse({ ...cmd, playerId: 'someone-else' }).success).toBe(false);
    expect(localCommandSchema.safeParse({ ...cmd, extra: 1 }).success).toBe(false);
  });

  it('rejects a forged join and out-of-range coordinates', () => {
    expect(localCommandSchema.safeParse({ type: 'join' }).success).toBe(true); // parses; the host refuses it from a peer
    expect(localCommandSchema.safeParse({ type: 'hire', x: -1, z: 0 }).success).toBe(false);
    expect(localCommandSchema.safeParse({ type: 'forage', x: 1e9, z: 0 }).success).toBe(false);
    expect(localCommandSchema.safeParse({ type: 'serve', npcId: 1.5 }).success).toBe(false);
  });
});

describe('signalPayload', () => {
  it('turns a DirectConnection signal into the hub payload, and drops what cannot travel', () => {
    expect(signalPayload({ description: { type: 'offer', sdp: 'v=0' } }, 'peerpeerpeer')).toEqual({
      to: 'peerpeerpeer',
      description: { type: 'offer', sdp: 'v=0' },
    });
    expect(signalPayload({ candidate: { candidate: 'candidate:1', sdpMid: 0 as unknown as string, sdpMLineIndex: -1 } })).toEqual({
      candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: null },
    });
    expect(signalPayload({ candidate: null })).toBeNull(); // the hub has no end-of-candidates event
    expect(signalPayload({ description: { type: 'offer', sdp: 'x'.repeat(20_000) } })).toBeNull();
    expect(signalPayload({ candidate: { candidate: 'x'.repeat(600) } })).toBeNull();
  });
});

describe('the store seam (MultiplayerDriver)', () => {
  function host() {
    const store = createHearthworksStore({ seed: 3, size: 24 });
    const w = store.getState().world;
    rekeyPlayer(w, LOCAL_PLAYER_ID, 'acct-1');
    return { store, session: new HostSession(w, 'acct-1') };
  }

  it('a host driver steps the world in whole 50 ms ticks, carrying leftover frame time', () => {
    const { store, session } = host();
    store.getState().attachDriver(hostDriver(session));
    expect(store.getState().playerId).toBe('acct-1');
    const t0 = session.world.tick;
    store.getState().advance(30);
    expect(session.world.tick).toBe(t0);
    store.getState().advance(30); // 60 ms in total: one tick, 10 ms left over
    expect(session.world.tick).toBe(t0 + 1);
    store.getState().advance(40);
    expect(session.world.tick).toBe(t0 + 2);
  });

  it('a hidden tab\'s backlog is dropped, not run as a burst', () => {
    const { store, session } = host();
    store.getState().attachDriver(hostDriver(session));
    const t0 = session.world.tick;
    store.getState().advance(60_000);
    expect(session.world.tick - t0).toBeLessThanOrEqual(6);
    store.getState().advance(TICK_MS);
    expect(session.world.tick - t0).toBeLessThanOrEqual(7);
  });

  it('routes commands to the host session (ordered into the next tick) instead of the local queue', () => {
    const { store, session } = host();
    store.getState().attachDriver(hostDriver(session));
    const m = Math.floor(session.world.size / 2) + 2;
    store.getState().dispatch({ type: 'place', kind: 'cottage', x: m, z: m });
    expect(store.getState().pending).toEqual([]);
    const events = store.getState().advance(TICK_MS);
    expect(events.some((e) => e.type === 'placed')).toBe(true);
    expect(session.world.buildings.some((b) => b.x === m && b.z === m)).toBe(true);
  });

  it('a peer driver shows the predicted view at once and the offline world comes back on detach', () => {
    const store = createHearthworksStore({ seed: 3, size: 24 });
    const offline = store.getState().world;
    const hostWorld = createWorld(9, 24);
    const hostSession = new HostSession(hostWorld, 'hosty');
    // A manual link pair: deliver by hand.
    const toPeer: Uint8Array[] = [];
    const toHost: Uint8Array[] = [];
    const mk = (out: Uint8Array[]) => ({
      open: true,
      onmessage: null as ((d: Uint8Array) => void) | null,
      onclose: null as (() => void) | null,
      send: (d: Uint8Array) => void out.push(d.slice()),
      close() {},
    });
    const hl = mk(toPeer);
    const pl = mk(toHost);
    const peer = new PeerSession('ann', pl as never);
    hostSession.addPeer('ann', hl as never);
    const pump = () => {
      while (toPeer.length || toHost.length) {
        for (const m of toPeer.splice(0)) pl.onmessage?.(m);
        for (const m of toHost.splice(0)) hl.onmessage?.(m);
      }
    };
    pump();
    hostSession.step();
    pump();

    store.getState().attachDriver(peerDriver(peer), { stash: true });
    expect(store.getState().playerId).toBe('ann');
    expect(store.getState().world).not.toBe(offline);
    const m = Math.floor(hostWorld.size / 2) + 2;
    store.getState().dispatch({ type: 'place', kind: 'cottage', x: m, z: m });
    // predicted: visible before the host has ticked
    expect(store.getState().world.buildings.some((b) => b.x === m && b.z === m)).toBe(true);
    expect(hostWorld.buildings.some((b) => b.x === m && b.z === m)).toBe(false);
    pump(); // the command reaches the host...
    hostSession.step(); // ...and is ordered into its next tick
    pump();
    store.getState().advance(16);
    expect(hostWorld.buildings.some((b) => b.x === m && b.z === m)).toBe(true);
    expect(store.getState().world.buildings.filter((b) => b.x === m && b.z === m)).toHaveLength(1);

    store.getState().detachDriver();
    expect(store.getState().world).toBe(offline);
    expect(store.getState().playerId).toBe('local');
    expect(store.getState().driver).toBeNull();
    // Back to playing alone: commands queue locally again.
    store.getState().dispatch({ type: 'remove', x: 1, z: 1 });
    expect(store.getState().pending).toHaveLength(1);
  });

  it('keeps the offline world stashed across a host promotion (peer driver → host driver)', () => {
    const store = createHearthworksStore({ seed: 3, size: 24 });
    const offline = store.getState().world;
    const hostWorld = createWorld(9, 24);
    const hs = new HostSession(hostWorld, 'ann');
    const noLink = { open: false, send() {}, onmessage: null, onclose: null, close() {} };
    store.getState().attachDriver(peerDriver(new PeerSession('ann', noLink as never)), { stash: true });
    store.getState().attachDriver(hostDriver(hs));
    expect(store.getState().stash?.world).toBe(offline);
    store.getState().detachDriver();
    expect(store.getState().world).toBe(offline);
  });
});

