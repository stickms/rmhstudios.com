import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';
import { createRelayServer, type Resolver } from '../relay';
import { CLOSE_REASON, decodePacket, encodeClose, encodeData } from '../wisp';

const SECRET = 'test-secret-for-the-relay';
const PUBLIC_IP = '93.184.216.34';

const resolve: Resolver = async (host) => {
  if (host === 'public.test')
    return [
      {
        address: PUBLIC_IP,
        family: 4,
      },
    ];
  if (host === 'internal.test')
    return [
      {
        address: '10.0.0.5',
        family: 4,
      },
    ];
  throw new Error('NXDOMAIN');
};

function connectPacket(id: number, host: string, port: number): Uint8Array {
  const h = Buffer.from(host);
  const out = Buffer.alloc(8 + h.length);
  out[0] = 1;
  out.writeUInt32LE(id, 1);
  out[5] = 1;
  out.writeUInt16LE(port, 6);
  h.copy(out, 8);
  return out;
}

class Client {
  readonly ws: WebSocket;
  readonly inbox: Buffer[] = [];
  closeCode: number | null = null;
  private waiters: (() => void)[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d: Buffer) => {
      this.inbox.push(d);
      this.waiters.splice(0).forEach((w) => w());
    });
    this.ws.on('close', (code) => {
      this.closeCode = code;
      this.waiters.splice(0).forEach((w) => w());
    });
  }

  opened(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
      this.ws.once('unexpected-response', (_q, r) => rej(new Error(`status ${r.statusCode}`)));
    });
  }

  async until<T>(pick: () => T | undefined, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = pick();
      if (v !== undefined) return v;
      if (Date.now() > end) throw new Error('timed out waiting');
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }

  /** First unread packet matching `pred`; earlier non-matching ones are skipped. */
  next(pred: (p: NonNullable<ReturnType<typeof decodePacket>>) => boolean) {
    return this.until(() => {
      for (let i = 0; i < this.inbox.length; i++) {
        const buf = this.inbox[i] as Buffer;
        const p = decodePacket(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
        if (p && pred(p)) {
          this.inbox.splice(i, 1);
          return p;
        }
      }
      return undefined;
    });
  }

  send(frame: Uint8Array): void {
    this.ws.send(frame);
  }
}

describe('relay hub', () => {
  const policy = loadPolicy({
    RMHOS_NET_BYTES_PER_SECOND: String(10 * 1024 * 1024),
    RMHOS_NET_BYTES_PER_DAY: String(1024 * 1024 * 1024),
  });
  const meter = new UsageMeter(policy);
  const logs: Record<string, unknown>[] = [];
  const connectCalls: {
    host: string;
    port: number;
  }[] = [];
  const echoClosed: Promise<void>[] = [];
  const echoSockets: net.Socket[] = [];
  let echo: net.Server;
  let hub: http.Server;
  let wsUrl: string;
  let httpUrl: string;
  const servers: http.Server[] = [];

  const connect = ((
    o: net.NetConnectOpts & {
      host: string;
      port: number;
    },
  ) => {
    connectCalls.push({
      host: o.host,
      port: o.port,
    });
    return net.connect({
      host: '127.0.0.1',
      port: (echo.address() as AddressInfo).port,
    });
  }) as unknown as typeof net.connect;

  function start(
    over: Partial<Parameters<typeof createRelayServer>[0]> = {},
  ): Promise<http.Server> {
    const s = createRelayServer({
      secret: SECRET,
      policy,
      meter,
      resolve,
      connect,
      log: (l) => logs.push(l as Record<string, unknown>),
      doh: {
        upstream: 'https://1.1.1.1/dns-query',
        corsOrigin: 'http://localhost:7005',
        fetchImpl: (async () =>
          new Response(new Uint8Array([9, 9, 9]), {
            headers: {
              'content-type': 'application/dns-message',
            },
          })) as unknown as typeof fetch,
      },
      ...over,
    });
    servers.push(s);
    return new Promise((res) => s.listen(0, '127.0.0.1', () => res(s)));
  }

  const url = (s: http.Server, ticket?: string) =>
    `ws://127.0.0.1:${(s.address() as AddressInfo).port}/rmhos-net/${
      ticket === undefined ? '' : `?ticket=${encodeURIComponent(ticket)}`
    }`;

  async function login(user: string, s: http.Server = hub): Promise<Client> {
    const c = new Client(url(s, signNetTicket(user, SECRET)));
    await c.opened();
    await c.next((p) => p.type === 'continue' && p.streamId === 0);
    return c;
  }

  beforeAll(async () => {
    echo = net.createServer((sock) => {
      echoSockets.push(sock);
      echoClosed.push(new Promise((r) => sock.on('close', () => r())));
      sock.on('data', (d) => sock.write(d));
      sock.on('error', () => {});
    });
    await new Promise<void>((r) => echo.listen(0, '127.0.0.1', () => r()));
    hub = await start();
    wsUrl = url(hub);
    httpUrl = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    echoSockets.forEach((s) => s.destroy());
    for (const s of servers) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
    await new Promise((r) => echo.close(r));
  });

  describe('upgrade', () => {
    it('refuses a missing, expired or foreign-secret ticket with 401', async () => {
      const bad = [
        undefined,
        signNetTicket('u1', SECRET, Date.now() - 120_000),
        signNetTicket('u1', 'another-secret'),
        'garbage',
      ];
      for (const t of bad) {
        await expect(new Client(url(hub, t)).opened()).rejects.toThrow('status 401');
      }
      expect(wsUrl).toContain('/rmhos-net/');
    });

    it('answers 503 when the hub is disabled', async () => {
      const off = await start({
        policy: {
          ...policy,
          enabled: false,
        },
      });
      await expect(new Client(url(off, signNetTicket('u1', SECRET))).opened()).rejects.toThrow(
        'status 503',
      );
      const h = await fetch(`http://127.0.0.1:${(off.address() as AddressInfo).port}/health`);
      expect(await h.json()).toEqual({
        ok: true,
        enabled: false,
      });
    });

    it('reports enabled on /health', async () => {
      expect(await (await fetch(`${httpUrl}/health`)).json()).toEqual({
        ok: true,
        enabled: true,
      });
    });

    it('opens with a stream-0 CONTINUE of 128', async () => {
      const c = new Client(url(hub, signNetTicket('u-first', SECRET)));
      await c.opened();
      await c.until(() => c.inbox[0]);
      expect([...(c.inbox[0] as Buffer)]).toEqual([0x03, 0, 0, 0, 0, 128, 0, 0, 0]);
      c.ws.close();
    });

    it('closes the first socket (4000) when the same user connects again', async () => {
      const first = await login('u-dup');
      const second = await login('u-dup');
      await first.until(() => (first.closeCode === null ? undefined : true));
      expect(first.closeCode).toBe(4000);
      expect(second.closeCode).toBeNull();
      second.ws.close();
    });
  });

  describe('streams', () => {
    it('echoes DATA on the same stream id and logs one line with exact byte counts', async () => {
      const c = await login('u-echo');
      c.send(connectPacket(7, 'public.test', 8080));
      c.send(encodeData(7, Buffer.from('hello')));
      const back = await c.next((p) => p.type === 'data' && p.streamId === 7);
      expect(back.type === 'data' && Buffer.from(back.payload).toString()).toBe('hello');
      expect(connectCalls.at(-1)).toEqual({
        host: PUBLIC_IP,
        port: 8080,
      });

      c.send(encodeClose(7, CLOSE_REASON.voluntary));
      const line = await c.until(() =>
        logs.find(
          (l) => l.evt === 'rmhos-net.stream' && l.userId === 'u-echo' && l.state === 'close',
        ),
      );
      expect(line).toMatchObject({
        evt: 'rmhos-net.stream',
        state: 'close',
        userId: 'u-echo',
        host: 'public.test',
        // The address actually dialled (the host was a name) and our source port on that socket.
        address: PUBLIC_IP,
        port: 8080,
        up: 5,
        down: 5,
      });
      expect(typeof (line as { localPort: unknown }).localPort).toBe('number');
      // One line at open and one at close, both carrying what an abuse report matches on.
      const lines = logs.filter((l) => l.evt === 'rmhos-net.stream' && l.userId === 'u-echo');
      expect(lines.map((l) => l.state)).toEqual(['open', 'close']);
      expect(lines[0]).toMatchObject({
        host: 'public.test',
        address: PUBLIC_IP,
        port: 8080,
        localPort: (line as { localPort: number }).localPort,
      });
      c.ws.close();
    });

    it('refuses localhost and a name that resolves privately, without connecting', async () => {
      const c = await login('u-priv');
      const before = connectCalls.length;
      c.send(connectPacket(1, 'localhost', 80));
      c.send(connectPacket(2, 'internal.test', 80));
      c.send(connectPacket(3, '127.0.0.1', 80));
      for (const id of [1, 2, 3]) {
        const p = await c.next((x) => x.type === 'close' && x.streamId === id);
        expect(p.type === 'close' && p.reason).toBe(CLOSE_REASON.blocked);
      }
      expect(connectCalls.length).toBe(before);
      c.ws.close();
    });

    it('refuses a denied port (25) with blocked', async () => {
      const c = await login('u-port');
      c.send(connectPacket(1, 'public.test', 25));
      const p = await c.next((x) => x.type === 'close' && x.streamId === 1);
      expect(p.type === 'close' && p.reason).toBe(CLOSE_REASON.blocked);
      c.ws.close();
    });

    it('throttles the 65th concurrent stream', async () => {
      const c = await login('u-many');
      for (let id = 1; id <= 64; id++) c.send(connectPacket(id, 'public.test', 443));
      c.send(connectPacket(65, 'public.test', 443));
      const p = await c.next((x) => x.type === 'close' && x.streamId === 65);
      expect(p.type === 'close' && p.reason).toBe(CLOSE_REASON.throttled);
      c.ws.close();
    });

    it('throttles a user at the daily cap', async () => {
      meter.consume('u-capped', policy.bytesPerDay);
      const c = await login('u-capped');
      c.send(connectPacket(1, 'public.test', 443));
      const p = await c.next((x) => x.type === 'close' && x.streamId === 1);
      expect(p.type === 'close' && p.reason).toBe(CLOSE_REASON.throttled);
      c.ws.close();
    });

    it('closes every stream as throttled when the day runs out mid-transfer', async () => {
      const small = new UsageMeter({
        ...policy,
        bytesPerDay: 20,
      });
      const s = await start({
        meter: small,
      });
      const c = await login('u-mid', s);
      c.send(connectPacket(1, 'public.test', 443));
      c.send(encodeData(1, Buffer.alloc(30, 1)));
      const p = await c.next((x) => x.type === 'close' && x.streamId === 1);
      expect(p.type === 'close' && p.reason).toBe(CLOSE_REASON.throttled);
      c.ws.close();
    });

    it('paces traffic by the per-second allowance instead of dropping it', async () => {
      const slow = new UsageMeter({
        ...policy,
        bytesPerSecond: 40,
      });
      const s = await start({
        meter: slow,
      });
      const c = await login('u-slow', s);
      c.send(connectPacket(1, 'public.test', 443));
      c.send(encodeData(1, Buffer.alloc(60, 2)));
      let got = 0;
      while (got < 60) {
        const p = await c.next((x) => x.type === 'data' && x.streamId === 1);
        got += p.type === 'data' ? p.payload.length : 0;
      }
      expect(got).toBe(60);
      c.ws.close();
    }, 15_000);

    it('destroys the upstream socket when the WebSocket closes', async () => {
      const c = await login('u-drop');
      const seen = echoClosed.length;
      c.send(connectPacket(1, 'public.test', 443));
      c.send(encodeData(1, Buffer.from('x')));
      await c.next((p) => p.type === 'data' && p.streamId === 1);
      expect(echoClosed.length).toBe(seen + 1);
      c.ws.close();
      await Promise.race([
        echoClosed[seen],
        new Promise((_, rej) => setTimeout(() => rej(new Error('upstream not closed')), 3000)),
      ]);
    });

    it('ignores malformed packets and keeps the session usable', async () => {
      const c = await login('u-junk');
      c.send(Buffer.from([0x09, 1, 2]));
      c.send(Buffer.from([0x01, 1, 0, 0, 0, 1]));
      c.send(connectPacket(1, 'public.test', 443));
      c.send(encodeData(1, Buffer.from('ok')));
      await c.next((p) => p.type === 'data' && p.streamId === 1);
      c.ws.close();
    });
  });

  describe('dns-query', () => {
    const q = (path: string, init: RequestInit) =>
      fetch(`${httpUrl}/rmhos-net/dns-query${path}`, init);
    const ticket = () => `?ticket=${encodeURIComponent(signNetTicket('u-dns', SECRET))}`;
    const dns = {
      'content-type': 'application/dns-message',
    };

    it('needs a ticket', async () => {
      expect(
        (
          await q('', {
            method: 'POST',
            headers: dns,
            body: Buffer.alloc(12),
          })
        ).status,
      ).toBe(401);
    });

    it('rejects a body over 4096 bytes', async () => {
      const res = await q(ticket(), {
        method: 'POST',
        headers: dns,
        body: Buffer.alloc(5000),
      });
      expect(res.status).toBe(413);
    });

    it('rejects other content types', async () => {
      const res = await q(ticket(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(res.status).toBe(415);
    });

    it('returns the upstream body as application/dns-message', async () => {
      const res = await q(ticket(), {
        method: 'POST',
        headers: dns,
        body: Buffer.alloc(12),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/dns-message');
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:7005');
      expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([9, 9, 9]);
    });

    it('answers the CORS preflight', async () => {
      const res = await q('', {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:7005');
    });

    it('refuses an upstream that is not a public address', async () => {
      const s = await start({
        doh: {
          upstream: 'https://10.1.2.3/dns-query',
          corsOrigin: '',
        },
      });
      const res = await fetch(
        `http://127.0.0.1:${(s.address() as AddressInfo).port}/rmhos-net/dns-query${ticket()}`,
        {
          method: 'POST',
          headers: dns,
          body: Buffer.alloc(12),
        },
      );
      expect(res.status).toBe(502);
    });
  });
});
