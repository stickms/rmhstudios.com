// Memory bounds: what one connection and the whole process can hold, against peers that never read.
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { Duplex } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';
import { createRelayServer } from '../relay';
import { encodeData } from '../wisp';

const SECRET = 'memory-test-secret';
const policy = loadPolicy({
  RMHOS_NET_BYTES_PER_SECOND: String(1024 * 1024 * 1024),
  RMHOS_NET_BYTES_PER_DAY: String(100 * 1024 ** 3),
});
const UPSTREAM_MARK = 64 * 1024;
const FRAME = 64 * 1024; // the largest DATA payload the hub accepts

/** An upstream that never reads: nothing it is given is ever flushed. */
function stalledPeers() {
  const sockets: Duplex[] = [];
  const connect = (() => {
    const d = new Duplex({ read() {}, write() {} });
    (d as unknown as { setTimeout: () => Duplex }).setTimeout = () => d;
    sockets.push(d);
    return d;
  }) as unknown as typeof net.connect;
  return { sockets, connect };
}

const servers: http.Server[] = [];
const clients: WebSocket[] = [];
afterAll(async () => {
  for (const w of clients) w.terminate();
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

function start(over: Partial<Parameters<typeof createRelayServer>[0]>) {
  const s = createRelayServer({
    secret: SECRET,
    policy,
    meter: new UsageMeter(policy),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    ...over,
  });
  servers.push(s);
  return new Promise<number>((res) =>
    s.listen(0, '127.0.0.1', () => res((s.address() as AddressInfo).port)),
  );
}

async function login(port: number, user: string) {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/rmhos-net/?ticket=${encodeURIComponent(signNetTicket(user, SECRET))}`,
  );
  clients.push(ws);
  let code: number | null = null;
  ws.on('close', (c) => (code = c));
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  return { ws, code: () => code };
}

function connectFrame(id: number): Uint8Array {
  const h = Buffer.from('93.184.216.34');
  const b = Buffer.alloc(8 + h.length);
  b[0] = 1;
  b.writeUInt32LE(id, 1);
  b[5] = 1;
  b.writeUInt16LE(443, 6);
  h.copy(b, 8);
  return b;
}

const until = async (pick: () => boolean, ms = 6000) => {
  const end = Date.now() + ms;
  while (!pick()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('upstream socket buffers', () => {
  it('never hold more than the 64 KiB mark, with maximum-size frames to many stalled peers', async () => {
    const { sockets, connect } = stalledPeers();
    const port = await start({ connect });
    const c = await login(port, 'mem-1');
    const streams = 24;
    for (let id = 1; id <= streams; id++) c.ws.send(connectFrame(id));
    await until(() => sockets.length === streams);
    // 12 frames of 64 KiB per stream = 768 KiB each, under the per-stream cap, 18 MiB in all.
    // The per-connection cap (8 MiB) closes the connection part-way; whatever happens, no socket
    // may ever have held more than the mark.
    let peak = 0;
    const watcher = setInterval(() => {
      for (const s of sockets) peak = Math.max(peak, s.writableLength);
    }, 1);
    for (let i = 0; i < 12; i++) {
      for (let id = 1; id <= streams; id++) {
        if (c.ws.readyState === WebSocket.OPEN) c.ws.send(encodeData(id, Buffer.alloc(FRAME, 7)));
      }
    }
    await until(() => c.code() !== null, 8000);
    clearInterval(watcher);
    expect(peak).toBeGreaterThan(0);
    // One write is capped to the room left: the buffer is at the mark at most (the stub's first
    // chunk may sit in its internal slot, hence the small constant).
    expect(peak).toBeLessThanOrEqual(UPSTREAM_MARK + 1024);
    // The bound for the whole connection that follows: 8 MiB accounted queue + 64 streams x
    // 64 KiB upstream buffers = 12 MiB held for guest-to-remote data.
    const held = sockets.reduce((n, s) => n + s.writableLength, 0);
    expect(held).toBeLessThanOrEqual(64 * UPSTREAM_MARK);
  }, 20_000);

  it('refuses a frame larger than the accepted maximum (close 1009)', async () => {
    const { connect } = stalledPeers();
    const port = await start({ connect });
    const c = await login(port, 'mem-2');
    c.ws.send(connectFrame(1));
    c.ws.send(encodeData(1, Buffer.alloc(1024 * 1024, 1)));
    await until(() => c.code() !== null);
    expect(c.code()).toBe(1009);
  });
});

describe('the process-wide backstop', () => {
  it('sheds the connection holding the most when all connections together pass the cap', async () => {
    const { sockets, connect } = stalledPeers();
    const port = await start({ connect, maxTotalBuffered: 2.5 * 1024 * 1024 });
    const heavy = await login(port, 'mem-heavy');
    const light = await login(port, 'mem-light');
    for (let id = 1; id <= 2; id++) heavy.ws.send(connectFrame(id));
    light.ws.send(connectFrame(1));
    await until(() => sockets.length === 3);
    // heavy: two streams x ~0.9 MiB queued (~1.8 MiB queued); light: one stream ~0.5 MiB.
    const send = (c: { ws: WebSocket }, id: number, frames: number) => {
      for (let i = 0; i < frames; i++) c.ws.send(encodeData(id, Buffer.alloc(FRAME, 3)));
    };
    send(heavy, 1, 15);
    send(heavy, 2, 15);
    send(light, 1, 8);
    await new Promise((r) => setTimeout(r, 300));
    expect(heavy.code()).toBeNull();
    expect(light.code()).toBeNull();
    // light adds more, pushing the total over 3 MiB: the heaviest (heavy) is closed, light stays.
    send(light, 1, 6);
    await until(() => heavy.code() !== null);
    expect(heavy.code()).toBe(4008);
    await new Promise((r) => setTimeout(r, 200));
    expect(light.code()).toBeNull();
    light.ws.close();
  }, 20_000);
});
