#!/usr/bin/env node
/**
 * socket-bench — hub load harness (docs/server-perf-2026-10-21/01-method.md §1.6).
 *
 * Opens N Socket.IO clients against the Node realtime hubs, drives a scripted
 * event mix per hub, and records
 *   - broadcast latency p50/p95/p99 (send -> receive at every recipient; the
 *     bench is one process so `performance.now()` is a shared clock),
 *   - inbound event/s the clients saw (fan-out volume),
 *   - the hub's own event-loop delay, CPU and RSS, read from the env-gated probe
 *     (`RMH_PERF_HUB=1` on the hub: server/shared/perf-probe.ts).
 *
 * No new dependencies: socket.io-client and pg are already in package.json.
 *
 *   # 1. start the hubs (see docs/server-perf-2026-10-21/results/ws-5.md "Commands")
 *   # 2. seed users + sessions into the hub DB once:
 *   node scripts/perf/socket-bench.mjs --seed 400
 *   # 3. run a load mix
 *   node scripts/perf/socket-bench.mjs --hubs tube,music,box,casino --duration 20 \
 *       --out docs/server-perf-2026-10-21/results/ws5-before.json
 *   # 4. compare two runs
 *   node scripts/perf/socket-bench.mjs --compare before.json after.json
 *
 * Hubs are located by --socket-url/--box-url/--tube-url (defaults: the WS5
 * ports 7151/7152/7153). Users are the `perfhub-*` rows --seed creates, with a
 * raw session token each (the hubs look the token up in `session`, exactly what
 * Better Auth stores). DATABASE_URL (or --db) is the hub's database.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';

// ─── CLI ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const num = (name, fallback) => Number(flag(name, fallback));

if (flag('compare', false)) {
  const [a, b] = argv.slice(argv.indexOf('--compare') + 1);
  compare(JSON.parse(readFileSync(a, 'utf8')), JSON.parse(readFileSync(b, 'utf8')));
  process.exit(0);
}

const opts = {
  hubs: String(flag('hubs', 'tube,music,box,casino')).split(','),
  duration: num('duration', 20),
  warmup: num('warmup', 3),
  // tube / music
  rooms: num('rooms', 10),
  members: num('members', 12),
  chatEveryMs: num('chat-every', 4000),
  // rmhbox
  lobbies: num('lobbies', 6),
  lobbyPlayers: num('lobby-players', 8),
  // casino
  tables: num('tables', 3),
  seatsPerTable: num('seats', 5),
  storm: num('storm', 300),
  socketUrl: String(flag('socket-url', 'http://127.0.0.1:7151')),
  boxUrl: String(flag('box-url', 'http://127.0.0.1:7152')),
  tubeUrl: String(flag('tube-url', 'http://127.0.0.1:7153')),
  db: String(flag('db', process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/rmh_ws5')),
  out: flag('out', null),
  label: String(flag('label', 'run')),
};

// ─── Helpers ─────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}
function summarize(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const r = (x) => (x === null ? null : Math.round(x * 100) / 100);
  return { n: s.length, p50: r(pct(s, 50)), p95: r(pct(s, 95)), p99: r(pct(s, 99)), max: r(s[s.length - 1] ?? null) };
}

class Series {
  constructor() {
    this.v = [];
    this.on = false;
  }
  add(x) {
    if (this.on) this.v.push(x);
  }
}

const metrics = {
  series: new Map(),
  counters: new Map(),
  series_(name) {
    let s = this.series.get(name);
    if (!s) {
      this.series.set(name, (s = new Series()));
      s.on = this.recording;
    }
    return s;
  },
  count(name, n = 1) {
    if (this.recording) this.counters.set(name, (this.counters.get(name) ?? 0) + n);
  },
  recording: false,
  setRecording(on) {
    this.recording = on;
    for (const s of this.series.values()) s.on = on;
  },
};
const errorSamples = new Map();
function noteError(hub, e) {
  const k = `${hub}:${e?.code ?? e?.message ?? JSON.stringify(e)}`;
  errorSamples.set(k, (errorSamples.get(k) ?? 0) + 1);
}
const lat = (name, ms) => metrics.series_(name).add(ms);

// ─── Seeding ─────────────────────────────────────────────────────

async function withPg(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: opts.db });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const USER_PREFIX = 'perfhub-';

// Exact, hardware-independent DB pressure over the window: committed
// transactions and inserted tuples in the hub database (pg_stat_database), plus
// the chat-table row count. Stats are flushed by Postgres about once a second,
// so a short settle precedes each read.
async function dbCounters() {
  await sleep(1500);
  return withPg(async (db) => {
    const r = await db.query(
      `SELECT xact_commit::bigint AS commits, tup_inserted::bigint AS inserted FROM pg_stat_database WHERE datname = current_database()`,
    );
    return { commits: Number(r.rows[0].commits), inserted: Number(r.rows[0].inserted) };
  });
}

async function seedUsers(count) {
  await withPg(async (db) => {
    const have = await db.query(`SELECT count(*)::int AS n FROM "user" WHERE id LIKE $1`, [`${USER_PREFIX}%`]);
    for (let i = have.rows[0].n; i < count; i++) {
      const id = `${USER_PREFIX}${i}`;
      await db.query(
        `INSERT INTO "user" (id, name, username, handle, email, "emailVerified", "updatedAt")
         VALUES ($1, $2, $3, $3, $4, true, now()) ON CONFLICT (id) DO NOTHING`,
        [id, `Perf User ${i}`, `perfhub${i}`, `perfhub${i}@example.invalid`],
      );
    }
    // One long-lived session per user. Tokens are random; rows are keyed by the
    // user so re-seeding is idempotent.
    for (let i = 0; i < count; i++) {
      const id = `${USER_PREFIX}${i}`;
      const exists = await db.query(`SELECT 1 FROM "session" WHERE id = $1`, [`sess-${id}`]);
      if (exists.rowCount) continue;
      await db.query(
        `INSERT INTO "session" (id, "userId", token, "expiresAt", "updatedAt")
         VALUES ($1, $2, $3, now() + interval '30 days', now())`,
        [`sess-${id}`, id, randomBytes(24).toString('hex')],
      );
    }
    // Coin balances for the casino scenario.
    const prof = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'profile' AND column_name = 'coins'`,
    );
    return prof.rowCount;
  });
}

async function loadTokens(count) {
  return withPg(async (db) => {
    const r = await db.query(
      `SELECT s."userId", s.token FROM "session" s WHERE s."userId" LIKE $1 ORDER BY s."userId"`,
      [`${USER_PREFIX}%`],
    );
    const rows = r.rows
      .map((x) => ({ n: Number(String(x.userId).slice(USER_PREFIX.length)), userId: x.userId, token: x.token }))
      .sort((a, b) => a.n - b.n)
      .slice(0, count);
    if (rows.length < count) {
      throw new Error(`need ${count} seeded users, have ${rows.length}; run: node scripts/perf/socket-bench.mjs --seed ${count}`);
    }
    return rows;
  });
}

// ─── Socket plumbing ─────────────────────────────────────────────

let ioClient;
async function connect(url, path, user) {
  ioClient ??= (await import('socket.io-client')).io;
  const socket = ioClient(url, {
    path,
    transports: ['websocket'],
    auth: { token: user.token },
    reconnection: false,
    forceNew: true,
  });
  socket.__userId = user.userId;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`connect timeout ${url}${path}`)), 15_000);
    socket.once('connect', () => (clearTimeout(t), resolve()));
    socket.once('connect_error', (e) => (clearTimeout(t), reject(new Error(`connect_error ${url}: ${e.message}`))));
  });
  return socket;
}

function once(socket, event, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => (socket.off(event, h), reject(new Error(`timeout waiting for ${event}`))), timeoutMs);
    const h = (p) => (clearTimeout(t), resolve(p));
    socket.once(event, h);
  });
}

async function probe(baseUrl, reset) {
  try {
    const r = await fetch(`${baseUrl}/__perf${reset ? '/reset' : ''}`, { method: reset ? 'POST' : 'GET' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

// ─── Scenarios ───────────────────────────────────────────────────
// Each returns { sockets, stop(), describe } after the scenario is set up and
// its steady-state timers are running.

const timers = [];
const every = (ms, fn, jitter = true) => {
  const t0 = setTimeout(
    () => timers.push(setInterval(fn, ms)),
    jitter ? Math.random() * ms : 0,
  );
  timers.push(t0);
};

// ── rmhtube: rooms of leader + members, leader host_state every 2s, members
// ping/stall-free, chat. The server's 2s heartbeat is the broadcast under test.
async function setupTube(users) {
  const path = '/rmhtube-ws/';
  const sockets = [];
  let u = 0;
  for (let r = 0; r < opts.rooms; r++) {
    const room = users.slice(u, u + opts.members);
    u += opts.members;
    const socks = await inBatches(room, 6, (x) => connect(opts.tubeUrl, path, x));
    sockets.push(...socks);
    const leader = socks[0];
    const created = once(leader, 'rmhtube:room:created');
    leader.emit('rmhtube:room:create', { settings: { isPublic: false } });
    const { roomId } = await created;
    for (const s of socks.slice(1)) {
      s.emit('rmhtube:room:join', { roomId });
    }
    await sleep(150);
    leader.emit('rmhtube:queue:add', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    await sleep(100);

    for (const s of socks) {
      s.on('rmhtube:sync:state', () => metrics.count('tube.sync_state_in'));
      s.on('rmhtube:error', (e) => (metrics.count('tube.error_in'), noteError('tube', e)));
      s.on('rmhtube:room:action', (a) => {
        metrics.count('tube.action_in');
        if (a.type === 'CHAT_MESSAGE' && a.payload.content.startsWith('b:')) {
          lat('tube.chat_broadcast_ms', now() - Number(a.payload.content.slice(2)));
        }
      });
    }
    every(2000, () => {
      leader.emit('rmhtube:sync:host_state', {
        playing: true,
        currentTime: 12 + now() / 1000,
        playbackRate: 1,
        timestamp: Date.now(),
        stalled: false,
        live: false,
      });
    });
    for (const s of socks) {
      every(5000, () => s.emit('rmhtube:sync:ping', { clientTime: Date.now() }));
      every(opts.chatEveryMs, () => s.emit('rmhtube:room:chat', { content: `b:${now()}` }));
    }
  }
  return { sockets };
}

// ── rmhmusic (mounted on the socket-server): host play + periodic seek,
// members chat. Heartbeat (5s) is the broadcast under test.
async function setupMusic(users) {
  const path = '/socket/';
  const sockets = [];
  let u = 0;
  for (let r = 0; r < opts.rooms; r++) {
    const room = users.slice(u, u + opts.members);
    u += opts.members;
    const socks = await inBatches(room, 6, (x) => connect(opts.socketUrl, path, x));
    sockets.push(...socks);
    const host = socks[0];
    const created = once(host, 'rmhmusic:room:created');
    host.emit('rmhmusic:room:create', { name: `perf-${r}`, isPublic: false });
    const { code } = await created;
    for (const s of socks.slice(1)) s.emit('rmhmusic:room:join', { code });
    await sleep(150);
    host.emit('rmhmusic:music:play', {
      trackUri: 'spotify:track:perf',
      positionMs: 0,
      track: {
        spotifyUri: 'spotify:track:perf',
        title: 'Perf Track',
        artist: 'Bench',
        albumArt: 'https://example.invalid/a.png',
        durationMs: 240000,
      },
    });
    for (const s of socks) {
      s.on('rmhmusic:sync:heartbeat', () => metrics.count('music.heartbeat_in'));
      s.on('rmhmusic:room:action', (a) => {
        metrics.count('music.action_in');
        if (a.type === 'CHAT_MESSAGE' && a.payload.content.startsWith('b:')) {
          lat('music.chat_broadcast_ms', now() - Number(a.payload.content.slice(2)));
        }
      });
      s.on('rmhmusic:music:seek', () => metrics.count('music.seek_in'));
    }
    every(3000, () => host.emit('rmhmusic:music:seek', { positionMs: Math.floor(now()) % 200000 }));
    for (const s of socks) every(opts.chatEveryMs, () => s.emit('rmhmusic:room:chat', { content: `b:${now()}` }));
  }
  return { sockets };
}

// ── rmhbox: lobbies with N players; chat + a picked minigame driven through
// settings/instructions/preload/countdown to PLAYING, then game inputs.
async function setupBox(users) {
  const path = '/rmhbox-ws/';
  const sockets = [];
  let u = 0;
  for (let l = 0; l < opts.lobbies; l++) {
    const group = users.slice(u, u + opts.lobbyPlayers);
    u += opts.lobbyPlayers;
    const socks = await inBatches(group, 6, (x) => connect(opts.boxUrl, path, x));
    sockets.push(...socks);
    const host = socks[0];
    const created = once(host, 'rmhbox:lobby:created');
    host.emit('rmhbox:lobby:create', { settings: { isPublic: false, maxPlayers: 16 } });
    const { lobbyId } = await created;
    for (const s of socks.slice(1)) s.emit('rmhbox:lobby:join', { lobbyId });
    await sleep(200);

    let state = 'WAITING';
    for (const s of socks) {
      s.on('rmhbox:lobby:state_snapshot', (st) => {
        metrics.count('box.snapshot_in');
        state = st.state;
      });
      s.on('rmhbox:game:action', (a) => {
        metrics.count('box.action_in');
        if (a.type === 'STATE_CHANGED') state = a.payload.state;
        if (a.type === 'CHAT_MESSAGE' && String(a.payload.content).startsWith('b:')) {
          lat('box.chat_broadcast_ms', now() - Number(a.payload.content.slice(2)));
        }
      });
      s.on('rmhbox:game:preload_start', () => s.emit('rmhbox:game:ready_to_render', { lobbyId }));
      s.on('rmhbox:error', (e) => (metrics.count('box.error_in'), noteError('box', e)));
      for (const ev of ['rmhbox:game:state_snapshot', 'rmhbox:game:started', 'rmhbox:game:countdown']) {
        s.on(ev, () => metrics.count('box.game_event_in'));
      }
    }
    for (const s of socks) {
      every(Math.max(opts.chatEveryMs, 3100), () =>
        s.emit('rmhbox:lobby:chat', { lobbyId, content: `b:${now()}` }),
      );
    }
    // Drive the lobby: pick a game, then push the host through each gate.
    host.emit('rmhbox:game:select', { lobbyId, minigameId: 'emoji-cinema' });
    timers.push(
      setInterval(() => {
        if (state === 'GAME_SETTINGS') host.emit('rmhbox:game:confirm_settings', { lobbyId });
        else if (['INSTRUCTIONS', 'PRELOADING', 'COUNTDOWN'].includes(state))
          host.emit('rmhbox:game:force_skip', { lobbyId });
        else if (state === 'ROUND_RESULTS' || state === 'SESSION_RESULTS' || state === 'WAITING')
          host.emit('rmhbox:game:select', { lobbyId, minigameId: 'emoji-cinema' });
      }, 1500),
    );
    for (const s of socks) {
      every(1000, () => {
        if (state === 'PLAYING') s.emit('rmhbox:game:input', { lobbyId, action: 'SUBMIT_GUESS', data: { guess: 'perf' } });
      });
    }
  }
  return { sockets };
}

// ── casino: public-table seating + bets. Table broadcasts are the load; money
// is real ledger writes against the hub DB.
async function setupCasino(users) {
  const path = '/socket/';
  const sockets = [];
  let u = 0;
  await withPg(async (db) => {
    // Give every casino user coins so bets clear. Column/table names per schema.
    await db.query(
      `INSERT INTO "user_profile" (id, "userId", coins, "updatedAt")
       SELECT 'prof-' || id, id, 1000000, now() FROM "user" WHERE id LIKE $1
       ON CONFLICT ("userId") DO UPDATE SET coins = 1000000`,
      [`${USER_PREFIX}%`],
    );
  });
  for (let t = 0; t < opts.tables; t++) {
    const group = users.slice(u, u + opts.seatsPerTable);
    u += opts.seatsPerTable;
    const socks = await inBatches(group, 6, (x) => connect(opts.socketUrl, path, x));
    sockets.push(...socks);
    const owner = socks[0];
    const created = once(owner, 'bj:room_created');
    owner.emit('bj:create_room', { name: `perf-${t}`, privacy: 'unlisted', maxPlayers: 6 });
    const room = await created.catch(() => null);
    const roomId = room?.roomId;
    const joinCode = room?.joinCode;
    if (!roomId) continue;
    for (const s of socks.slice(1)) s.emit('bj:join_room', { roomId, joinCode });
    await sleep(200);
    for (const s of socks) {
      let betRound = -1;
      let actedKey = '';
      s.on('bj:table_state', (st) => {
        metrics.count('casino.table_state_in');
        const me = st.players?.find((p) => p.userId === s.__userId);
        if (!me) return;
        if (st.phase === 'betting' && me.status === 'waiting' && betRound !== st.roundNumber) {
          betRound = st.roundNumber;
          setTimeout(() => s.emit('bj:place_bet', { amount: 10 }), 100 + Math.random() * 400);
        } else if (st.phase === 'insurance') {
          s.emit('bj:decline_insurance');
        } else if (st.currentTurnUserId === s.__userId) {
          const key = `${st.roundNumber}:${me.hand?.length}:${me.status}`;
          if (key !== actedKey) {
            actedKey = key;
            setTimeout(() => s.emit(Math.random() < 0.3 ? 'bj:hit' : 'bj:stand'), 150 + Math.random() * 350);
          }
        }
      });
      s.on('bj:error', (e) => (metrics.count('casino.error_in'), noteError('casino', e)));
      s.on('bj:round_results', () => metrics.count('casino.round_results_in'));
    }
  }
  return { sockets };
}


// ── storm: a reconnection storm. N authenticated clients connect to each hub at
// once (a deploy or a network blip), then disconnect. Measures connect latency
// (TCP + upgrade + auth middleware + per-connection handler registration) and
// the hub's event-loop delay while it happens. Measured on its own, outside the
// steady-state window: see runStorm().
async function runStorm(users) {
  const out = {};
  for (const [name, url, path] of [
    ['socket', opts.socketUrl, '/socket/'],
    ['tube', opts.tubeUrl, '/rmhtube-ws/'],
    ['box', opts.boxUrl, '/rmhbox-ws/'],
  ]) {
    await probe(url, true);
    const samples = [];
    const socks = [];
    const t0 = now();
    await Promise.all(
      users.map(async (u) => {
        const a = now();
        try {
          const s = await connect(url, path, u);
          samples.push(now() - a);
          socks.push(s);
        } catch {
          noteError(name, { code: 'storm_connect_failed' });
        }
      }),
    );
    const wall = now() - t0;
    const p = await probe(url, false);
    out[name] = { clients: users.length, connected: socks.length, wallMs: Math.round(wall), connect: summarize(samples), eld: p };
    for (const s of socks) s.disconnect();
    await sleep(500);
  }
  return out;
}


// ── micro: fan-out strategy. In-process socket.io server + real clients; times
// the server CPU of emitting one payload to R recipients N times, per-socket
// `socket.emit` loop vs one `io.to(ids).emit`. Used by WS5 to justify replacing
// per-recipient emit loops (docs/server-perf-2026-10-21/results/ws-5.md).
//   node scripts/perf/socket-bench.mjs --micro-emit --recipients 6 --iters 20000
async function microEmit() {
  const { Server } = await import('socket.io');
  const { createServer } = await import('node:http');
  const R = num('recipients', 6);
  const iters = num('iters', 20000);
  const kind = String(flag('payload', 'farm'));
  const payload =
    kind === 'presence'
      ? { players: Array.from({ length: R }, (_, i) => ({ userId: `u${i}`, name: `Player ${i}`, x: 1.5 * i, z: 3.25, dir: 1, energy: 80 })) }
      : { id: 'f', grid: 24, tiles: Array.from({ length: 576 }, (_, i) => ({ t: 'soil', c: i % 3 ? null : { id: 'wheat', stage: i % 5 } })), seeds: {}, inventory: {}, tools: {} };
  const httpServer = createServer();
  const io = new Server(httpServer, { transports: ['websocket'] });
  await new Promise((r) => httpServer.listen(0, r));
  const port = httpServer.address().port;
  const clients = [];
  let received = 0;
  for (let i = 0; i < R; i++) {
    const c = (await import('socket.io-client')).io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    c.on('x', () => received++);
    await new Promise((r) => c.on('connect', r));
    clients.push(c);
  }
  await sleep(100);
  const ids = [...io.sockets.sockets.keys()];
  const sockets = ids.map((id) => io.sockets.sockets.get(id));
  const run = async (label, fn) => {
    for (let i = 0; i < 500; i++) fn();
    await sleep(200);
    const t0 = process.cpuUsage();
    for (let i = 0; i < iters; i++) fn();
    const cpu = process.cpuUsage(t0);
    await sleep(500);
    return { label, serverCpuUsPerEmit: Math.round(((cpu.user + cpu.system) / iters) * 100) / 100 };
  };
  const a1 = await run('per-socket loop', () => { for (const s of sockets) s.emit('x', payload); });
  const b1 = await run('io.to(ids)', () => { io.to(ids).emit('x', payload); });
  const a2 = await run('per-socket loop', () => { for (const s of sockets) s.emit('x', payload); });
  const b2 = await run('io.to(ids)', () => { io.to(ids).emit('x', payload); });
  console.log(`payload=${kind} recipients=${R} iters=${iters} (server CPU us per fan-out, A B A B)`);
  for (const r of [a1, b1, a2, b2]) console.log(`  ${r.label.padEnd(16)} ${r.serverCpuUsPerEmit}`);
  clients.forEach((c) => c.disconnect());
  io.close();
}

const SCENARIOS = {
  tube: { url: () => opts.tubeUrl, need: () => opts.rooms * opts.members, setup: setupTube },
  music: { url: () => opts.socketUrl, need: () => opts.rooms * opts.members, setup: setupMusic },
  box: { url: () => opts.boxUrl, need: () => opts.lobbies * opts.lobbyPlayers, setup: setupBox },
  casino: { url: () => opts.socketUrl, need: () => opts.tables * opts.seatsPerTable, setup: setupCasino },
};

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  if (flag('micro-emit', false)) return microEmit();
  const seed = flag('seed', false);
  if (seed) {
    const n = Number(seed) || 400;
    await seedUsers(n);
    console.log(`seeded ${n} users + sessions in ${opts.db}`);
    return;
  }

  if (opts.hubs.length === 1 && opts.hubs[0] === 'storm') {
    const users = await loadTokens(opts.storm);
    const storm = await runStorm(users);
    for (const [k, v] of Object.entries(storm)) {
      const e = v.eld?.eld;
      const cpu = v.eld ? (v.eld.cpuMs.user + v.eld.cpuMs.system).toFixed(0) : '?';
      console.log(`[storm:${k}] ${v.connected}/${v.clients} connected in ${v.wallMs} ms  connect p50 ${v.connect.p50} p95 ${v.connect.p95} max ${v.connect.max}  eld p99 ${e?.p99?.toFixed(1)} max ${e?.max?.toFixed(1)}  cpu ${cpu} ms`);
    }
    if (opts.out) writeFileSync(String(opts.out), JSON.stringify({ label: opts.label, storm }, null, 2));
    return;
  }

  const need = opts.hubs.reduce((n, h) => n + SCENARIOS[h].need(), 0);
  const users = await loadTokens(Math.max(need, 1));

  // Each hub gets its own slice of users so one user is never in two hubs'
  // tables at once (socket-server hosts music + casino together, so they must
  // not share users).
  const results = { label: opts.label, at: new Date().toISOString(), opts: { ...opts, db: undefined }, hubs: {} };
  const allSockets = [];
  const hubUrls = { tube: opts.tubeUrl, music: opts.socketUrl, box: opts.boxUrl, casino: opts.socketUrl };

  let offset = 0;
  for (const hub of opts.hubs) {
    const sc = SCENARIOS[hub];
    const slice = users.slice(offset, offset + sc.need());
    offset += sc.need();
    if (slice.length < sc.need()) throw new Error(`not enough seeded users for ${hub}`);
    // let sockets know their own id for turn detection
    const res = await sc.setup(slice);
    allSockets.push(...res.sockets);
    console.log(`[${hub}] ${res.sockets.length} clients up`);
  }

  console.log(`warmup ${opts.warmup}s ...`);
  await sleep(opts.warmup * 1000);

  const urls = [...new Set(Object.values(hubUrls))];
  await Promise.all(urls.map((u) => probe(u, true)));
  const db0 = await dbCounters();
  await Promise.all(urls.map((u) => probe(u, true)));
  metrics.setRecording(true);
  const t0 = now();
  await sleep(opts.duration * 1000);
  const elapsedS = (now() - t0) / 1000;
  metrics.setRecording(false);
  await sleep(1500); // let the hubs' batch writers flush into the window
  const db1 = await dbCounters();
  const probes = {};
  for (const u of urls) probes[u] = await probe(u, false);

  for (const hub of opts.hubs) {
    const prefix = `${hub}.`;
    const h = { eld: probes[hubUrls[hub]] ?? null, latency: {}, events_per_s: {} };
    for (const [name, s] of metrics.series) if (name.startsWith(prefix)) h.latency[name] = summarize(s.v);
    for (const [name, n] of metrics.counters)
      if (name.startsWith(prefix)) h.events_per_s[name] = Math.round((n / elapsedS) * 10) / 10;
    results.hubs[hub] = h;
  }
  results.elapsedS = Math.round(elapsedS * 10) / 10;
  results.db = {
    commitsPerS: Math.round(((db1.commits - db0.commits) / elapsedS) * 10) / 10,
    insertedPerS: Math.round(((db1.inserted - db0.inserted) / elapsedS) * 10) / 10,
  };

  for (const t of timers) (clearInterval(t), clearTimeout(t));
  for (const s of allSockets) s.disconnect();

  print(results);
  if (opts.out) writeFileSync(String(opts.out), JSON.stringify(results, null, 2));
}

function print(r) {
  for (const [k, n] of errorSamples) console.log(`  error ${k} x${n}`);
  console.log(`\n== ${r.label} (${r.elapsedS}s window) ==`);
  if (r.db) console.log(`  db (hub database): ${r.db.commitsPerS} commits/s, ${r.db.insertedPerS} tuples inserted/s`);
  for (const [hub, h] of Object.entries(r.hubs)) {
    const e = h.eld;
    console.log(`\n[${hub}]`);
    if (e) {
      console.log(
        `  event-loop delay ms  p50 ${e.eld.p50.toFixed(2)}  p95 ${e.eld.p95.toFixed(2)}  p99 ${e.eld.p99.toFixed(2)}  max ${e.eld.max.toFixed(2)}   cpu ${(e.cpuMs.user + e.cpuMs.system).toFixed(0)} ms / ${e.windowMs.toFixed(0)} ms   rss ${(e.rssBytes / 1048576).toFixed(0)} MB`,
      );
    } else console.log('  (no probe — start the hub with RMH_PERF_HUB=1)');
    for (const [k, v] of Object.entries(h.latency)) console.log(`  ${k.padEnd(26)} n=${v.n}  p50 ${v.p50}  p95 ${v.p95}  p99 ${v.p99}  max ${v.max}`);
    for (const [k, v] of Object.entries(h.events_per_s)) console.log(`  ${k.padEnd(26)} ${v}/s`);
  }
}

function compare(a, b) {
  const rows = [['hub', 'metric', a.label, b.label, 'delta']];
  if (a.db && b.db) {
    rows.push(['db', 'commits/s', a.db.commitsPerS, b.db.commitsPerS, `${(((b.db.commitsPerS - a.db.commitsPerS) / a.db.commitsPerS) * 100).toFixed(0)}%`]);
    rows.push(['db', 'tuples inserted/s', a.db.insertedPerS, b.db.insertedPerS, `${(((b.db.insertedPerS - a.db.insertedPerS) / a.db.insertedPerS) * 100).toFixed(0)}%`]);
  }
  const fmt = (x) => (x === null || x === undefined ? 'n/a' : String(Math.round(x * 100) / 100));
  const d = (x, y) => (x && y !== undefined && y !== null ? `${(((y - x) / x) * 100).toFixed(0)}%` : '');
  for (const hub of Object.keys(b.hubs)) {
    const ha = a.hubs[hub];
    const hb = b.hubs[hub];
    if (!ha) continue;
    const ea = ha.eld, eb = hb.eld;
    if (ea && eb) {
      for (const k of ['p50', 'p95', 'p99', 'max']) rows.push([hub, `eld ${k} ms`, fmt(ea.eld[k]), fmt(eb.eld[k]), d(ea.eld[k], eb.eld[k])]);
      const ca = ea.cpuMs.user + ea.cpuMs.system, cb = eb.cpuMs.user + eb.cpuMs.system;
      rows.push([hub, 'cpu ms/s', fmt((ca / ea.windowMs) * 1000), fmt((cb / eb.windowMs) * 1000), d(ca / ea.windowMs, cb / eb.windowMs)]);
      rows.push([hub, 'rss MB', fmt(ea.rssBytes / 1048576), fmt(eb.rssBytes / 1048576), d(ea.rssBytes, eb.rssBytes)]);
    }
    for (const k of Object.keys(hb.latency)) {
      for (const p of ['p50', 'p95', 'p99']) rows.push([hub, `${k} ${p}`, fmt(ha.latency[k]?.[p]), fmt(hb.latency[k][p]), d(ha.latency[k]?.[p], hb.latency[k][p])]);
    }
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  for (const [i, r] of rows.entries()) {
    console.log('| ' + r.map((c, j) => String(c).padEnd(w[j])).join(' | ') + ' |');
    if (i === 0) console.log('|' + w.map((x) => '-'.repeat(x + 2)).join('|') + '|');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
