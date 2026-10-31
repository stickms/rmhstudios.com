/**
 * `ReliableLink` (lib/shared/p2p/reliable-link.ts) over the in-memory channel
 * pair on a fake clock: delivery and ordering (fragmented messages too),
 * queueing before open, keepalive and RTT, the 10 s timeout under a
 * partition, backpressure at the high/low water marks, congestion and
 * protocol cut-offs, and the relay stand-in channels.
 */

import { describe, expect, it } from 'vitest';
import { FakeNet, fakeConnection, type PathConfig } from '../fake-channel.test-support';
import {
  LINK_TIMEOUT_MS,
  RELIABLE_HIGH_WATER,
  RELIABLE_QUEUE_MAX,
  ReliableLink,
  type ReliableLinkCloseReason,
} from '../reliable-link';
import { decodeControl, RELIABLE_MESSAGE_MAX_BYTES } from '../wire';
import { decodeRelay } from '../relay';
import { relayPair } from '../webrtc';

function pair(path: PathConfig, opts: { openMs?: number; timeoutMs?: number } = {}) {
  const net = new FakeNet();
  const conn = fakeConnection(net, path, opts.openMs ?? 50);
  const got = { host: [] as Uint8Array[], member: [] as Uint8Array[] };
  const closed: { host: ReliableLinkCloseReason | null; member: ReliableLinkCloseReason | null } = { host: null, member: null };
  const opened = { host: 0, member: 0 };
  const make = (side: 'host' | 'member') =>
    new ReliableLink({
      unreliable: conn[side].unreliable,
      reliable: conn[side].reliable,
      now: () => net.now,
      timeoutMs: opts.timeoutMs,
      onMessage: (m) => got[side].push(m.slice()),
      onOpen: () => opened[side]++,
      onClose: (r) => (closed[side] = r),
    });
  const host = make('host');
  const member = make('member');
  /** Advance the clock in 50 ms steps, updating both links like an owner's timer. */
  const run = async (ms: number) => {
    const end = net.now + ms;
    while (net.now < end) {
      net.advance(Math.min(end, net.now + 50));
      host.update();
      member.update();
      await Promise.resolve();
    }
  };
  return { net, conn, host, member, got, closed, opened, run };
}

const text = (s: string) => new TextEncoder().encode(s);

describe('ReliableLink', () => {
  it('opens once, delivers in order both ways, and queues what was sent before open', async () => {
    const t = pair({ latencyMs: 20, jitterMs: 5, loss: 0.2, seed: 3 });
    expect(t.host.send(text('early'))).toBe(true);
    await t.run(100);
    expect(t.opened).toEqual({ host: 1, member: 1 });
    for (let i = 0; i < 50; i++) t.host.send(text(`h${i}`));
    for (let i = 0; i < 50; i++) t.member.sendControl({ i });
    await t.run(2_000);
    expect(t.got.member.map((m) => new TextDecoder().decode(m))).toEqual(['early', ...Array.from({ length: 50 }, (_, i) => `h${i}`)]);
    expect(t.got.host.map((m) => decodeControl(m))).toEqual(Array.from({ length: 50 }, (_, i) => ({ i })));
    expect(t.host.stats.receivedMessages).toBe(50);
    expect(t.member.stats.sentMessages).toBe(50);
    expect(t.closed).toEqual({ host: null, member: null });
  });

  it('fragments and reassembles large messages; refuses empty and oversize ones', async () => {
    const t = pair({ latencyMs: 10 });
    await t.run(100);
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    expect(t.host.send(big)).toBe(true);
    expect(t.host.send(new Uint8Array(0))).toBe(false);
    expect(t.host.send(new Uint8Array(RELIABLE_MESSAGE_MAX_BYTES + 1))).toBe(false);
    await t.run(1_000);
    expect(t.got.member).toHaveLength(1);
    expect(t.got.member[0]).toEqual(big);
  });

  it('measures RTT from pings and stays open while traffic flows', async () => {
    const t = pair({ latencyMs: 40 });
    await t.run(5_000);
    expect(t.host.stats.rttMs).toBeGreaterThanOrEqual(80);
    expect(t.host.stats.rttMs).toBeLessThan(140);
    expect(t.host.stats.loss).toBe(0);
    expect(t.host.silentForMs()).toBeLessThan(1_100);
    await t.run(30_000);
    expect(t.closed).toEqual({ host: null, member: null });
  });

  it('times out after 10 s of silence when the network partitions (and reports silence first)', async () => {
    const t = pair({ latencyMs: 20 });
    await t.run(1_000);
    for (const c of [t.conn.host.unreliable, t.conn.host.reliable, t.conn.member.unreliable, t.conn.member.reliable]) c.partition = true;
    await t.run(5_500);
    expect(t.host.silentForMs()).toBeGreaterThanOrEqual(5_000);
    expect(t.host.isOpen).toBe(true);
    await t.run(LINK_TIMEOUT_MS);
    expect(t.closed).toEqual({ host: 'timeout', member: 'timeout' });
    expect(t.host.send(text('x'))).toBe(false);
  });

  it('counts loss of unanswered pings', async () => {
    const t = pair({ latencyMs: 20, loss: 0.5, seed: 11 });
    await t.run(20_000);
    expect(t.host.stats.loss).toBeGreaterThan(0.2);
    expect(t.host.isOpen).toBe(true);
  });

  it('applies backpressure: holds frames in the link above the high water mark and drains them', async () => {
    // 64 KB/s: a 1 MB burst cannot all sit in the channel.
    const t = pair({ latencyMs: 10, bandwidth: 64 * 1024 });
    await t.run(100);
    for (let i = 0; i < 64; i++) t.host.send(new Uint8Array(16_000).fill(i));
    expect(t.conn.host.reliable.bufferedAmount).toBeLessThanOrEqual(RELIABLE_HIGH_WATER + 16_001);
    expect(t.host.stats.queuedBytes).toBeGreaterThan(0);
    await t.run(20_000);
    expect(t.host.stats.queuedBytes).toBe(0);
    expect(t.got.member).toHaveLength(64);
    expect(t.got.member.map((m) => m[0])).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });

  it('cuts a congested peer off past the queue cap', async () => {
    const t = pair({ latencyMs: 10, bandwidth: 8 * 1024 });
    await t.run(100);
    const chunk = new Uint8Array(512 * 1024);
    let refused = false;
    for (let i = 0; i < (RELIABLE_QUEUE_MAX / chunk.byteLength) * 2 && !refused; i++) refused = !t.host.send(chunk);
    expect(refused).toBe(true);
    expect(t.closed.host).toBe('congested');
    expect(t.host.stats.queuedBytes).toBe(0);
  });

  it('closes on a reliable-channel protocol violation, and on the other side closing', async () => {
    const t = pair({ latencyMs: 10 });
    await t.run(100);
    t.conn.member.reliable.send(new Uint8Array([0x99, 0, 0]));
    await t.run(100);
    expect(t.closed.host).toBe('protocol');
    expect(['closed', 'timeout']).toContain(t.closed.member ?? 'closed');

    const u = pair({ latencyMs: 10 });
    await u.run(100);
    u.member.close();
    await u.run(200);
    expect(u.closed).toEqual({ host: 'closed', member: 'local' });
  });

  it('ignores anything but ping/pong on the unreliable channel', async () => {
    const t = pair({ latencyMs: 10 });
    await t.run(100);
    t.conn.member.unreliable.send(new Uint8Array([0x01, 2, 3]));
    await t.run(100);
    expect(t.got.host).toEqual([]);
    expect(t.host.isOpen).toBe(true);
  });
});

describe('relay channels', () => {
  it('frame sends with the slot and flag, refuse sends before open, deliver only while open', () => {
    const sent: Array<[Uint8Array, boolean]> = [];
    const p = relayPair(9, (packet, reliable) => {
      sent.push([packet, reliable]);
      return true;
    });
    expect(() => p.reliable.send(new Uint8Array([1]))).toThrow();
    const seen: Uint8Array[] = [];
    p.reliable.onmessage = (m) => seen.push(m);
    p.deliver(true, new Uint8Array([5]));
    expect(seen).toEqual([]);
    p.reliable.open();
    p.unreliable.open();
    p.reliable.send(new Uint8Array([1, 2]));
    p.unreliable.send(new Uint8Array([3]));
    expect(sent.map(([b, r]) => [decodeRelay(b), r])).toEqual([
      [{ slot: 9, reliable: true, payload: new Uint8Array([1, 2]) }, true],
      [{ slot: 9, reliable: false, payload: new Uint8Array([3]) }, false],
    ]);
    p.deliver(true, new Uint8Array([5]));
    expect(seen).toEqual([new Uint8Array([5])]);
    let closes = 0;
    p.reliable.onclose = () => closes++;
    p.close();
    p.close();
    expect(closes).toBe(1);
  });

  it('carries a ReliableLink end to end', async () => {
    // Two relay pairs wired back to back stand in for host ↔ hub ↔ member.
    const box: { a?: ReturnType<typeof relayPair>; b?: ReturnType<typeof relayPair> } = {};
    const a = relayPair(3, (packet, reliable) => {
      queueMicrotask(() => box.b!.deliver(reliable, decodeRelay(packet)!.payload));
      return true;
    });
    const b = relayPair(3, (packet, reliable) => {
      queueMicrotask(() => box.a!.deliver(reliable, decodeRelay(packet)!.payload));
      return true;
    });
    box.a = a;
    box.b = b;
    let now = 0;
    const got: Uint8Array[] = [];
    const la = new ReliableLink({ ...a, now: () => now });
    new ReliableLink({ ...b, now: () => now, onMessage: (m) => got.push(m.slice()) });
    for (const ch of [a.unreliable, a.reliable, b.unreliable, b.reliable]) ch.open();
    await Promise.resolve();
    la.send(new Uint8Array(40_000).fill(7));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    now += 100;
    expect(got).toHaveLength(1);
    expect(got[0].byteLength).toBe(40_000);
  });
});
