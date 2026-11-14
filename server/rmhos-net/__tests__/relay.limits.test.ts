// Resource bounds and hostile input on the relay hub: queues, windows, rates, lookups, bad request targets.
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { Duplex } from 'node:stream';
import {
  afterAll,
  describe,
  expect,
  it,
} from 'vitest';
import WebSocket from 'ws';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';
import {
  createRelayServer,
  type Resolver,
} from '../relay';
import {
  CLOSE_REASON,
  decodePacket,
  encodeData,
} from '../wisp';

const SECRET =
  'limits-test-secret';
const policy =
  loadPolicy(
    {
      RMHOS_NET_BYTES_PER_SECOND:
        String(
          100 *
            1024 *
            1024,
        ),
      RMHOS_NET_BYTES_PER_DAY:
        String(
          10 *
            1024 *
            1024 *
            1024,
        ),
    },
  );
const publicResolve: Resolver =
  async () => [
    {
      address:
        '93.184.216.34',
      family: 4,
    },
  ];

/** A remote that accepts connections and never reads: its write side never drains. */
function stuckSocket(): net.Socket {
  const d =
    new Duplex(
      {
        read() {},
        write() {},
      },
    );
  (
    d as unknown as {
      setTimeout: () => Duplex;
    }
  ).setTimeout =
    () =>
      d;
  return d as unknown as net.Socket;
}

const servers: http.Server[] =
  [];
afterAll(
  async () => {
    for (const s of servers) {
      s.closeAllConnections();
      await new Promise(
        (
          r,
        ) =>
          s.close(
            r,
          ),
      );
    }
  },
);

function start(
  over: Partial<
    Parameters<
      typeof createRelayServer
    >[0]
  > = {},
) {
  const connectCalls: unknown[] =
    [];
  const s =
    createRelayServer(
      {
        secret:
          SECRET,
        policy,
        meter:
          new UsageMeter(
            policy,
          ),
        resolve:
          publicResolve,
        connect:
          ((
            o: unknown,
          ) => {
            connectCalls.push(
              o,
            );
            return stuckSocket();
          }) as unknown as typeof net.connect,
        ...over,
      },
    );
  servers.push(
    s,
  );
  return new Promise<{
    server: http.Server;
    port: number;
    connectCalls: unknown[];
  }>(
    (
      res,
    ) =>
      s.listen(
        0,
        '127.0.0.1',
        () =>
          res(
            {
              server:
                s,
              port: (
                s.address() as AddressInfo
              )
                .port,
              connectCalls,
            },
          ),
      ),
  );
}

class Client {
  readonly ws: WebSocket;
  readonly packets: NonNullable<
    ReturnType<
      typeof decodePacket
    >
  >[] =
    [];
  closeCode:
    | number
    | null =
    null;
  constructor(
    port: number,
    user: string,
  ) {
    const ticket =
      encodeURIComponent(
        signNetTicket(
          user,
          SECRET,
        ),
      );
    this.ws =
      new WebSocket(
        `ws://127.0.0.1:${port}/rmhos-net/?ticket=${ticket}`,
      );
    this.ws.on(
      'message',
      (
        d: Buffer,
      ) => {
        const p =
          decodePacket(
            new Uint8Array(
              d.buffer,
              d.byteOffset,
              d.length,
            ),
          );
        if (
          p
        )
          this.packets.push(
            p,
          );
      },
    );
    this.ws.on(
      'close',
      (
        c,
      ) =>
        (this.closeCode =
          c),
    );
  }
  async ready() {
    await new Promise<void>(
      (
        r,
        j,
      ) => {
        this.ws.once(
          'open',
          () =>
            r(),
        );
        this.ws.once(
          'error',
          j,
        );
      },
    );
  }
  async until<
    T,
  >(
    pick: () =>
      | T
      | undefined,
    ms = 4000,
  ): Promise<T> {
    const end =
      Date.now() +
      ms;
    for (;;) {
      const v =
        pick();
      if (
        v !==
        undefined
      )
        return v;
      if (
        Date.now() >
        end
      )
        throw new Error(
          'timed out waiting',
        );
      await new Promise(
        (
          r,
        ) =>
          setTimeout(
            r,
            10,
          ),
      );
    }
  }
  closeFor(
    id: number,
  ) {
    return this.until(
      () =>
        this.packets.find(
          (
            p,
          ) =>
            p.type ===
              'close' &&
            p.streamId ===
              id,
        ),
    );
  }
  connect(
    id: number,
    host = 'public.test',
    port = 443,
    type = 1,
  ) {
    const h =
      Buffer.from(
        host,
      );
    const b =
      Buffer.alloc(
        8 +
          h.length,
      );
    b[0] = 1;
    b.writeUInt32LE(
      id,
      1,
    );
    b[5] =
      type;
    b.writeUInt16LE(
      port,
      6,
    );
    h.copy(
      b,
      8,
    );
    this.ws.send(
      b,
    );
  }
  data(
    id: number,
    bytes: number,
  ) {
    this.ws.send(
      encodeData(
        id,
        Buffer.alloc(
          bytes,
          7,
        ),
      ),
    );
  }
}

async function login(
  port: number,
  user: string,
) {
  const c =
    new Client(
      port,
      user,
    );
  await c.ready();
  await c.until(
    () =>
      c.packets.find(
        (
          p,
        ) =>
          p.type ===
          'continue',
      ),
  );
  return c;
}

const reason =
  (
    p: unknown,
  ):
    | number
    | undefined => {
    const q =
      p as
        | {
            type?: string;
            reason?: number;
          }
        | undefined;
    return q?.type ===
      'close'
      ? q.reason
      : undefined;
  };

describe('guest to remote queue bounds', () => {
  it('closes a stream whose queue passes 1 MiB while the remote never reads', async () => {
    const {
      port,
    } =
      await start();
    const c =
      await login(
        port,
        'q-stream',
      );
    c.connect(
      1,
    );
    for (
      let i = 0;
      i <
      40;
      i++
    )
      c.data(
        1,
        64 *
          1024,
      );
    expect(
      reason(
        await c.closeFor(
          1,
        ),
      ),
    ).toBe(
      CLOSE_REASON.throttled,
    );
    c.ws.close();
  });

  it('closes the whole WebSocket with 4008 past 8 MiB queued across streams', async () => {
    const {
      port,
    } =
      await start();
    const c =
      await login(
        port,
        'q-conn',
      );
    for (
      let id = 1;
      id <=
      9;
      id++
    ) {
      c.connect(
        id,
      );
      // 17 packets fill the socket backlog; 15 more queue (~0.94 MiB, under the per-stream cap).
      for (
        let i = 0;
        i <
        32;
        i++
      )
        c.data(
          id,
          64 *
            1024,
        );
    }
    await c.until(
      () =>
        c.closeCode ===
        null
          ? undefined
          : true,
      8000,
    );
    expect(
      c.closeCode,
    ).toBe(
      4008,
    );
  }, 20_000);

  describe('an honest client that respects credit', () => {
    /** An upstream that records what it is given, can be stalled, and drains with a delay. */
    function sink(
      delayMs: number,
    ) {
      const received: Buffer[] =
        [];
      const pending: (() => void)[] =
        [];
      let stalled = false;
      const d =
        new Duplex(
          {
            read() {},
            write(
              chunk: Buffer,
              _e,
              cb,
            ) {
              received.push(
                Buffer.from(
                  chunk,
                ),
              );
              if (
                stalled
              )
                pending.push(
                  () =>
                    cb(),
                );
              else
                setTimeout(
                  cb,
                  delayMs,
                );
            },
          },
        );
      (
        d as unknown as {
          setTimeout: () => Duplex;
        }
      ).setTimeout =
        () =>
          d;
      return {
        socket:
          d as unknown as net.Socket,
        received,
        stall:
          () =>
            (stalled = true),
        release:
          () => {
            stalled = false;
            pending
              .splice(
                0,
              )
              .forEach(
                (
                  f,
                ) =>
                  f(),
              );
          },
      };
    }

    /** Sends only while it has credit; resets credit to the value of every CONTINUE, as a Wisp client does. */
    async function transfer(
      c: Client,
      id: number,
      packets: number,
      size: number,
    ) {
      let credit = 128;
      let seen = 0;
      let sent = 0;
      const end =
        Date.now() +
        25_000;
      while (
        sent <
        packets
      ) {
        for (
          ;
          seen <
          c
            .packets
            .length;
          seen++
        ) {
          const p =
            c
              .packets[
              seen
            ] as {
              type: string;
              streamId: number;
              bufferRemaining?: number;
            };
          if (
            p.type ===
              'continue' &&
            p.streamId ===
              id
          )
            credit =
              p.bufferRemaining ??
              credit;
          if (
            p.type ===
              'close' &&
            p.streamId ===
              id
          )
            throw new Error(
              'hub closed the stream ' + JSON.stringify(p),
            );
        }
        if (
          Date.now() >
          end
        )
          throw new Error(
            'transfer stalled',
          );
        if (
          credit <=
          0
        ) {
          await new Promise(
            (
              r,
            ) =>
              setTimeout(
                r,
                2,
              ),
          );
          continue;
        }
        const buf =
          Buffer.alloc(
            size,
            sent %
              251,
          );
        buf.writeUInt32LE(
          sent,
          0,
        );
        c.ws.send(
          encodeData(
            id,
            buf,
          ),
        );
        credit -= 1;
        sent += 1;
      }
    }

    function inOrder(
      received: Buffer[],
      packets: number,
      size: number,
    ) {
      const all =
        Buffer.concat(
          received,
        );
      expect(
        all.length,
      ).toBe(
        packets *
          size,
      );
      for (
        let i = 0;
        i <
        packets;
        i++
      )
        expect(
          all.readUInt32LE(
            i *
              size,
          ),
        ).toBe(
          i,
        );
    }

    it('moves 1000+ packets on one stream against a slow upstream without being closed', async () => {
      const up =
        sink(
          1,
        );
      const {
        port,
      } =
        await start(
          {
            connect:
              (() =>
                up.socket) as unknown as typeof net.connect,
          },
        );
      const c =
        await login(
          port,
          'honest-slow',
        );
      c.connect(
        1,
      );
      await transfer(
        c,
        1,
        1200,
        1500,
      );
      await c.until(
        () =>
          Buffer.concat(
            up.received,
          )
            .length >=
          1200 *
            1500
            ? true
            : undefined,
        15_000,
      );
      inOrder(
        up.received,
        1200,
        1500,
      );
      expect(
        c.packets.some(
          (
            p,
          ) =>
            p.type ===
              'close' &&
            p.streamId ===
              1,
        ),
      ).toBe(
        false,
      );
      expect(
        c.closeCode,
      ).toBeNull();
      c.ws.close();
    }, 40_000);

    it('is paused, never closed, across a stall and resume with 16 KiB packets', async () => {
      const up =
        sink(
          0,
        );
      up.stall();
      const {
        port,
      } =
        await start(
          {
            connect:
              (() =>
                up.socket) as unknown as typeof net.connect,
          },
        );
      const c =
        await login(
          port,
          'honest-stall',
        );
      c.connect(
        1,
      );
      setTimeout(
        () =>
          up.release(),
        400,
      );
      await transfer(
        c,
        1,
        200,
        16 *
          1024,
      );
      await c.until(
        () =>
          Buffer.concat(
            up.received,
          )
            .length >=
          200 *
            16 *
            1024
            ? true
            : undefined,
        15_000,
      );
      inOrder(
        up.received,
        200,
        16 *
          1024,
      );
      expect(
        c.packets.some(
          (
            p,
          ) =>
            p.type ===
              'close' &&
            p.streamId ===
              1,
        ),
      ).toBe(
        false,
      );
      c.ws.close();
    }, 40_000);
  });
});

describe('CONNECT policy and limits', () => {
  it('refuses a UDP CONNECT with the policy reason and never dials', async () => {
    const {
      port,
      connectCalls,
    } =
      await start();
    const c =
      await login(
        port,
        'udp-user',
      );
    c.connect(
      1,
      'public.test',
      53,
      2,
    );
    expect(
      reason(
        await c.closeFor(
          1,
        ),
      ),
    ).toBe(
      CLOSE_REASON.blocked,
    );
    expect(
      connectCalls,
    ).toHaveLength(
      0,
    );
    c.ws.close();
  });

  it('allows 30 CONNECTs per 10 s per user, then again once the window passes', async () => {
    let t = 1_000_000;
    const {
      port,
      connectCalls,
    } =
      await start(
        {
          now: () =>
            t,
          connectRate:
            {
              max: 3,
              windowMs: 10_000,
            },
        },
      );
    const c =
      await login(
        port,
        'rate-user',
      );
    for (
      let id = 1;
      id <=
      4;
      id++
    )
      c.connect(
        id,
      );
    expect(
      reason(
        await c.closeFor(
          4,
        ),
      ),
    ).toBe(
      CLOSE_REASON.throttled,
    );
    await c.until(
      () =>
        connectCalls.length ===
        3
          ? true
          : undefined,
    );
    t += 10_001;
    c.connect(
      5,
    );
    await c.until(
      () =>
        connectCalls.length ===
        4
          ? true
          : undefined,
    );
    c.ws.close();
  });

  it('treats a lookup that does not answer in time as unreachable', async () => {
    const hang: Resolver =
      () =>
        new Promise(
          () => {},
        );
    const {
      port,
      connectCalls,
    } =
      await start(
        {
          resolve:
            hang,
          lookupTimeoutMs: 50,
        },
      );
    const c =
      await login(
        port,
        'slow-dns',
      );
    c.connect(
      1,
    );
    expect(
      reason(
        await c.closeFor(
          1,
        ),
      ),
    ).toBe(
      CLOSE_REASON.unreachable,
    );
    expect(
      connectCalls,
    ).toHaveLength(
      0,
    );
    c.ws.close();
  });

  it('allows at most 8 lookups in flight per user', async () => {
    const hang: Resolver =
      () =>
        new Promise(
          () => {},
        );
    const {
      port,
    } =
      await start(
        {
          resolve:
            hang,
          lookupTimeoutMs: 600,
        },
      );
    const c =
      await login(
        port,
        'many-dns',
      );
    for (
      let id = 1;
      id <=
      9;
      id++
    )
      c.connect(
        id,
      );
    expect(
      reason(
        await c.closeFor(
          9,
        ),
      ),
    ).toBe(
      CLOSE_REASON.throttled,
    );
    expect(
      c.packets.filter(
        (
          p,
        ) =>
          p.type ===
            'close' &&
          p.streamId <
            9,
      ),
    ).toHaveLength(
      0,
    );
    c.ws.close();
  });
});

describe('malformed request targets', () => {
  function raw(
    port: number,
    text: string,
  ): Promise<string> {
    return new Promise(
      (
        resolve,
      ) => {
        const s =
          net.connect(
            port,
            '127.0.0.1',
            () =>
              s.write(
                text,
              ),
          );
        let out =
          '';
        s.on(
          'data',
          (
            d,
          ) =>
            (out +=
              d.toString()),
        );
        s.on(
          'close',
          () =>
            resolve(
              out,
            ),
        );
        s.on(
          'error',
          () =>
            resolve(
              out,
            ),
        );
        setTimeout(
          () =>
            s.destroy(),
          1500,
        );
      },
    );
  }

  it('answers 400 to an unparseable target and keeps serving', async () => {
    const {
      port,
    } =
      await start();
    expect(
      await raw(
        port,
        'GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
      ),
    ).toMatch(
      /^HTTP\/1\.1 400/,
    );
    const up =
      await raw(
        port,
        'GET //[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
      );
    expect(
      up,
    ).toMatch(
      /^HTTP\/1\.1 400/,
    );
    expect(
      (
        await fetch(
          `http://127.0.0.1:${port}/health`,
        )
      )
        .status,
    ).toBe(
      200,
    );
  });
});

describe('DoH accounting', () => {
  it('counts query and answer bytes against the user meter', async () => {
    const meter =
      new UsageMeter(
        {
          ...policy,
          bytesPerDay: 20,
        },
      );
    const {
      port,
    } =
      await start(
        {
          meter,
          doh: {
            upstream:
              'https://1.1.1.1/dns-query',
            corsOrigin:
              '',
            fetchImpl:
              (async () =>
                new Response(
                  new Uint8Array(
                    [
                      1,
                      2,
                      3,
                    ],
                  ),
                )) as unknown as typeof fetch,
          },
        },
      );
    const post =
      () =>
        fetch(
          `http://127.0.0.1:${port}/rmhos-net/dns-query?ticket=${encodeURIComponent(signNetTicket('doh-user', SECRET))}`,
          {
            method:
              'POST',
            headers:
              {
                'content-type':
                  'application/dns-message',
              },
            body: Buffer.alloc(
              12,
            ),
          },
        );
    expect(
      (
        await post()
      )
        .status,
    ).toBe(
      200,
    ); // 12 + 3 = 15 of 20
    expect(
      (
        await post()
      )
        .status,
    ).toBe(
      200,
    ); // 27 of 20: now over
    expect(
      meter.dayExhausted(
        'doh-user',
      ),
    ).toBe(
      true,
    );
    expect(
      (
        await post()
      )
        .status,
    ).toBe(
      429,
    );
  });
});
