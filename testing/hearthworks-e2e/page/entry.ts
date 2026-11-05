/**
 * The page every e2e player runs in a real Chromium: the REAL Hearthworks multiplayer stack, bundled by
 * esbuild (build.ts) and driven by Playwright through `window.hw`.
 *
 *   - hub client:  lib/hearthworks/net/hub-client-core.ts on the real shared realtime client + socket.io-client
 *   - transport:   `webrtcConnector()` → `DirectConnection` → real `RTCPeerConnection` + two negotiated
 *                  DataChannels → `ReliableLink` → `channelPairToLink`
 *   - sessions:    `HostSession` / `PeerSession` / `HearthworksConnector` and the game store, bound by the driver
 *
 * Nothing here models the network: ICE runs over loopback host candidates (no STUN/TURN: `iceServers: []`).
 * Only the session lookup behind the hub differs from production.
 */

import { createHearthworksStore } from '../../../lib/hearthworks/store';
import { bindConnectorToStore } from '../../../lib/hearthworks/net/driver';
import { HearthworksConnector, type HostRoomOptions } from '../../../lib/hearthworks/net/connector';
import { createHubClientWith } from '../../../lib/hearthworks/net/hub-client-core';
import { webrtcConnector } from '../../../lib/shared/p2p/connector';
import type { LocalCommand } from '../../../lib/hearthworks/store';
import { encodeSnapshot } from '../../../lib/hearthworks/net/protocol';

interface Config {
  hubUrl: string;
  token: string;
  account: { id: string; name: string };
  seed: number;
  size: number;
}

const cfg = (window as unknown as { __HW_CONFIG__: Config }).__HW_CONFIG__;

/** Canonical JSON (sorted keys): structurally equal worlds hash equal whatever order a decoder emitted keys in. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const logs: string[] = [];
const log = (msg: string) => {
  logs.push(`${Math.round(performance.now())} ${msg}`);
  if (logs.length > 400) logs.shift();
};

const store = createHearthworksStore({ seed: cfg.seed, size: cfg.size });
const hub = createHubClientWith({
  url: cfg.hubUrl,
  path: '/socket/',
  token: () => cfg.token,
  account: async () => cfg.account,
  log,
});
const connector = new HearthworksConnector({
  hub,
  peers: webrtcConnector({ iceServers: [] }),
  log,
});
bindConnectorToStore(connector, store);
let lastPhase = '';
connector.subscribe(() => {
  const l = connector.state;
  const key = `${l.phase}/${l.role}/${l.error}`;
  if (key !== lastPhase) log(`lobby ${(lastPhase = key)}`);
});

/** tick → hash of the world at that tick, recorded only when no command of this player is awaiting its ack. */
const hashes = new Map<number, string>();
const events: { type: string; reason?: string; command?: string; playerId?: string; at: number }[] = [];

function pendingCount(): number {
  const s = connector.session;
  if (s?.kind !== 'member') return 0;
  return ((s.peer as unknown as { pending?: unknown[] }).pending ?? []).length;
}

let lastTick = -1;
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = now - last;
  last = now;
  const evs = store.getState().advance(dt);
  for (const e of evs) {
    if (e.type === 'rejected') events.push({ type: e.type, reason: e.reason, command: e.command, playerId: e.playerId, at: now });
  }
  const w = store.getState().world;
  if (w.tick !== lastTick && connector.session) {
    lastTick = w.tick;
    if (pendingCount() === 0) {
      hashes.set(w.tick, fnv(canon(w)));
      if (hashes.size > 600) hashes.delete(hashes.keys().next().value as number);
    }
  }
}, 16);

const probe = {
  config: cfg,
  logs: () => [...logs],
  async host(opts: Partial<Omit<HostRoomOptions, 'world'>>): Promise<void> {
    await connector.hostRoom({
      name: opts.name ?? `${cfg.account.name}'s world`,
      maxPlayers: opts.maxPlayers ?? 4,
      world: store.getState().world,
      private: opts.private,
      password: opts.password,
    });
  },
  async join(code: string, password?: string): Promise<void> {
    await connector.joinRoom(code, password);
  },
  leave: () => connector.leave(),
  refreshRooms: () => connector.refreshRooms(),
  lobby() {
    const s = connector.state;
    return {
      phase: s.phase,
      role: s.role,
      code: s.code,
      error: s.error,
      locked: s.locked,
      rooms: s.rooms,
      me: s.me,
      players: s.players.map((p) => ({ id: p.id, host: p.host, successor: p.successor, conn: p.conn })),
    };
  },
  pendingCount,
  /** Bytes of a snapshot frame of the current world (what a joiner is sent). */
  snapshotBytes: () => encodeSnapshot(store.getState().world, {}).length,
  sessionKind: () => connector.session?.kind ?? null,
  peerReady: () => {
    const s = connector.session;
    return s?.kind === 'member' ? s.peer.ready : s?.kind === 'host';
  },
  dispatch: (cmd: LocalCommand) => store.getState().dispatch(cmd),
  summary() {
    const st = store.getState();
    const w = st.world;
    return {
      tick: w.tick,
      me: st.playerId,
      players: Object.fromEntries(Object.entries(w.players).map(([id, p]) => [id, { money: p.money, x: p.x, z: p.z }])),
      buildings: w.buildings.map((b) => `${b.kind}@${b.x},${b.z}`).sort(),
      size: w.size,
    };
  },
  hashes: () => [...hashes.entries()],
  rejected: () => [...events],
  /** Walk: a `move` command every `everyMs`, `dx` tiles further along +x each time (what the game sends at 10 Hz). */
  walk(x0: number, z: number, dx: number, steps: number, everyMs: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const id = setInterval(() => {
        store.getState().dispatch({ type: 'move', x: x0 + dx * (i + 1), z });
        if (++i >= steps) {
          clearInterval(id);
          resolve();
        }
      }, everyMs);
    });
  },
  /** Record where `id` is in the world (raw) and where it is drawn (interpolated), every ~16 ms for `ms`. */
  recordMotion(id: string, ms: number): Promise<{ raw: number[]; drawn: number[]; speed: number[] }> {
    return new Promise((resolve) => {
      const raw: number[] = [];
      const drawn: number[] = [];
      const speed: number[] = [];
      const started = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        const st = store.getState();
        const pose = st.driver?.poses?.sample(id, now);
        const p = st.world.players[id];
        if (pose && p) {
          raw.push(p.x);
          drawn.push(pose.x);
          speed.push(pose.speed);
        }
        if (now - started >= ms) {
          clearInterval(timer);
          resolve({ raw, drawn, speed });
        }
      }, 16);
    });
  },
  /** Stats from the live links (RTT, bytes, fragments) for the report. */
  linkStats() {
    const s = connector.session;
    if (s?.kind === 'member') {
      const link = (s.peer as unknown as { link?: { rttMs?: number | null; kind?: string } }).link;
      return { role: 'member', kind: link?.kind ?? null, rttMs: link?.rttMs ?? null };
    }
    if (s?.kind === 'host') return { role: 'host', peers: s.host.peerIds(), stats: s.host.stats };
    return null;
  },
  /** Kind of connection each peer reports (direct / turn / relay). */
  conn: () => connector.state.players.map((p) => ({ id: p.id, conn: p.conn })),
};

export type Probe = typeof probe;
(window as unknown as { hw: Probe }).hw = probe;
log('page ready');
