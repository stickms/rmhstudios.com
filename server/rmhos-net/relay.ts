// The relay hub: one authenticated WebSocket per user carrying Wisp v1 streams,
// each forwarded to the internet under the relay policy. The only thing in the
// feature that touches the network; see deploy/rmhos-net for its firewall.
import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { RMHOS } from '@features/rmhos/engine/constants';
import { DOH_PATH, handleDohPreflight, handleDohQuery, type DohOptions } from './doh';
import type { UsageMeter } from './meter';
import { checkConnect, type RelayPolicy, type Verdict } from './policy';
import { TicketBook } from './tickets';
import { CLOSE_REASON, decodePacket, encodeClose, encodeContinue, encodeData } from './wisp';

export type Resolver = (host: string) => Promise<
  {
    address: string;
    family: 4 | 6;
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
  log?: (line: object) => void;
  doh?: {
    upstream: string;
    corsOrigin: string;
    fetchImpl?: typeof fetch;
  };
  /** Injected clock for the CONNECT rate limit. */
  now?: () => number;
  /** A lookup that has not answered by then counts as unreachable. Default 5 s. */
  lookupTimeoutMs?: number;
  /** Ping interval, which also re-checks that the socket's ticket is still valid. Default 30 s. */
  pingMs?: number;
  /** Test seam: size of the ticket book (default 10 000). */
  maxTickets?: number;
  /** Test seam: process-wide cap on buffered bytes in both directions (default 48 MiB). */
  maxTotalBuffered?: number;
  /** Status requests allowed per user per minute (default 12), DoH queries (default 600). */
  statusPerMinute?: number;
  dohPerMinute?: number;
  /** CONNECTs allowed per user per window. Default 30 per 10 s. */
  connectRate?: {
    max: number;
    windowMs: number;
  };
}

const CONNECT_TIMEOUT_MS = 10_000;
const LOOKUP_TIMEOUT_MS = 5000;
const MAX_LOOKUPS_PER_USER = 8;
const WINDOW = 128;
const CONTINUE_EVERY = 64;
const CREDIT_HOLD_HIGH = 512 * 1024;
const CREDIT_HOLD_LOW = 256 * 1024;
const RETRY_MS = 100;
const MAX_WS_BUFFER = 1024 * 1024;
// The upstream socket's own buffer is not in the accounted queue, so it is kept small: data
// waits in the counted queue instead.
const UPSTREAM_HIGH_WATER = 64 * 1024;
const MAX_STREAM_QUEUE = 1024 * 1024;
// Before the upstream exists an honest client may still send its whole initial window (128 packets).
const MAX_EARLY_QUEUE = 2 * 1024 * 1024;
const MAX_CONN_QUEUE = 8 * 1024 * 1024;
// v86 sends Ethernet frames of at most the guest MTU (1500 bytes; its fake TCP stack announces
// MSS = MTU - 40), so a Wisp DATA frame is about 1.5 KB. 64 KiB of payload (plus the 5-byte
// header) leaves room for a guest that raises its own MTU and is the largest frame accepted.
const MAX_FRAME_BYTES = 64 * 1024 + 16;
// What one connection can hold, every part bounded:
//   guest to remote: the accounted queue (MAX_CONN_QUEUE, 8 MiB)
//                    + at most UPSTREAM_HIGH_WATER in each of 64 upstream socket write buffers
//                      (4 MiB; a write never takes a buffer past the mark);
//   remote to guest: one 64 KiB chunk per stream waiting for the WebSocket (4 MiB)
//                    + what a paused upstream socket still holds readable (about one more 64 KiB
//                      per stream, 4 MiB; pumpDown pauses the socket when ws.bufferedAmount is
//                      over MAX_WS_BUFFER)
//                    + the WebSocket's own send buffer (MAX_WS_BUFFER, 1 MiB, overshot by at most
//                      one chunk).
// That is about 21 MiB per connection. Kernel socket buffers are outside the count.
//
// Process-wide backstop. The container has 256 MiB (mem_limit); the compose command caps the V8
// heap at 128 MiB. The buffers above are Buffers, outside the heap, so they count against the
// 256 MiB directly, and they understate RSS (small frames pin pooled 8 KiB slabs; kernel socket
// buffers are not counted at all). So the sum is made to hold without assuming the heap stays
// small: 128 MiB heap cap + MAX_TOTAL_BUFFERED = 48 MiB counted here + about 30 MiB of Node itself
// outside the heap (code, ws, the native side of sockets) leaves about 50 MiB for kernel socket
// memory charged to the cgroup, slab overhead and what can arrive between two 250 ms checks (a
// user is metered at 2 MiB/s by default). 48 MiB is also two worst-case (~21 MiB) connections.
const MAX_TOTAL_BUFFERED = 48 * 1024 * 1024;
const BACKSTOP_MS = 250;
const PING_MS = 30_000;
const SUPERSEDED = 4000;
/** The ticket behind this socket is no longer valid (12 h, idle, evicted). */
const EXPIRED = 4001;
const STATUS_PATH = `${RMHOS.netPath}status`;
const OVER_QUEUE = 4008;

// resolve4/resolve6 query the DNS servers directly with a bounded timeout and no libuv
// thread (dns.lookup would pin one per stuck query). Every answer is still policy-checked.
const systemResolver = new dns.promises.Resolver({
  timeout: LOOKUP_TIMEOUT_MS,
  tries: 1,
});
const defaultResolve: Resolver = async (host) => {
  const [v4, v6] = await Promise.allSettled([
    systemResolver.resolve4(host),
    systemResolver.resolve6(host),
  ]);
  const out: {
    address: string;
    family: 4 | 6;
  }[] = [];
  if (v4.status === 'fulfilled')
    for (const a of v4.value)
      out.push({
        address: a,
        family: 4,
      });
  if (v6.status === 'fulfilled')
    for (const a of v6.value)
      out.push({
        address: a,
        family: 6,
      });
  if (out.length === 0) throw new Error('no addresses');
  return out;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('lookup timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function reasonName(code: number): string | undefined {
  return Object.entries(CLOSE_REASON).find(([, c]) => c === code)?.[0];
}

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
  upQueue: Buffer[];
  /** Guest bytes accepted but not yet written upstream (early + upQueue). */
  queuedBytes: number;
  downQueue: Buffer[];
  /** Packets written upstream since the last CONTINUE, and the window that CONTINUE granted. */
  sinceGrant: number;
  lastGrant: number;
  /** Queue passed the high mark: no CONTINUE until it drains below the low mark. */
  creditHeld: boolean;
  creditOwed: boolean;
  maxPacket: number;
  /** DATA packets received since the last CONTINUE. */
  receivedSinceGrant: number;
  timer: NodeJS.Timeout | null;
  remoteEnded: boolean;
}

function writeHttpError(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`);
  socket.destroy();
}

function parseTarget(raw: string | undefined): URL | null {
  try {
    return new URL(raw ?? '/', 'http://hub');
  } catch {
    return null;
  }
}

/** The HTTP server plus the sweep the entry point runs on its prune interval. */
export type RelayServer = http.Server & { prune: () => void };

export function createRelayServer(opts: RelayOptions): RelayServer {
  const { secret, policy, meter } = opts;
  const resolve = opts.resolve ?? defaultResolve;
  const connect = opts.connect ?? net.connect;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now;
  const lookupTimeoutMs = opts.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  const rate = opts.connectRate ?? {
    max: 30,
    windowMs: 10_000,
  };
  const pingMs = opts.pingMs ?? PING_MS;
  const maxTotal = opts.maxTotalBuffered ?? MAX_TOTAL_BUFFERED;
  const tickets = new TicketBook(secret, now, {
    ...(opts.maxTickets !== undefined ? { maxTickets: opts.maxTickets } : {}),
    // A ticket that stops being valid takes the live socket it opened with it.
    onInvalid: (userId) => sessions.get(userId)?.shutdown(EXPIRED),
  });
  /** Sliding one-minute window per user; only requests that were allowed are counted. */
  function minuteLimiter(max: number) {
    const hits = new Map<string, number[]>();
    return {
      allow(key: string): boolean {
        const t = now();
        const recent = (hits.get(key) ?? []).filter((x) => x > t - 60_000);
        if (recent.length >= max) {
          hits.set(key, recent);
          return false;
        }
        recent.push(t);
        hits.set(key, recent);
        return true;
      },
      prune(): void {
        const t = now();
        for (const [k, v] of hits) if ((v[v.length - 1] ?? 0) <= t - 60_000) hits.delete(k);
      },
    };
  }
  const statusLimit = minuteLimiter(opts.statusPerMinute ?? 12);
  const dohLimit = minuteLimiter(opts.dohPerMinute ?? 600);
  const timedResolve: Resolver = (host) => withTimeout(resolve(host), lookupTimeoutMs);
  const dohOpts: DohOptions | null = opts.doh
    ? {
        authorize: (ticket) => authorize(ticket),
        rateLimit: (userId) => dohLimit.allow(userId),
        inFlight: new Map<string, number>(),
        enabled: policy.enabled,
        policy,
        meter,
        resolve: timedResolve,
        upstream: opts.doh.upstream,
        corsOrigin: opts.doh.corsOrigin,
        ...(opts.doh.fetchImpl
          ? {
              fetchImpl: opts.doh.fetchImpl,
            }
          : {}),
      }
    : null;

  const sessions = new Map<
    string,
    {
      shutdown: (code: number) => void;
      streamCount: () => number;
      /** Bytes this connection holds in both directions. */
      measure: () => number;
      /** Connection order: a later connection has a higher number. */
      seq: number;
    }
  >();
  const lookups = new Map<string, number>();
  const connectTimes = new Map<string, number[]>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
  });

  /** Sliding window: at most `rate.max` CONNECTs per user per `rate.windowMs`. */
  function allowConnect(userId: string): boolean {
    const t = now();
    const recent = (connectTimes.get(userId) ?? []).filter((x) => x > t - rate.windowMs);
    if (recent.length >= rate.max) {
      connectTimes.set(userId, recent);
      return false;
    }
    recent.push(t);
    connectTimes.set(userId, recent);
    if (connectTimes.size > 5000) {
      for (const [id, times] of connectTimes) {
        if ((times[times.length - 1] ?? 0) <= t - rate.windowMs) connectTimes.delete(id);
      }
    }
    return true;
  }

  /** Authorises a ticket; a newer ticket for a user closes that user's live socket. */
  function authorize(
    ticket: string,
    refresh = true,
  ): { ok: true; userId: string } | { ok: false } {
    const who = tickets.authorize(ticket, refresh);
    if (who.ok && who.replaced) sessions.get(who.userId)?.shutdown(SUPERSEDED);
    return who;
  }

  const server = http.createServer((req, res) => {
    const url = parseTarget(req.url);
    if (!url) {
      res.writeHead(400, {
        'content-length': 0,
        connection: 'close',
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      const body = JSON.stringify({
        ok: true,
        enabled: policy.enabled,
      });
      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(body);
      return;
    }
    if (url.pathname === STATUS_PATH && req.method === 'GET') {
      // Same auth as DoH; answers only about the ticket's own user.
      const status = (code: number, body: object): void => {
        res.writeHead(code, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          ...(opts.doh?.corsOrigin
            ? { 'access-control-allow-origin': opts.doh.corsOrigin, vary: 'origin' }
            : {}),
        });
        res.end(JSON.stringify(body));
      };
      if (!policy.enabled) return status(503, { error: 'disabled' });
      // Asking does not count as use: only relayed traffic and a live socket keep a ticket alive.
      const who = authorize(url.searchParams.get('ticket') ?? '', false);
      if (!who.ok) return status(401, { error: 'unauthorized' });
      if (!statusLimit.allow(who.userId)) return status(429, { error: 'too many requests' });
      const live = sessions.get(who.userId);
      return status(200, { connected: live !== undefined, streams: live?.streamCount() ?? 0 });
    }
    if (url.pathname === DOH_PATH && dohOpts) {
      if (req.method === 'OPTIONS') return handleDohPreflight(dohOpts, res);
      if (req.method === 'POST') {
        void handleDohQuery(dohOpts, req, res, url.searchParams.get('ticket') ?? '');
        return;
      }
    }
    res.writeHead(404, {
      'content-length': 0,
    });
    res.end();
  });

  server.on('upgrade', (req, socket, head) => {
    const url = parseTarget(req.url);
    if (!url) return writeHttpError(socket, 400, 'Bad Request');
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    if (path !== RMHOS.netPath) return writeHttpError(socket, 404, 'Not Found');
    if (!policy.enabled) return writeHttpError(socket, 503, 'Service Unavailable');
    const verdict = authorize(url.searchParams.get('ticket') ?? '');
    if (!verdict.ok) return writeHttpError(socket, 401, 'Unauthorized');
    wss.handleUpgrade(req, socket, head, (ws) => session(ws, verdict.userId));
  });

  /**
   * Process-wide backstop. Measures every live connection in both directions (see `measure` in
   * session) and, while the total is over the cap, closes the strictly heaviest connection with
   * 4008. There is deliberately no smarter victim rule: anything that prefers a connection by how
   * it behaved (who grew last, who is quiet) can be steered by an attacker holding several
   * connections just under a legitimate one. An exact tie sheds the newest connection (the oldest
   * is the likelier to be a real session), which is deterministic.
   * Only a 250 ms timer walks the streams. Data events just set `dirty`, so a quiet hub does not
   * walk at all; the walk is skipped only when nothing changed since the last one and that last
   * total was under half the cap (near the cap it always walks, since a paused socket's readable
   * buffer can grow without a data event).
   */
  let connectionSeq = 0;
  let dirty = false;
  let lastTotal = 0;
  function checkBackstop(): void {
    if (!dirty && lastTotal < maxTotal / 2) return;
    dirty = false;
    const live = [...sessions.values()].map((h) => ({ h, n: h.measure(), seq: h.seq }));
    let total = live.reduce((sum, x) => sum + x.n, 0);
    lastTotal = total;
    while (total > maxTotal && live.length > 0) {
      live.sort((a, b) => b.n - a.n || b.seq - a.seq);
      const victim = live.shift() as (typeof live)[number];
      victim.h.shutdown(OVER_QUEUE);
      total -= victim.n;
    }
  }
  // One timer per server, unref'd; started when it listens (a server that never listens has no
  // timer) and stopped when it closes.
  let backstopTimer: NodeJS.Timeout | null = null;
  server.on('listening', () => {
    backstopTimer = setInterval(checkBackstop, BACKSTOP_MS);
    backstopTimer.unref();
  });

  function session(ws: WebSocket, userId: string): void {
    const streams = new Map<number, Stream>();
    let over = false;
    /** Guest bytes queued across every stream of this connection. */
    let connQueued = 0;

    const send = (frame: Uint8Array): void => {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    };

    function dequeue(s: Stream, bytes: number): void {
      s.queuedBytes -= bytes;
      connQueued -= bytes;
    }

    /** Remove a stream; the guest is told only when `notify` is set. Never sends DATA afterwards. */
    function closeStream(s: Stream, reason: number, notify: boolean): void {
      if (streams.get(s.id) !== s) return;
      streams.delete(s.id);
      if (s.timer) clearTimeout(s.timer);
      s.socket?.destroy();
      dequeue(s, s.queuedBytes);
      s.early.length = 0;
      s.upQueue.length = 0;
      s.downQueue.length = 0;
      if (notify) send(encodeClose(s.id, reason));
      log({
        evt: 'rmhos-net.stream',
        userId,
        host: s.host,
        port: s.port,
        up: s.up,
        down: s.down,
        ms: Date.now() - s.startedAt,
        reason: reasonName(reason) ?? `0x${reason.toString(16)}`,
      });
    }

    function closeAll(reason: number, notify: boolean): void {
      for (const s of [...streams.values()]) closeStream(s, reason, notify);
    }

    function schedule(s: Stream, fn: () => void): void {
      if (s.timer) return;
      s.timer = setTimeout(() => {
        s.timer = null;
        fn();
      }, RETRY_MS);
    }

    function resume(s: Stream): void {
      pumpUp(s);
      pumpDown(s);
    }

    /**
     * CONTINUE for a stream, withheld while its queue is above the high mark (a client that
     * respects credit is paused, not killed) and sized to the room left, so a full window of
     * the packets it has been sending cannot overrun the 1 MiB hard cap.
     */
    function grantCredit(s: Stream): void {
      if (s.creditHeld && s.queuedBytes < CREDIT_HOLD_LOW) s.creditHeld = false;
      if (s.creditHeld || !s.creditOwed) return;
      s.creditOwed = false;
      // Packets the client may already have in flight (sent before it sees this CONTINUE) still
      // arrive, so they come out of the room before the new window is granted.
      const inFlight = Math.max(0, s.lastGrant - s.receivedSinceGrant);
      const room = Math.floor((MAX_STREAM_QUEUE / 2 - s.queuedBytes) / s.maxPacket) - inFlight;
      if (room < 1) {
        s.creditOwed = true;
        return;
      }
      const grant = Math.min(WINDOW, room);
      s.receivedSinceGrant = 0;
      s.sinceGrant = 0;
      s.lastGrant = grant;
      send(encodeContinue(s.id, grant));
    }

    /** Guest to remote, paced by the user's allowance and the upstream socket's own backlog. */
    function pumpUp(s: Stream): void {
      const sock = s.socket;
      if (!sock) return;
      while (s.upQueue.length > 0) {
        if (meter.dayExhausted(userId)) return closeAll(CLOSE_REASON.throttled, true);
        const allow = meter.allowance(userId);
        // Never hand the socket more than fits under the mark: a whole 64 KiB frame to each of
        // 64 stalled peers would otherwise sit outside the accounted queue.
        const room = UPSTREAM_HIGH_WATER - sock.writableLength;
        if (allow === 0 || room <= 0) {
          return schedule(s, () => resume(s));
        }
        const chunk = s.upQueue[0] as Buffer;
        const take = Math.min(allow, chunk.length, room);
        meter.consume(userId, take);
        s.up += take;
        dequeue(s, take);
        sock.write(take === chunk.length ? chunk : chunk.subarray(0, take));
        if (take === chunk.length) {
          s.upQueue.shift();
          s.sinceGrant += 1;
          if (s.sinceGrant >= Math.min(CONTINUE_EVERY, Math.ceil(s.lastGrant / 2)))
            s.creditOwed = true;
        } else {
          s.upQueue[0] = chunk.subarray(take);
        }
        grantCredit(s);
      }
    }

    /** Remote to guest, paced by the user's allowance and the WebSocket's backlog. */
    function pumpDown(s: Stream): void {
      const sock = s.socket;
      if (!sock) return;
      while (s.downQueue.length > 0) {
        if (meter.dayExhausted(userId)) return closeAll(CLOSE_REASON.throttled, true);
        const allow = meter.allowance(userId);
        if (allow === 0 || ws.bufferedAmount > MAX_WS_BUFFER) {
          sock.pause();
          return schedule(s, () => resume(s));
        }
        const chunk = s.downQueue[0] as Buffer;
        const take = Math.min(allow, chunk.length);
        meter.consume(userId, take);
        s.down += take;
        send(encodeData(s.id, take === chunk.length ? chunk : chunk.subarray(0, take)));
        if (take === chunk.length) s.downQueue.shift();
        else s.downQueue[0] = chunk.subarray(take);
      }
      if (s.remoteEnded) return closeStream(s, CLOSE_REASON.voluntary, true);
      sock.resume();
    }

    async function open(
      id: number,
      streamType: 'tcp' | 'udp',
      host: string,
      port: number,
    ): Promise<void> {
      const s: Stream = {
        id,
        host,
        port,
        startedAt: Date.now(),
        up: 0,
        down: 0,
        socket: null,
        early: [],
        upQueue: [],
        queuedBytes: 0,
        downQueue: [],
        sinceGrant: 0,
        lastGrant: WINDOW,
        creditHeld: false,
        creditOwed: false,
        maxPacket: 1,
        receivedSinceGrant: 0,
        timer: null,
        remoteEnded: false,
      };
      // Reserved before any await so concurrent CONNECTs count against the cap.
      const openStreams = streams.size;
      streams.set(id, s);

      if (!allowConnect(userId) || meter.dayExhausted(userId)) {
        return closeStream(s, CLOSE_REASON.throttled, true);
      }
      // Only a name costs a lookup; a literal address answers immediately.
      const needsLookup = net.isIP(host.trim().replace(/^\[|\]$/g, '')) === 0;
      if (needsLookup) {
        if ((lookups.get(userId) ?? 0) >= MAX_LOOKUPS_PER_USER) {
          return closeStream(s, CLOSE_REASON.throttled, true);
        }
        lookups.set(userId, (lookups.get(userId) ?? 0) + 1);
      }
      let verdict: Verdict;
      try {
        verdict = await checkConnect(
          policy,
          {
            streamType,
            port,
            host,
            openStreams,
          },
          timedResolve,
        );
      } finally {
        if (needsLookup) {
          const left = (lookups.get(userId) ?? 1) - 1;
          if (left <= 0) lookups.delete(userId);
          else lookups.set(userId, left);
        }
      }
      if (streams.get(id) !== s) return; // guest closed it, or the session ended
      if (!verdict.ok) return closeStream(s, verdict.reason, true);

      const sock = connect({
        host: verdict.address,
        port,
        family: verdict.family,
        timeout: CONNECT_TIMEOUT_MS,
      });
      s.socket = sock;
      let connected = false;
      sock.on('connect', () => {
        connected = true;
        sock.setTimeout(0);
      });
      sock.on('timeout', () => {
        if (!connected) closeStream(s, CLOSE_REASON.timeout, true);
      });
      sock.on('error', (err: NodeJS.ErrnoException) => {
        closeStream(
          s,
          err.code === 'ECONNREFUSED' ? CLOSE_REASON.refused : CLOSE_REASON.networkError,
          true,
        );
      });
      sock.on('drain', () => {
        if (streams.get(id) === s) pumpUp(s);
      });
      sock.on('data', (chunk: Buffer) => {
        if (streams.get(id) !== s) return;
        tickets.touch(userId);
        s.downQueue.push(chunk);
        pumpDown(s);
        dirty = true;
      });
      sock.on('end', () => {
        s.remoteEnded = true;
        if (s.downQueue.length === 0) closeStream(s, CLOSE_REASON.voluntary, true);
      });
      sock.on('close', () => {
        s.remoteEnded = true;
        if (s.downQueue.length === 0) closeStream(s, CLOSE_REASON.voluntary, true);
      });
      for (const chunk of s.early) s.upQueue.push(chunk);
      s.early.length = 0;
      pumpUp(s);
    }

    ws.on('message', (data, isBinary) => {
      // A socket being shed or expired may still deliver frames during the close handshake.
      if (over) return;
      tickets.touch(userId);
      if (!isBinary || !Buffer.isBuffer(data)) return;
      const pkt = decodePacket(new Uint8Array(data.buffer, data.byteOffset, data.length));
      if (!pkt || pkt.streamId === 0) return;
      const s = streams.get(pkt.streamId);
      switch (pkt.type) {
        case 'connect':
          if (s) return;
          void open(pkt.streamId, pkt.streamType, pkt.host, pkt.port).catch(() => {
            const failed = streams.get(pkt.streamId);
            if (failed) closeStream(failed, CLOSE_REASON.networkError, true);
          });
          return;
        case 'data': {
          if (!s) return;
          const buf = Buffer.from(pkt.payload);
          if (s.queuedBytes + buf.length > (s.socket ? MAX_STREAM_QUEUE : MAX_EARLY_QUEUE)) {
            return closeStream(s, CLOSE_REASON.throttled, true);
          }
          if (connQueued + buf.length > MAX_CONN_QUEUE) return handle.shutdown(OVER_QUEUE);
          s.queuedBytes += buf.length;
          connQueued += buf.length;
          dirty = true;
          s.maxPacket = Math.max(s.maxPacket, buf.length);
          s.receivedSinceGrant += 1;
          if (s.queuedBytes > CREDIT_HOLD_HIGH) s.creditHeld = true;
          grantCredit(s);
          if (!s.socket) {
            s.early.push(buf);
            return;
          }
          s.upQueue.push(buf);
          pumpUp(s);
          return;
        }
        case 'close':
          if (s) closeStream(s, pkt.reason, false);
          return;
        default:
          return; // CONTINUE from the guest carries nothing we act on
      }
    });

    /** The close code the peer sent (1006 when the socket just went away), for the session log. */
    let peerCode = 1006;
    function teardown(): void {
      if (!over) {
        over = true;
        log({ evt: 'rmhos-net.session', userId, state: 'closed', code: peerCode });
        clearInterval(ping);
        if (sessions.get(userId) === handle) sessions.delete(userId);
      }
      // Idempotent but complete: also closes anything opened late (an open() that was awaiting
      // its lookup when the connection ended is dropped by its own streams.get check).
      closeAll(CLOSE_REASON.voluntary, false);
    }

    const handle = {
      streamCount: () => streams.size,
      seq: ++connectionSeq,
      measure: () => {
        // up: the accounted queue + upstream write buffers; down: chunks held for the WebSocket,
        // what paused upstream sockets still hold readable, and the WebSocket's send buffer.
        let n = connQueued + ws.bufferedAmount;
        for (const st of streams.values()) {
          n += (st.socket?.writableLength ?? 0) + (st.socket?.readableLength ?? 0);
          for (const c of st.downQueue) n += c.length;
        }
        return n;
      },
      shutdown(code: number): void {
        teardown();
        ws.close(code);
        // Do not wait on a peer that never completes the close handshake.
        setTimeout(() => ws.terminate(), 2000).unref();
      },
    };

    let alive = true;
    ws.on('pong', () => {
      alive = true;
      tickets.touch(userId); // a connected tab is in use
    });
    const ping = setInterval(() => {
      // The ticket behind a live socket can lapse (12 h cap) with nobody asking: close it here.
      if (!tickets.valid(userId)) return handle.shutdown(EXPIRED);
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, pingMs);
    ping.unref();

    ws.on('close', (code) => {
      peerCode = code;
      teardown();
    });
    ws.on('error', teardown);

    // One live session per user: the newer one wins.
    sessions.get(userId)?.shutdown(SUPERSEDED);
    sessions.set(userId, handle);
    log({ evt: 'rmhos-net.session', userId, state: 'open' });
    send(encodeContinue(0, WINDOW));
  }

  server.on('close', () => {
    if (backstopTimer) clearInterval(backstopTimer);
    for (const h of sessions.values()) h.shutdown(1001);
    wss.close();
  });
  return Object.assign(server, {
    prune: () => {
      tickets.prune();
      statusLimit.prune();
      dohLimit.prune();
    },
  });
}
