import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';
import { createRelayServer, type Resolver } from '../relay';
import { IDLE_MS } from '../tickets';

const SECRET = 'relay-ticket-secret';
const clock = {
  t: Date.now(),
};
const policy = loadPolicy({});
const resolve: Resolver = async () => [
  {
    address: '93.184.216.34',
    family: 4,
  },
];
const servers: http.Server[] = [];

function start(over: Partial<Parameters<typeof createRelayServer>[0]> = {}): Promise<{
  port: number;
  server: http.Server;
}> {
  const server = createRelayServer({
    secret: SECRET,
    policy,
    meter: new UsageMeter(policy),
    resolve,
    now: () => clock.t,
    ...over,
    doh: {
      upstream: 'https://1.1.1.1/dns-query',
      corsOrigin: '',
      fetchImpl: (async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'content-type': 'application/dns-message',
          },
        })) as unknown as typeof fetch,
    },
  });
  servers.push(server);
  return new Promise((res) =>
    server.listen(0, '127.0.0.1', () =>
      res({
        port: (server.address() as AddressInfo).port,
        server,
      }),
    ),
  );
}

afterAll(async () => {
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

const dns = (port: number, ticket: string) =>
  fetch(`http://127.0.0.1:${port}/rmhos-net/dns-query?ticket=${encodeURIComponent(ticket)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/dns-message',
    },
    body: new Uint8Array([0, 1]),
  });
const status = (port: number, ticket: string) =>
  fetch(`http://127.0.0.1:${port}/rmhos-net/status?ticket=${encodeURIComponent(ticket)}`);

function open(
  port: number,
  ticket: string,
  wsOptions: ConstructorParameters<typeof WebSocket>[2] = {},
): Promise<{
  ws: WebSocket;
  closed: Promise<number>;
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/rmhos-net/?ticket=${encodeURIComponent(ticket)}`, wsOptions);
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
  return new Promise((res, rej) => {
    ws.once('open', () =>
      res({
        ws,
        closed,
      }),
    );
    ws.once('error', rej);
    ws.once('unexpected-response', (_q, r) => rej(new Error(`status ${r.statusCode}`)));
  });
}

describe('ticket lifecycle on the hub', () => {
  it('serves DNS and a WebSocket reconnect after the 60 s validity, because the ticket was seen', async () => {
    const { port } = await start();
    const ticket = signNetTicket('life-1', SECRET, clock.t);
    expect((await dns(port, ticket)).status).toBe(200);
    clock.t += 5 * 60_000;
    expect((await dns(port, ticket)).status).toBe(200);
    const first = await open(port, ticket);
    first.ws.close();
    await first.closed;
    clock.t += 5 * 60_000;
    const again = await open(port, ticket); // v86 reconnects with the same URL
    again.ws.close();
    await again.closed;
  });

  it('refuses a never-seen expired ticket for DNS, status and WebSocket', async () => {
    const { port } = await start();
    const ticket = signNetTicket('life-2', SECRET, clock.t);
    clock.t += 61_000;
    expect((await dns(port, ticket)).status).toBe(401);
    expect((await status(port, ticket)).status).toBe(401);
    await expect(open(port, ticket)).rejects.toThrow('401');
  });

  it('refuses after 15 idle minutes', async () => {
    const { port } = await start();
    const ticket = signNetTicket('life-3', SECRET, clock.t);
    expect((await dns(port, ticket)).status).toBe(200);
    clock.t += IDLE_MS + 1;
    expect((await dns(port, ticket)).status).toBe(401);
  });

  it("a new ticket presented over DNS closes the user's old WebSocket with 4000", async () => {
    const { port } = await start();
    const old = await open(port, signNetTicket('life-4', SECRET, clock.t));
    clock.t += 1000;
    expect((await dns(port, signNetTicket('life-4', SECRET, clock.t))).status).toBe(200);
    expect(await old.closed).toBe(4000);
  });

  it('keeps its state per server instance', async () => {
    const a = await start();
    const b = await start();
    const ticket = signNetTicket('life-5', SECRET, clock.t);
    expect((await dns(a.port, ticket)).status).toBe(200);
    clock.t += 5 * 60_000;
    expect((await dns(a.port, ticket)).status).toBe(200);
    expect((await dns(b.port, ticket)).status).toBe(401);
  });
});

describe('GET /rmhos-net/status', () => {
  it("reports connected and the stream count for the ticket's own user only", async () => {
    const { port } = await start();
    const mine = signNetTicket('st-1', SECRET, clock.t);
    const theirs = signNetTicket('st-2', SECRET, clock.t);
    const before = await status(port, mine);
    expect(before.status).toBe(200);
    expect(before.headers.get('cache-control')).toBe('no-store');
    expect(await before.json()).toEqual({
      connected: false,
      streams: 0,
      full: false,
    });
    const c = await open(port, mine);
    expect(await (await status(port, mine)).json()).toEqual({
      connected: true,
      streams: 0,
      full: false,
    });
    expect(await (await status(port, theirs)).json()).toEqual({
      connected: false,
      streams: 0,
      full: false,
    });
    c.ws.close();
    await c.closed;
    expect(await (await status(port, mine)).json()).toEqual({
      connected: false,
      streams: 0,
      full: false,
    });
  });

  it('is 401 for a forged ticket, 503 when the relay is off', async () => {
    const { port } = await start();
    expect((await status(port, 'x.1.y')).status).toBe(401);
    const off = createRelayServer({
      secret: SECRET,
      policy: {
        ...policy,
        enabled: false,
      },
      meter: new UsageMeter(policy),
    });
    servers.push(off);
    await new Promise<void>((r) => off.listen(0, '127.0.0.1', () => r()));
    const res = await status((off.address() as AddressInfo).port, signNetTicket('u', SECRET));
    expect(res.status).toBe(503);
  });
});

describe('a live socket ends with its ticket (close code 4001)', () => {
  it('closes a connected socket once its 12 h cap has passed, within one ping interval', async () => {
    const { port } = await start({
      pingMs: 40,
    });
    const c = await open(port, signNetTicket('cap-live', SECRET, clock.t));
    // Busy the whole time: pongs keep lastSeen fresh, so only the age can end it.
    for (let m = 0; m < 12 * 6; m++) {
      clock.t += 10 * 60_000; // inside the idle window, so a pong refreshes it each time
      await new Promise((r) => setTimeout(r, 70));
      expect(c.ws.readyState).toBe(WebSocket.OPEN);
    }
    clock.t += 60_000;
    expect(await c.closed).toBe(4001);
  }, 30_000);

  it('closes the socket of a user whose ticket was evicted by the cap', async () => {
    const { port } = await start({
      pingMs: 5000,
      maxTickets: 1,
    });
    const first = await open(port, signNetTicket('evict-a', SECRET, clock.t));
    clock.t += 1000;
    const second = await open(port, signNetTicket('evict-b', SECRET, clock.t));
    expect(await first.closed).toBe(4001);
    expect(second.ws.readyState).toBe(WebSocket.OPEN);
    second.ws.close();
  });

  it('closes a socket idle for more than 15 minutes (a peer that never answers pings)', async () => {
    const { port } = await start({
      pingMs: 150,
    });
    const c = await open(port, signNetTicket('idle-live', SECRET, clock.t), {
      autoPong: false,
    });
    clock.t += IDLE_MS + 1000; // before the first ping tick: no pong has refreshed it
    expect(await c.closed).toBe(4001);
  });
});

describe('status and DoH are metered, and status is not use', () => {
  it('answers 429 past 12 status requests per minute per user', async () => {
    const { port } = await start();
    const ticket = signNetTicket('meter-1', SECRET, clock.t);
    for (let i = 0; i < 12; i++) expect((await status(port, ticket)).status).toBe(200);
    expect((await status(port, ticket)).status).toBe(429);
    clock.t += 61_000;
    expect((await status(port, ticket)).status).toBe(200);
  });

  it('does not let status polling keep a ticket alive', async () => {
    const { port } = await start({
      statusPerMinute: 1000,
    });
    const ticket = signNetTicket('meter-2', SECRET, clock.t);
    expect((await dns(port, ticket)).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      clock.t += 6 * 60_000;
      expect((await status(port, ticket)).status).toBe(i < 2 ? 200 : 401);
    }
  });

  it('limits DoH queries per user per minute', async () => {
    const { port } = await start({
      dohPerMinute: 3,
    });
    const ticket = signNetTicket('meter-3', SECRET, clock.t);
    for (let i = 0; i < 3; i++) expect((await dns(port, ticket)).status).toBe(200);
    expect((await dns(port, ticket)).status).toBe(429);
  });
});
