// The relay hub: one authenticated WebSocket per user carrying Wisp v1 streams,
// each forwarded to the internet under the relay policy. The only thing in the
// feature that touches the network; see deploy/rmhos-net for its firewall.
import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import {
  WebSocketServer,
  type WebSocket,
} from 'ws';
import { RMHOS } from '@features/rmhos/engine/constants';
import { verifyNetTicket } from '@features/rmhos/engine/net-ticket.server';
import {
  DOH_PATH,
  handleDohPreflight,
  handleDohQuery,
  type DohOptions,
} from './doh';
import type { UsageMeter } from './meter';
import {
  checkConnect,
  type RelayPolicy,
  type Verdict,
} from './policy';
import {
  CLOSE_REASON,
  decodePacket,
  encodeClose,
  encodeContinue,
  encodeData,
} from './wisp';

export type Resolver =
  (
    host: string,
  ) => Promise<
    {
      address: string;
      family:
        | 4
        | 6;
    }[]
  >;

export interface RelayOptions {
  secret: string;
  policy: RelayPolicy & {
    enabled: boolean;
  };
  meter: UsageMeter;
  resolve?: Resolver;
  connect?: typeof net.connect;
  log?: (
    line: object,
  ) => void;
  doh?: {
    upstream: string;
    corsOrigin: string;
    fetchImpl?: typeof fetch;
  };
}

const CONNECT_TIMEOUT_MS = 10_000;
const WINDOW = 128;
const CONTINUE_EVERY = 64;
const RETRY_MS = 100;
const MAX_WS_BUFFER =
  1024 *
  1024;
const MAX_PENDING_BYTES =
  1024 *
  1024;
const MAX_FRAME_BYTES =
  1024 *
  1024;
const PING_MS = 30_000;
const SUPERSEDED = 4000;

const defaultResolve: Resolver =
  async (
    host,
  ) => {
    const records =
      await dns.promises.lookup(
        host,
        {
          all: true,
          verbatim: true,
        },
      );
    return records.map(
      (
        r,
      ) => ({
        address:
          r.address,
        family:
          r.family ===
          6
            ? 6
            : 4,
      }),
    );
  };

const reasonName =
  new Map<
    number,
    string
  >(
    Object.entries(
      CLOSE_REASON,
    ).map(
      ([
        name,
        code,
      ]) => [
        code,
        name,
      ],
    ),
  );

interface Stream {
  id: number;
  host: string;
  port: number;
  startedAt: number;
  up: number;
  down: number;
  socket: net.Socket | null;
  /** Guest data received before the upstream socket exists. */
  early: Buffer[];
  earlyBytes: number;
  upQueue: Buffer[];
  downQueue: Buffer[];
  processedPackets: number;
  timer: NodeJS.Timeout | null;
  remoteEnded: boolean;
}

function writeHttpError(
  socket: Duplex,
  status: number,
  text: string,
): void {
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`,
  );
  socket.destroy();
}

export function createRelayServer(
  opts: RelayOptions,
): http.Server {
  const {
    secret,
    policy,
    meter,
  } =
    opts;
  const resolve =
    opts.resolve ??
    defaultResolve;
  const connect =
    opts.connect ??
    net.connect;
  const log =
    opts.log ??
    (() => {});
  const dohOpts: DohOptions | null =
    opts.doh
      ? {
          secret,
          enabled:
            policy.enabled,
          policy,
          resolve,
          upstream:
            opts
              .doh
              .upstream,
          corsOrigin:
            opts
              .doh
              .corsOrigin,
          ...(opts
            .doh
            .fetchImpl
            ? {
                fetchImpl:
                  opts
                    .doh
                    .fetchImpl,
              }
            : {}),
        }
      : null;

  const sessions =
    new Map<
      string,
      {
        shutdown: (
          code: number,
        ) => void;
      }
    >();
  const wss =
    new WebSocketServer(
      {
        noServer: true,
        maxPayload:
          MAX_FRAME_BYTES,
        perMessageDeflate: false,
      },
    );

  const server =
    http.createServer(
      (
        req,
        res,
      ) => {
        const url =
          new URL(
            req.url ??
              '/',
            'http://hub',
          );
        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/health'
        ) {
          const body =
            JSON.stringify(
              {
                ok: true,
                enabled:
                  policy.enabled,
              },
            );
          res.writeHead(
            200,
            {
              'content-type':
                'application/json',
            },
          );
          res.end(
            body,
          );
          return;
        }
        if (
          url.pathname ===
            DOH_PATH &&
          dohOpts
        ) {
          if (
            req.method ===
            'OPTIONS'
          )
            return handleDohPreflight(
              dohOpts,
              res,
            );
          if (
            req.method ===
            'POST'
          ) {
            void handleDohQuery(
              dohOpts,
              req,
              res,
              url.searchParams.get(
                'ticket',
              ) ??
                '',
            );
            return;
          }
        }
        res.writeHead(
          404,
          {
            'content-length': 0,
          },
        );
        res.end();
      },
    );

  server.on(
    'upgrade',
    (
      req,
      socket,
      head,
    ) => {
      const url =
        new URL(
          req.url ??
            '/',
          'http://hub',
        );
      const path =
        url.pathname.endsWith(
          '/',
        )
          ? url.pathname
          : `${url.pathname}/`;
      if (
        path !==
        RMHOS.netPath
      )
        return writeHttpError(
          socket,
          404,
          'Not Found',
        );
      if (
        !policy.enabled
      )
        return writeHttpError(
          socket,
          503,
          'Service Unavailable',
        );
      const verdict =
        verifyNetTicket(
          url.searchParams.get(
            'ticket',
          ) ??
            '',
          secret,
        );
      if (
        !verdict.ok
      )
        return writeHttpError(
          socket,
          401,
          'Unauthorized',
        );
      wss.handleUpgrade(
        req,
        socket,
        head,
        (
          ws,
        ) =>
          session(
            ws,
            verdict.userId,
          ),
      );
    },
  );

  function session(
    ws: WebSocket,
    userId: string,
  ): void {
    const streams =
      new Map<
        number,
        Stream
      >();
    let over = false;

    const send =
      (
        frame: Uint8Array,
      ): void => {
        if (
          ws.readyState ===
          ws.OPEN
        )
          ws.send(
            frame,
          );
      };

    /** Remove a stream; the guest is told only when `notify` is set. Never sends DATA afterwards. */
    function closeStream(
      s: Stream,
      reason: number,
      notify: boolean,
    ): void {
      if (
        streams.get(
          s.id,
        ) !==
        s
      )
        return;
      streams.delete(
        s.id,
      );
      if (
        s.timer
      )
        clearTimeout(
          s.timer,
        );
      s.socket?.destroy();
      s.early.length = 0;
      s.upQueue.length = 0;
      s.downQueue.length = 0;
      if (
        notify
      )
        send(
          encodeClose(
            s.id,
            reason,
          ),
        );
      log(
        {
          evt: 'rmhos-net.stream',
          userId,
          host: s.host,
          port: s.port,
          up: s.up,
          down: s.down,
          ms:
            Date.now() -
            s.startedAt,
          reason:
            reasonName.get(
              reason,
            ) ??
            `0x${reason.toString(16)}`,
        },
      );
    }

    function closeAll(
      reason: number,
      notify: boolean,
    ): void {
      for (const s of [
        ...streams.values(),
      ])
        closeStream(
          s,
          reason,
          notify,
        );
    }

    function schedule(
      s: Stream,
      fn: () => void,
    ): void {
      if (
        s.timer
      )
        return;
      s.timer =
        setTimeout(
          () => {
            s.timer =
              null;
            fn();
          },
          RETRY_MS,
        );
    }

    function resume(
      s: Stream,
    ): void {
      pumpUp(
        s,
      );
      pumpDown(
        s,
      );
    }

    /** Guest to remote, paced by the user's allowance. */
    function pumpUp(
      s: Stream,
    ): void {
      const sock =
        s.socket;
      if (
        !sock
      )
        return;
      while (
        s
          .upQueue
          .length >
        0
      ) {
        if (
          meter.dayExhausted(
            userId,
          )
        )
          return closeAll(
            CLOSE_REASON.throttled,
            true,
          );
        const allow =
          meter.allowance(
            userId,
          );
        if (
          allow ===
            0 ||
          sock.writableLength >
            MAX_WS_BUFFER
        )
          return schedule(
            s,
            () =>
              resume(
                s,
              ),
          );
        const chunk =
          s
            .upQueue[0] as Buffer;
        const take =
          Math.min(
            allow,
            chunk.length,
          );
        meter.consume(
          userId,
          take,
        );
        s.up +=
          take;
        sock.write(
          take ===
            chunk.length
            ? chunk
            : chunk.subarray(
                0,
                take,
              ),
        );
        if (
          take ===
          chunk.length
        ) {
          s.upQueue.shift();
          s.processedPackets += 1;
          if (
            s.processedPackets %
              CONTINUE_EVERY ===
            0
          )
            send(
              encodeContinue(
                s.id,
                WINDOW,
              ),
            );
        } else {
          s.upQueue[0] =
            chunk.subarray(
              take,
            );
        }
      }
    }

    /** Remote to guest, paced by the user's allowance and the socket's own backlog. */
    function pumpDown(
      s: Stream,
    ): void {
      const sock =
        s.socket;
      if (
        !sock
      )
        return;
      while (
        s
          .downQueue
          .length >
        0
      ) {
        if (
          meter.dayExhausted(
            userId,
          )
        )
          return closeAll(
            CLOSE_REASON.throttled,
            true,
          );
        const allow =
          meter.allowance(
            userId,
          );
        if (
          allow ===
            0 ||
          ws.bufferedAmount >
            MAX_WS_BUFFER
        ) {
          sock.pause();
          return schedule(
            s,
            () =>
              resume(
                s,
              ),
          );
        }
        const chunk =
          s
            .downQueue[0] as Buffer;
        const take =
          Math.min(
            allow,
            chunk.length,
          );
        meter.consume(
          userId,
          take,
        );
        s.down +=
          take;
        send(
          encodeData(
            s.id,
            take ===
              chunk.length
              ? chunk
              : chunk.subarray(
                  0,
                  take,
                ),
          ),
        );
        if (
          take ===
          chunk.length
        )
          s.downQueue.shift();
        else
          s.downQueue[0] =
            chunk.subarray(
              take,
            );
      }
      if (
        s.remoteEnded
      )
        return closeStream(
          s,
          CLOSE_REASON.voluntary,
          true,
        );
      sock.resume();
    }

    async function open(
      id: number,
      host: string,
      port: number,
    ): Promise<void> {
      const s: Stream =
        {
          id,
          host,
          port,
          startedAt:
            Date.now(),
          up: 0,
          down: 0,
          socket:
            null,
          early:
            [],
          earlyBytes: 0,
          upQueue:
            [],
          downQueue:
            [],
          processedPackets: 0,
          timer:
            null,
          remoteEnded: false,
        };
      // Reserved before any await so concurrent CONNECTs count against the cap.
      const openStreams =
        streams.size;
      streams.set(
        id,
        s,
      );

      let verdict: Verdict;
      if (
        meter.dayExhausted(
          userId,
        )
      ) {
        verdict =
          {
            ok: false as const,
            reason:
              CLOSE_REASON.throttled,
          };
      } else {
        verdict =
          await checkConnect(
            policy,
            {
              streamType:
                'tcp',
              port,
              host,
              openStreams,
            },
            resolve,
          );
      }
      if (
        streams.get(
          id,
        ) !==
        s
      )
        return; // guest closed it, or the session ended
      if (
        !verdict.ok
      )
        return closeStream(
          s,
          verdict.reason,
          true,
        );

      const sock =
        connect(
          {
            host: verdict.address,
            port,
            family:
              verdict.family,
            timeout:
              CONNECT_TIMEOUT_MS,
          },
        );
      s.socket =
        sock;
      let connected = false;
      sock.on(
        'connect',
        () => {
          connected = true;
          sock.setTimeout(
            0,
          );
        },
      );
      sock.on(
        'timeout',
        () => {
          if (
            !connected
          )
            closeStream(
              s,
              CLOSE_REASON.timeout,
              true,
            );
        },
      );
      sock.on(
        'error',
        (
          err: NodeJS.ErrnoException,
        ) => {
          closeStream(
            s,
            err.code ===
              'ECONNREFUSED'
              ? CLOSE_REASON.refused
              : CLOSE_REASON.networkError,
            true,
          );
        },
      );
      sock.on(
        'data',
        (
          chunk: Buffer,
        ) => {
          if (
            streams.get(
              id,
            ) !==
            s
          )
            return;
          s.downQueue.push(
            chunk,
          );
          pumpDown(
            s,
          );
        },
      );
      sock.on(
        'end',
        () => {
          s.remoteEnded = true;
          if (
            s
              .downQueue
              .length ===
            0
          )
            closeStream(
              s,
              CLOSE_REASON.voluntary,
              true,
            );
        },
      );
      sock.on(
        'close',
        () => {
          s.remoteEnded = true;
          if (
            s
              .downQueue
              .length ===
            0
          )
            closeStream(
              s,
              CLOSE_REASON.voluntary,
              true,
            );
        },
      );
      for (const chunk of s.early)
        s.upQueue.push(
          chunk,
        );
      s.early.length = 0;
      pumpUp(
        s,
      );
    }

    ws.on(
      'message',
      (
        data,
        isBinary,
      ) => {
        if (
          !isBinary ||
          !Buffer.isBuffer(
            data,
          )
        )
          return;
        const pkt =
          decodePacket(
            new Uint8Array(
              data.buffer,
              data.byteOffset,
              data.length,
            ),
          );
        if (
          !pkt ||
          pkt.streamId ===
            0
        )
          return;
        const s =
          streams.get(
            pkt.streamId,
          );
        switch (
          pkt.type
        ) {
          case 'connect':
            if (
              s
            )
              return;
            void open(
              pkt.streamId,
              pkt.host,
              pkt.port,
            ).catch(
              () => {
                const failed =
                  streams.get(
                    pkt.streamId,
                  );
                if (
                  failed
                )
                  closeStream(
                    failed,
                    CLOSE_REASON.networkError,
                    true,
                  );
              },
            );
            return;
          case 'data': {
            if (
              !s
            )
              return;
            const buf =
              Buffer.from(
                pkt.payload,
              );
            if (
              !s.socket
            ) {
              s.earlyBytes +=
                buf.length;
              if (
                s.earlyBytes >
                MAX_PENDING_BYTES
              )
                return closeStream(
                  s,
                  CLOSE_REASON.throttled,
                  true,
                );
              s.early.push(
                buf,
              );
              return;
            }
            s.upQueue.push(
              buf,
            );
            pumpUp(
              s,
            );
            return;
          }
          case 'close':
            if (
              s
            )
              closeStream(
                s,
                pkt.reason,
                false,
              );
            return;
          default:
            return; // CONTINUE from the guest carries nothing we act on
        }
      },
    );

    function teardown(): void {
      if (
        over
      )
        return;
      over = true;
      clearInterval(
        ping,
      );
      closeAll(
        CLOSE_REASON.voluntary,
        false,
      );
      if (
        sessions.get(
          userId,
        ) ===
        handle
      )
        sessions.delete(
          userId,
        );
    }

    const handle =
      {
        shutdown(
          code: number,
        ): void {
          teardown();
          ws.close(
            code,
          );
          // Do not wait on a peer that never completes the close handshake.
          setTimeout(
            () =>
              ws.terminate(),
            2000,
          ).unref();
        },
      };

    let alive = true;
    ws.on(
      'pong',
      () => {
        alive = true;
      },
    );
    const ping =
      setInterval(
        () => {
          if (
            !alive
          )
            return ws.terminate();
          alive = false;
          ws.ping();
        },
        PING_MS,
      );
    ping.unref();

    ws.on(
      'close',
      teardown,
    );
    ws.on(
      'error',
      teardown,
    );

    // One live session per user: the newer one wins.
    sessions
      .get(
        userId,
      )
      ?.shutdown(
        SUPERSEDED,
      );
    sessions.set(
      userId,
      handle,
    );
    send(
      encodeContinue(
        0,
        WINDOW,
      ),
    );
  }

  server.on(
    'close',
    () => {
      for (const h of sessions.values())
        h.shutdown(
          1001,
        );
      wss.close();
    },
  );
  return server;
}
