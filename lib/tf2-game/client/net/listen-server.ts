/**
 * The listen server: offline play against bots with the online code path.
 * A `MatchRunner` hosting a `Tf2MatchHost` runs in a Web Worker
 * (./listen-worker.ts); the page talks to it with the same bytes it would
 * send the hub — packed input packets in, snapshots and reliable batches out —
 * so every offline session exercises the real codecs, prediction and
 * interpolation. There is no added latency: a packet crosses one postMessage.
 *
 * This file is environment-agnostic:
 *   - `ListenServer` is the worker side (any thread with timers);
 *   - `connectListenServer(port, handlers)` is the page side over any
 *     postMessage endpoint (a Worker, a MessagePort, or a test double);
 *   - `httpObjectLoader(base)` reads map packages over fetch.
 */

import { TICK_INTERVAL } from '../../core/constants';
import type { JoinedPayload } from '../../net/events';
import type {
  MatchCommand,
  MatchHost,
  MatchOptions,
  PlayerInfo,
  RoomSummary,
} from '../../server/match-host';
import { MatchRunner, type MatchRunnerOptions } from '../../server/match-runner';
import type { CloseReason, FromWorker } from '../../server/worker-protocol';
import type { GameObjectLoader } from '../../server/tf2-match-host';
import type { Catalog } from '../../../tf2-loadout/catalog-types';

/** The local human's player id on the listen server (the hub's ids start at 1 too). */
export const LISTEN_PLAYER_ID = 1;

/**
 * How the page wants the match hosted. Offline play skips the team menu
 * (`autoTeam`); a peer-to-peer host plays TF2's menus and holds snapshots to
 * the DataChannel budget (`snapshotMaxBytes`, net/p2p/wire.ts).
 */
export interface ListenHostOptions {
  autoTeam?: boolean;
  snapshotMaxBytes?: number;
  /**
   * Peer-to-peer hosting: the worker keeps the room's clock — an `upkeep` message every `upkeepMs`
   * (the page's links and the hub digest run on it: a worker's timers keep their pace while the
   * host's tab is in the background, the page's do not) and a migration `checkpoint` every
   * `checkpointMs` and on round changes.
   */
  p2p?: { upkeepMs: number; checkpointMs: number };
  /** Host migration: start from this checkpoint (net/p2p `checkpoint`, packed) instead of a fresh match. */
  restore?: ArrayBuffer;
}

/** What the listen server lends the match it builds. */
export interface ListenControls {
  /** host_timescale: pace the runner's ticks. */
  setTimescale(scale: number): void;
  /** The local player's id (the console's admin). */
  localPlayerId: number;
}

/** Builds the listen server's match (the worker supplies the real one). */
export type ListenFactory = (opts: MatchOptions, host: ListenHostOptions, controls: ListenControls) => Promise<MatchHost>;

/** Writes a match down for a migration (the worker supplies it; null when the match cannot be). */
export type ListenCheckpointer = (host: MatchHost) => Promise<{ data: ArrayBuffer; tick: number } | null>;

/** Page → worker. */
export type ToListenServer =
  | {
      t: 'start';
      opts: MatchOptions;
      playerName: string;
      userId?: string;
      host?: ListenHostOptions;
      /** The local player's id (a migrated host keeps the seat it had as a member). Default LISTEN_PLAYER_ID. */
      localPlayerId?: number;
    }
  | { t: 'input'; data: ArrayBuffer }
  | { t: 'command'; cmd: MatchCommand }
  /** The player's pause menu (or the in-game HUD editor): the match holds still. */
  | { t: 'pause'; paused: boolean }
  /** The item schema (the loadout catalog) for items beyond stock and the equip checks (sim/items). */
  | { t: 'items'; catalog: Catalog | null }
  /** `changelevel` from the host (offline or peer-to-peer): the match moves to a published map. */
  | { t: 'changelevel'; map: string }
  /** Write a migration checkpoint now (a planned hand-over, a round change). */
  | { t: 'checkpoint' }
  /**
   * Peer-to-peer hosting: remote players, already validated by the page's
   * host session (net/p2p/host-session.ts) exactly as the hub validates its sockets.
   */
  | { t: 'peer-add'; playerId: number; info: PlayerInfo }
  | { t: 'peer-remove'; playerId: number }
  | { t: 'peer-input'; playerId: number; data: ArrayBuffer }
  | { t: 'peer-command'; playerId: number; cmd: MatchCommand }
  | { t: 'peer-resync'; playerId: number }
  | { t: 'stop' };

/** One packet for a remote player (or every one: `to: 'all'`). */
export interface PeerPacket {
  to: number | 'all';
  reliable: boolean;
  data: ArrayBuffer;
}

/** Worker → page. */
export type FromListenServer =
  | { t: 'joined'; info: JoinedPayload }
  | { t: 'snapshot'; data: ArrayBuffer }
  | { t: 'events'; data: ArrayBuffer }
  | { t: 'summary'; summary: RoomSummary }
  /** Packets for remote players from one tick, in order (buffers transferred). */
  | { t: 'peer-frame'; tick: number; packets: PeerPacket[] }
  /** Peer-to-peer: the room's heartbeat (links, the hub digest), from the worker's unthrottled timer. */
  | { t: 'upkeep' }
  /** Peer-to-peer: a packed migration checkpoint for the successor. */
  | { t: 'checkpoint'; data: ArrayBuffer; tick: number }
  | { t: 'closed'; reason: CloseReason; message?: string };

export type ListenSink = (message: FromListenServer, transfer: ArrayBuffer[]) => void;

export interface ListenServerOptions extends Partial<Omit<MatchRunnerOptions, 'factory' | 'post'>> {
  checkpointer?: ListenCheckpointer;
  /** Interval timers (tests pass fakes). Default setInterval / clearInterval. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/** The worker side: one match, the local human, and (when hosting peer-to-peer) remote ones. */
export class ListenServer {
  private readonly runner: MatchRunner;
  private opts: MatchOptions | null = null;
  private hostOptions: ListenHostOptions = {};
  private started = false;
  private paused = false;
  private localId = LISTEN_PLAYER_ID;
  private readonly timers: unknown[] = [];
  private lastRoundState: string | null = null;
  private checkpointing = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    factory: ListenFactory,
    private readonly sink: ListenSink,
    private readonly options: ListenServerOptions = {},
  ) {
    const { checkpointer: _c, setInterval: si, clearInterval: ci, ...runnerOptions } = options;
    void _c;
    this.setTimer = si ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = ci ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.runner = new MatchRunner({
      ...runnerOptions,
      factory: (opts) =>
        factory(opts, this.hostOptions, {
          setTimescale: (scale) => this.runner.setTimescale(scale),
          localPlayerId: this.localId,
        }),
      // Nobody else in the room: close only when the page says so.
      emptyGraceMs: runnerOptions.emptyGraceMs ?? Number.MAX_SAFE_INTEGER,
      post: (message) => this.onRunner(message),
    });
  }

  /** The runner (tests pump it with a fake clock). */
  get matchRunner(): MatchRunner {
    return this.runner;
  }

  /** The local player's id on this server. */
  get localPlayerId(): number {
    return this.localId;
  }

  handle(message: ToListenServer): void {
    const id = this.opts?.matchId ?? '';
    const local = this.localId;
    switch (message.t) {
      case 'start':
        if (this.started) return;
        this.started = true;
        this.opts = message.opts;
        this.hostOptions = message.host ?? {};
        this.localId = message.localPlayerId ?? LISTEN_PLAYER_ID;
        this.runner.handle({ t: 'create', matchId: message.opts.matchId, opts: message.opts });
        // A restored match already has the local player's seat (the checkpoint's).
        if (!this.hostOptions.restore) {
          this.runner.handle({
            t: 'add',
            matchId: message.opts.matchId,
            playerId: this.localId,
            info: { name: message.playerName, userId: message.userId },
          });
        } else {
          this.runner.handle({ t: 'resync', matchId: message.opts.matchId, playerId: this.localId });
        }
        if (this.hostOptions.p2p) this.startP2pTimers(this.hostOptions.p2p);
        return;
      case 'input':
        // Nothing the player does while paused reaches the match.
        if (this.paused) return;
        this.runner.handle({ t: 'input', matchId: id, playerId: local, data: message.data });
        return;
      case 'command':
        this.runner.handle({ t: 'command', matchId: id, playerId: local, cmd: message.cmd });
        return;
      case 'items':
        this.runner.handle({ t: 'items', catalog: message.catalog });
        return;
      case 'pause':
        this.paused = message.paused;
        this.runner.setPaused(message.paused);
        return;
      case 'changelevel':
        this.runner.handle({ t: 'changelevel', matchId: id, map: message.map });
        return;
      case 'checkpoint':
        void this.writeCheckpoint();
        return;
      case 'peer-add':
        if (message.playerId === local) return;
        this.runner.handle({ t: 'add', matchId: id, playerId: message.playerId, info: message.info });
        return;
      case 'peer-remove':
        if (message.playerId === local) return;
        this.runner.handle({ t: 'remove', matchId: id, playerId: message.playerId });
        return;
      case 'peer-input':
        if (message.playerId === local) return;
        this.runner.handle({ t: 'input', matchId: id, playerId: message.playerId, data: message.data });
        return;
      case 'peer-command':
        if (message.playerId === local) return;
        this.runner.handle({ t: 'command', matchId: id, playerId: message.playerId, cmd: message.cmd });
        return;
      case 'peer-resync':
        if (message.playerId === local) return;
        this.runner.handle({ t: 'resync', matchId: id, playerId: message.playerId });
        return;
      case 'stop':
        for (const t of this.timers.splice(0)) this.clearTimer(t);
        this.runner.shutdown();
        return;
    }
  }

  /** The room's heartbeat and the migration checkpoints, on the worker's own timers. */
  private startP2pTimers(p2p: NonNullable<ListenHostOptions['p2p']>): void {
    this.timers.push(this.setTimer(() => this.sink({ t: 'upkeep' }, []), Math.max(20, p2p.upkeepMs)));
    if (p2p.checkpointMs > 0 && this.options.checkpointer) {
      this.timers.push(this.setTimer(() => void this.writeCheckpoint(), Math.max(250, p2p.checkpointMs)));
    }
  }

  /** One packed checkpoint of the match (skipped while one is being written). */
  async writeCheckpoint(): Promise<void> {
    const host = this.opts ? this.runner.hostOf(this.opts.matchId) : null;
    if (!host || !this.options.checkpointer || this.checkpointing) return;
    this.checkpointing = true;
    try {
      const cp = await this.options.checkpointer(host);
      if (cp) this.sink({ t: 'checkpoint', data: cp.data, tick: cp.tick }, [cp.data]);
    } catch {
      /* a match that cannot be written down this time: the next try may */
    } finally {
      this.checkpointing = false;
    }
  }

  private onRunner(message: FromWorker): void {
    const opts = this.opts;
    const local = this.localId;
    switch (message.t) {
      case 'created':
        if (!opts) return;
        this.sink(
          {
            t: 'joined',
            info: {
              code: opts.matchId,
              playerId: local,
              map: opts.map,
              mode: opts.mode,
              name: opts.name,
              maxPlayers: opts.maxPlayers,
              serverTick: message.tick,
              tickInterval: message.tickInterval || TICK_INTERVAL,
            },
          },
          [],
        );
        return;
      case 'frames':
        for (const frame of message.frames) {
          const remote: PeerPacket[] = [];
          const transfer: ArrayBuffer[] = [];
          for (const p of frame.packets) {
            if (p.to !== local) {
              // A broadcast goes to the page and to every peer: the page's copy is its own.
              const data = p.to === 'all' ? p.data.slice(0) : p.data;
              remote.push({ to: p.to, reliable: p.reliable, data });
              transfer.push(data);
            }
            if (p.to !== 'all' && p.to !== local) continue;
            this.sink(
              p.reliable ? { t: 'events', data: p.data } : { t: 'snapshot', data: p.data },
              [p.data],
            );
          }
          if (remote.length > 0) this.sink({ t: 'peer-frame', tick: frame.tick, packets: remote }, transfer);
        }
        return;
      case 'summaries':
        for (const item of message.items) {
          this.sink({ t: 'summary', summary: item.summary }, []);
          // A new round (or a new map) is a moment worth a checkpoint: a successor resumes from there.
          const state = `${item.summary.map}:${item.summary.round?.state ?? ''}`;
          if (this.hostOptions.p2p && this.lastRoundState !== null && state !== this.lastRoundState) void this.writeCheckpoint();
          this.lastRoundState = state;
        }
        return;
      case 'closed':
        this.sink({ t: 'closed', reason: message.reason, message: message.message }, []);
        return;
      default:
        return;
    }
  }
}

// ─── Page side ──────────────────────────────────────────────────────────────

/** Anything with postMessage and a message callback (Worker, MessagePort, a test pair). */
export interface PortLike<E extends { data: unknown } = { data: unknown }> {
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  onmessage: ((event: E) => void) | null;
}

export interface ListenClientHandlers {
  onJoined?(info: JoinedPayload): void;
  onSnapshot?(data: Uint8Array): void;
  onEvents?(data: Uint8Array): void;
  onSummary?(summary: RoomSummary): void;
  /** Peer-to-peer hosting: one tick's packets for the remote players. */
  onPeerFrame?(tick: number, packets: PeerPacket[]): void;
  /** Peer-to-peer hosting: the worker's heartbeat (upkeep of links and the hub digest). */
  onUpkeep?(): void;
  /** Peer-to-peer hosting: a packed migration checkpoint. */
  onCheckpoint?(data: ArrayBuffer, tick: number): void;
  onClosed?(reason: CloseReason, message?: string): void;
}

export interface ListenConnection {
  /** One packed input packet (usercmd-codec). */
  sendInput(packet: Uint8Array): void;
  command(cmd: MatchCommand): void;
  /** Hold the match still (offline play pauses; there is nobody else in it). */
  pause(paused: boolean): void;
  /** Hand the listen server the item schema (once the page has loaded the catalog). */
  items(catalog: Catalog | null): void;
  /** `changelevel`: move the match to a published map (the client reloads the level from its hello). */
  changeLevel(map: string): void;
  /** Write a migration checkpoint now (peer-to-peer hosting). */
  checkpoint(): void;
  /** Peer-to-peer hosting: remote players (validated by the host session first). */
  peers: {
    add(playerId: number, info: PlayerInfo): void;
    remove(playerId: number): void;
    input(playerId: number, packet: Uint8Array): void;
    command(playerId: number, cmd: MatchCommand): void;
    resync(playerId: number): void;
  };
  stop(): void;
}

/** Starts a match on a listen-server worker and wires its output to `handlers`. */
export function connectListenServer<E extends { data: unknown }>(
  port: PortLike<E>,
  start: { opts: MatchOptions; playerName: string; userId?: string; host?: ListenHostOptions; localPlayerId?: number },
  handlers: ListenClientHandlers,
): ListenConnection {
  port.onmessage = (event: E) => {
    const m = event.data as FromListenServer;
    switch (m?.t) {
      case 'joined':
        handlers.onJoined?.(m.info);
        break;
      case 'snapshot':
        handlers.onSnapshot?.(new Uint8Array(m.data));
        break;
      case 'events':
        handlers.onEvents?.(new Uint8Array(m.data));
        break;
      case 'summary':
        handlers.onSummary?.(m.summary);
        break;
      case 'peer-frame':
        handlers.onPeerFrame?.(m.tick, m.packets);
        break;
      case 'upkeep':
        handlers.onUpkeep?.();
        break;
      case 'checkpoint':
        handlers.onCheckpoint?.(m.data, m.tick);
        break;
      case 'closed':
        handlers.onClosed?.(m.reason, m.message);
        break;
      default:
        break;
    }
  };
  const post = (message: ToListenServer, transfer: ArrayBuffer[] = []) =>
    port.postMessage(message, transfer);
  post({ t: 'start', ...start });
  return {
    sendInput(packet: Uint8Array) {
      const copy = packet.slice().buffer as ArrayBuffer;
      post({ t: 'input', data: copy }, [copy]);
    },
    command(cmd: MatchCommand) {
      post({ t: 'command', cmd });
    },
    pause(paused: boolean) {
      post({ t: 'pause', paused });
    },
    items(catalog: Catalog | null) {
      post({ t: 'items', catalog });
    },
    changeLevel(map: string) {
      post({ t: 'changelevel', map });
    },
    checkpoint() {
      post({ t: 'checkpoint' });
    },
    peers: {
      add: (playerId, info) => post({ t: 'peer-add', playerId, info }),
      remove: (playerId) => post({ t: 'peer-remove', playerId }),
      input: (playerId, packet) => {
        const copy = packet.slice().buffer as ArrayBuffer;
        post({ t: 'peer-input', playerId, data: copy }, [copy]);
      },
      command: (playerId, cmd) => post({ t: 'peer-command', playerId, cmd }),
      resync: (playerId) => post({ t: 'peer-resync', playerId }),
    },
    stop() {
      post({ t: 'stop' });
      port.onmessage = null;
    },
  };
}

// ─── Assets over HTTP ───────────────────────────────────────────────────────

/**
 * Reads a game's asset tree over HTTP (`/api/tf2-game/assets/` — the same
 * files the hub's worker reads from object storage). 404 → null.
 */
export function httpObjectLoader(base: string, fetchImpl: typeof fetch = fetch): GameObjectLoader {
  const root = base.endsWith('/') ? base : `${base}/`;
  return {
    async get(path: string): Promise<Uint8Array | null> {
      const res = await fetchImpl(root + path);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
