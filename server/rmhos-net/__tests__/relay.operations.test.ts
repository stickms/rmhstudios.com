// Operator controls on a live hub: the deny-list, the session cap, the scan brake, the client
// address in the session log, and the global byte budget.
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { Duplex } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { createDenyList } from '../deny';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';
import { createRelayServer, type Resolver } from '../relay';
import { CLOSE_REASON, decodePacket } from '../wisp';

const SECRET = 'operations-test-secret-0123456789';
const resolve: Resolver = async (host) => [
  { address: host === 'b.test' ? '93.184.216.35' : '93.184.216.34', family: 4 },
];
const servers: http.Server[] = [];
const clients: WebSocket[] = [];
afterAll(async () => {
  clients.forEach((w) => w.terminate());
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

function stuck(): net.Socket {
  const d = new Duplex({ read() {}, write() {} });
  (d as unknown as { setTimeout: () => Duplex }).setTimeout = () => d;
  return d as unknown as net.Socket;
}

function start(env: Record<string, string>, over: Partial<Parameters<typeof createRelayServer>[0]> = {}) {
  const policy = loadPolicy({
    RMHOS_NET_BYTES_PER_SECOND: String(100 * 1024 * 1024),
    RMHOS_NET_BYTES_PER_DAY: String(10 * 1024 ** 3),
    ...env,
  });
  const logs: Record<string, unknown>[] = [];
  const server = createRelayServer({
    secret: SECRET,
    policy,
    meter: new UsageMeter(policy),
    resolve,
    connect: (() => stuck()) as unknown as typeof net.connect,
    log: (l) => logs.push(l as Record<string, unknown>),
    ...over,
  });
  servers.push(server);
  return new Promise<{ port: number; logs: Record<string, unknown>[]; server: ReturnType<typeof createRelayServer> }>(
    (res) =>
      server.listen(0, '127.0.0.1', () =>
        res({ port: (server.address() as AddressInfo).port, logs, server }),
      ),
  );
}

class Client {
  readonly ws: WebSocket;
  readonly packets: NonNullable<ReturnType<typeof decodePacket>>[] = [];
  closeCode: number | null = null;
  constructor(port: number, user: string, headers: Record<string, string> = {}) {
    const t = encodeURIComponent(signNetTicket(user, SECRET));
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/rmhos-net/?ticket=${t}`, { headers });
    clients.push(this.ws);
    this.ws.on('message', (d: Buffer) => {
      const p = decodePacket(new Uint8Array(d.buffer, d.byteOffset, d.length));
      if (p) this.packets.push(p);
    });
    this.ws.on('close', (c) => (this.closeCode = c));
  }
  opened() {
    return new Promise<void>((r, j) => {
      this.ws.once('open', () => r());
      this.ws.once('error', j);
      this.ws.once('unexpected-response', (_q, res) => j(new Error(`status ${res.statusCode}`)));
    });
  }
  async until<T>(pick: () => T | undefined, ms = 4000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = pick();
      if (v !== undefined) return v;
      if (Date.now() > end) throw new Error('timed out waiting');
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  closed() {
    return this.until(() => (this.closeCode === null ? undefined : this.closeCode));
  }
  connect(id: number, host: string, port: number) {
    const h = Buffer.from(host);
    const b = Buffer.alloc(8 + h.length);
    b[0] = 1;
    b.writeUInt32LE(id, 1);
    b[5] = 1;
    b.writeUInt16LE(port, 6);
    h.copy(b, 8);
    this.ws.send(b);
  }
  reasonFor(id: number) {
    return this.until(() => {
      const p = this.packets.find((x) => x.type === 'close' && x.streamId === id);
      return p && p.type === 'close' ? p.reason : undefined;
    });
  }
}

describe('deny-list', () => {
  it('refuses a denied user with 403 and closes a live session with 4003 when the file changes', async () => {
    let file = '';
    const env = { RMHOS_NET_DENY_USERS: 'bad-env', RMHOS_NET_DENY_FILE: '/x/deny' };
    const deny = createDenyList(env, () => file);
    const { port, server } = await start({}, { deny });
    await expect(new Client(port, 'bad-env').opened()).rejects.toThrow('status 403');
    const live = new Client(port, 'soon-bad');
    await live.opened();
    expect(deny.has('soon-bad')).toBe(false);
    file = '# cut off\nsoon-bad\n';
    expect(deny.reload()).toEqual(['soon-bad']);
    server.enforceDeny();
    expect(await live.closed()).toBe(4003);
    // and a fresh ticket for the same user is refused
    await expect(new Client(port, 'soon-bad').opened()).rejects.toThrow('status 403');
    // another user is untouched
    await new Client(port, 'fine').opened();
  });

  it('keeps the last list when the file cannot be read, and reads the env list at start', () => {
    let fail = false;
    const deny = createDenyList(
      { RMHOS_NET_DENY_USERS: 'a, b', RMHOS_NET_DENY_FILE: '/x' },
      () => {
        if (fail) throw new Error('ENOENT');
        return 'c,d\ne';
      },
    );
    expect([...'abcde'].every((u) => deny.has(u))).toBe(true);
    fail = true;
    expect(deny.reload()).toEqual([]);
    expect(deny.has('c')).toBe(true);
    expect(createDenyList({}).size).toBe(0);
  });
});

describe('session cap', () => {
  it('closes the next session with 4009, lets a replacement through, and the status says full', async () => {
    const { port, logs } = await start({ RMHOS_NET_MAX_SESSIONS: '2' });
    const a = new Client(port, 'cap-a');
    const b = new Client(port, 'cap-b');
    await a.opened();
    await b.opened();
    await a.until(() => a.packets[0]);
    await b.until(() => b.packets[0]);
    const c = new Client(port, 'cap-c');
    await c.opened();
    expect(await c.closed()).toBe(4009);
    expect(logs.find((l) => l.state === 'refused')).toMatchObject({ userId: 'cap-c', reason: 'full' });
    const ticket = encodeURIComponent(signNetTicket('cap-c', SECRET));
    const st = await (await fetch(`http://127.0.0.1:${port}/rmhos-net/status?ticket=${ticket}`)).json();
    expect(st).toMatchObject({ connected: false, full: true });
    // an existing user reconnecting takes their own slot
    const a2 = new Client(port, 'cap-a');
    await a2.opened();
    expect(await a.closed()).toBe(4000);
    expect(a2.closeCode).toBeNull();
  });
});

describe('scan brake', () => {
  it('throttles new distinct destinations past the cap but not repeats of known ones', async () => {
    const { port } = await start({ RMHOS_NET_MAX_DESTINATIONS_PER_10MIN: '2' });
    const c = new Client(port, 'scanner');
    await c.opened();
    c.connect(1, 'public.test', 80);
    c.connect(2, 'public.test', 81);
    c.connect(3, 'public.test', 82);
    expect(await c.reasonFor(3)).toBe(CLOSE_REASON.throttled);
    // a repeat of an already-open destination is not a new one
    c.connect(4, 'public.test', 80);
    c.connect(5, 'b.test', 80);
    expect(await c.reasonFor(5)).toBe(CLOSE_REASON.throttled);
    expect(c.packets.find((p) => p.type === 'close' && p.streamId === 4)).toBeUndefined();
  });

  it('lets the window slide', async () => {
    const clock = { t: Date.now() };
    const { port } = await start({ RMHOS_NET_MAX_DESTINATIONS_PER_10MIN: '1' }, { now: () => clock.t });
    const c = new Client(port, 'slider');
    await c.opened();
    c.connect(1, 'public.test', 80);
    c.connect(2, 'public.test', 81);
    expect(await c.reasonFor(2)).toBe(CLOSE_REASON.throttled);
    clock.t += 10 * 60 * 1000 + 1;
    c.connect(3, 'public.test', 82);
    await new Promise((r) => setTimeout(r, 150));
    expect(c.packets.find((p) => p.type === 'close' && p.streamId === 3)).toBeUndefined();
  });
});

describe('port policy', () => {
  it('with an allow-list only those ports pass and the deny-list is ignored', async () => {
    const { port } = await start({ RMHOS_NET_ALLOWED_PORTS: '80,443', RMHOS_NET_DENIED_PORTS: '80' });
    const c = new Client(port, 'ports');
    await c.opened();
    c.connect(1, 'public.test', 22);
    expect(await c.reasonFor(1)).toBe(CLOSE_REASON.blocked);
    c.connect(2, 'public.test', 80);
    c.connect(3, 'public.test', 443);
    await new Promise((r) => setTimeout(r, 150));
    expect(c.packets.find((p) => p.type === 'close' && (p.streamId === 2 || p.streamId === 3))).toBeUndefined();
  });
});

describe('session log', () => {
  it('records the client address: CF-Connecting-IP, then X-Forwarded-For first hop, then the socket', async () => {
    const { port, logs } = await start({});
    const cf = new Client(port, 'ip-cf', { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' });
    const xff = new Client(port, 'ip-xff', { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' });
    const raw = new Client(port, 'ip-raw');
    for (const c of [cf, xff, raw]) await c.opened();
    const ip = (u: string) => logs.find((l) => l.evt === 'rmhos-net.session' && l.userId === u && l.state === 'open')?.ip;
    await cf.until(() => ip('ip-cf'));
    expect(ip('ip-cf')).toBe('203.0.113.7');
    expect(ip('ip-xff')).toBe('198.51.100.9');
    expect(ip('ip-raw')).toMatch(/127\.0\.0\.1/);
    cf.ws.close();
    await cf.closed();
    expect(logs.find((l) => l.state === 'closed' && l.userId === 'ip-cf')).toMatchObject({ ip: '203.0.113.7' });
  });
});

describe('global byte budget', () => {
  it('shares one daily budget across users and refuses new CONNECTs once it is spent', async () => {
    const policy = loadPolicy({ RMHOS_NET_GLOBAL_BYTES_PER_DAY: '1000' });
    const meter = new UsageMeter(policy);
    meter.consume('u1', 600);
    expect(meter.dayExhausted('u2')).toBe(false);
    expect(meter.allowance('u2')).toBe(400);
    meter.consume('u2', 400);
    expect(meter.dayExhausted('u3')).toBe(true);
    const { port } = await start({ RMHOS_NET_GLOBAL_BYTES_PER_DAY: '1000' }, { meter });
    const c = new Client(port, 'late');
    await c.opened();
    c.connect(1, 'public.test', 443);
    expect(await c.reasonFor(1)).toBe(CLOSE_REASON.throttled);
  });

  it('shares one token bucket: two users together cannot exceed it', () => {
    let now = 0;
    const policy = loadPolicy({ RMHOS_NET_GLOBAL_BYTES_PER_SECOND: '1000' });
    const m = new UsageMeter(policy, () => now);
    m.consume('a', 800);
    expect(m.allowance('b')).toBe(200);
    now = 500;
    expect(m.allowance('b')).toBe(700);
  });
});
