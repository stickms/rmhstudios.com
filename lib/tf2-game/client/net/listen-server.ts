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
  MatchFactory,
  MatchOptions,
  RoomSummary,
} from '../../server/match-host';
import { MatchRunner, type MatchRunnerOptions } from '../../server/match-runner';
import type { CloseReason, FromWorker } from '../../server/worker-protocol';
import type { GameObjectLoader } from '../../server/tf2-match-host';
import type { Catalog } from '../../../tf2-loadout/catalog-types';

/** The local human's player id on the listen server (the hub's ids start at 1 too). */
export const LISTEN_PLAYER_ID = 1;

/** Page → worker. */
export type ToListenServer =
  | { t: 'start'; opts: MatchOptions; playerName: string; userId?: string }
  | { t: 'input'; data: ArrayBuffer }
  | { t: 'command'; cmd: MatchCommand }
  /** The player's pause menu (or the in-game HUD editor): the match holds still. */
  | { t: 'pause'; paused: boolean }
  /** The item schema (the loadout catalog) for items beyond stock and the equip checks (sim/items). */
  | { t: 'items'; catalog: Catalog | null }
  | { t: 'stop' };

/** Worker → page. */
export type FromListenServer =
  | { t: 'joined'; info: JoinedPayload }
  | { t: 'snapshot'; data: ArrayBuffer }
  | { t: 'events'; data: ArrayBuffer }
  | { t: 'summary'; summary: RoomSummary }
  | { t: 'closed'; reason: CloseReason; message?: string };

export type ListenSink = (message: FromListenServer, transfer: ArrayBuffer[]) => void;

/** The worker side: one match, one human. */
export class ListenServer {
  private readonly runner: MatchRunner;
  private opts: MatchOptions | null = null;
  private started = false;
  private paused = false;

  constructor(
    factory: MatchFactory,
    private readonly sink: ListenSink,
    runnerOptions: Partial<Omit<MatchRunnerOptions, 'factory' | 'post'>> = {},
  ) {
    this.runner = new MatchRunner({
      ...runnerOptions,
      factory,
      // Nobody else in the room: close only when the page says so.
      emptyGraceMs: runnerOptions.emptyGraceMs ?? Number.MAX_SAFE_INTEGER,
      post: (message) => this.onRunner(message),
    });
  }

  /** The runner (tests pump it with a fake clock). */
  get matchRunner(): MatchRunner {
    return this.runner;
  }

  handle(message: ToListenServer): void {
    const id = this.opts?.matchId ?? '';
    switch (message.t) {
      case 'start':
        if (this.started) return;
        this.started = true;
        this.opts = message.opts;
        this.runner.handle({ t: 'create', matchId: message.opts.matchId, opts: message.opts });
        this.runner.handle({
          t: 'add',
          matchId: message.opts.matchId,
          playerId: LISTEN_PLAYER_ID,
          info: { name: message.playerName, userId: message.userId },
        });
        return;
      case 'input':
        // Nothing the player does while paused reaches the match.
        if (this.paused) return;
        this.runner.handle({
          t: 'input',
          matchId: id,
          playerId: LISTEN_PLAYER_ID,
          data: message.data,
        });
        return;
      case 'command':
        this.runner.handle({
          t: 'command',
          matchId: id,
          playerId: LISTEN_PLAYER_ID,
          cmd: message.cmd,
        });
        return;
      case 'items':
        this.runner.handle({ t: 'items', catalog: message.catalog });
        return;
      case 'pause':
        this.paused = message.paused;
        this.runner.setPaused(message.paused);
        return;
      case 'stop':
        this.runner.shutdown();
        return;
    }
  }

  private onRunner(message: FromWorker): void {
    const opts = this.opts;
    switch (message.t) {
      case 'created':
        if (!opts) return;
        this.sink(
          {
            t: 'joined',
            info: {
              code: opts.matchId,
              playerId: LISTEN_PLAYER_ID,
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
          for (const p of frame.packets) {
            if (p.to !== 'all' && p.to !== LISTEN_PLAYER_ID) continue;
            this.sink(
              p.reliable ? { t: 'events', data: p.data } : { t: 'snapshot', data: p.data },
              [p.data],
            );
          }
        }
        return;
      case 'summaries':
        for (const item of message.items) this.sink({ t: 'summary', summary: item.summary }, []);
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
  stop(): void;
}

/** Starts a match on a listen-server worker and wires its output to `handlers`. */
export function connectListenServer<E extends { data: unknown }>(
  port: PortLike<E>,
  start: { opts: MatchOptions; playerName: string; userId?: string },
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
