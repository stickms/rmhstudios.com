/**
 * Spectating (WS13, REP-04, MM-07 view).
 *
 * - `SpectateDirectory`: the hub's spectatable-lobby list (`balatro:spectate:list`
 *   → `balatro:spectate:lobbies`), mirrored to Lua as `spectate_view`; Lua's
 *   `ui_spectate {code}` then joins that lobby with role 'spectator' (the
 *   runtime's ordinary member path; the host admits spectators up to
 *   MAX_SPECTATORS and only ever sends them, never accepts game traffic).
 * - `SpectateFeed`: the spectator's side of one watched match. The host relays
 *   every player's `log` batches live, and on joining a running match sends
 *   all logs so far (`ReplayTap.catchUp`). The feed assembles them per player
 *   (`PlayerLog`) and drives Lua's playback driver for one POV player with the
 *   same messages a stored replay uses (`replay_view.playing` with id
 *   `live:<runId>`, then `replay_feed` as events arrive). Lua fast-forwards
 *   while it is behind, so a mid-match join reaches the live position with
 *   full fidelity. A POV switch (`ui_replay {op:'pov'}`) re-opens the
 *   playback with that player's log from the start.
 *
 * Browser-free, zod-free (MP chunk).
 */

import type { BalatroS2CPayload } from '../net/events';
import type { BridgeLike, HubLike, Scheduler } from './transport/types';
import type { Id, StartedMatch } from './types';
import { PlayerLog } from './replay/log';
import { LIVE_PREFIX, sendFeed, sendOpen } from './replay/player-feed';

export const SPECTATE_LIST_TIMEOUT_MS = 5_000;

type Lobbies = BalatroS2CPayload<'balatro:spectate:lobbies'>['lobbies'];

export class SpectateDirectory {
  private pending: (() => void) | null = null;
  private readonly off: () => void;

  constructor(
    private readonly hub: HubLike,
    private readonly bridge: BridgeLike,
    private readonly sched: Scheduler,
  ) {
    this.off = hub.on('balatro:spectate:lobbies', (d) => this.answer(d.lobbies));
  }

  /** Ask the hub; Lua gets `spectate_view` (an `error` when offline or unanswered). */
  request(): void {
    if (this.hub.status !== 'connected') {
      this.bridge.send('spectate_view', { lobbies: [], error: 'offline' });
      return;
    }
    this.pending?.();
    this.pending = this.sched.after(SPECTATE_LIST_TIMEOUT_MS, () => {
      this.pending = null;
      this.bridge.send('spectate_view', { lobbies: [], error: 'timeout' });
    });
    this.hub.emit('balatro:spectate:list', {});
  }

  private answer(lobbies: Lobbies): void {
    this.pending?.();
    this.pending = null;
    const list = lobbies
      .filter((l) => Number.isInteger(l.players) && l.players >= 0)
      .slice(0, 50)
      .map((l) => ({ code: l.code, queueMode: l.queueMode, players: l.players, ante: l.ante }));
    this.bridge.send('spectate_view', { lobbies: list });
  }

  stop(): void {
    this.pending?.();
    this.pending = null;
    this.off();
  }
}

export class SpectateFeed {
  match: StartedMatch | null = null;
  pov: Id | null = null;
  readonly logs = new Map<Id, PlayerLog>();
  /** Events of the POV already handed to Lua. */
  private fed = 0;

  constructor(private readonly bridge: BridgeLike) {}

  get liveId(): string | null {
    return this.match ? `${LIVE_PREFIX}${this.match.runId}` : null;
  }

  /** Watch `match` (a repeat for the same run is ignored). */
  start(match: StartedMatch): void {
    if (this.match?.runId === match.runId) return;
    this.match = match;
    this.logs.clear();
    for (const r of match.roster) this.logs.set(r.id, new PlayerLog(r.id));
    this.pov = match.roster[0]?.id ?? null;
    this.open();
  }

  /** A player's batch for `runId` (other runs are ignored). */
  add(from: Id, runId: string, batch: readonly unknown[]): void {
    if (!this.match || runId !== this.match.runId) return;
    const log = this.logs.get(from);
    if (!log) return; // not a seated player of this match
    const r = log.add(batch);
    if (from !== this.pov) return;
    // A rejoin marker replaced events already fed: feed again from there (Lua drops its copies
    // the same way, replay/player.lua PL.feed).
    if (r.rewound !== undefined && r.rewound < this.fed) this.fed = r.rewound;
    this.flush();
  }

  /** Watch another player (from the start of their log). */
  setPov(id: Id): boolean {
    if (!this.match || !this.logs.has(id) || id === this.pov) return false;
    this.pov = id;
    this.open();
    return true;
  }

  private open(): void {
    const id = this.liveId;
    if (!id || !this.pov) return;
    this.fed = 0;
    sendOpen(this.bridge, id, this.pov, this.logs.get(this.pov)?.contiguous ?? 0);
    this.flush();
  }

  private flush(): void {
    const log = this.pov ? this.logs.get(this.pov) : undefined;
    if (!log || !this.pov || log.contiguous <= this.fed) return;
    sendFeed(this.bridge, this.pov, log.events(this.fed));
    this.fed = log.contiguous;
  }

  /** Every player's log ended (the match is over for the spectator). */
  finished(): boolean {
    if (!this.match) return false;
    for (const log of this.logs.values()) if (!log.ended()) return false;
    return true;
  }

  stop(): void {
    this.match = null;
    this.pov = null;
    this.fed = 0;
    this.logs.clear();
  }
}
