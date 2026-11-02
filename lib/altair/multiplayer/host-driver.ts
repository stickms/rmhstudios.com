// =============================================================================
// ALTAIR MULTIPLAYER -- Host driver (pure, clock injected)
// =============================================================================
// Owns the HostSim on the host's page: turns wall-clock time into fixed 60 Hz
// steps (accumulator, capped catch-up), applies guest input, and emits a
// snapshot every 3rd step (20 Hz). No timers or sockets in here: the page calls
// `advance(nowMs)` from whatever clock it has (a worker timer, so a hidden host
// tab keeps stepping; see MultiplayerGameScreen) and supplies `send`.
// =============================================================================

import { HostSim, FIXED_DT, type HostPlayerInit, type HostPlayerStats, type HostStatus, type PendingLevelUp } from '../engine/multiplayer/host-sim';
import type { GameEvent, GameStateSnapshot } from './types';

/** One snapshot every this many steps = 20 Hz. */
export const SNAPSHOT_EVERY = 3;
/** Most steps simulated by one advance(); the backlog beyond ~0.25 s is dropped, not replayed. */
export const MAX_STEPS_PER_ADVANCE = 15;
/** A guest whose input has not arrived for this long is told to stand still. */
export const INPUT_STALE_MS = 1000;

export interface HostEnd {
  victory: boolean;
  stats: HostPlayerStats[];
  sharedKills: number;
  bossesDefeated: string[];
  /** Game-clock seconds. */
  time: number;
}

export interface LevelUpOffer extends PendingLevelUp {
  level: number;
}

export interface HostDriverOptions {
  players: HostPlayerInit[];
  doubleTime?: boolean;
  /** Called with the (reused) snapshot object; must serialise or decode it synchronously. */
  send: (snapshot: GameStateSnapshot) => void;
  onEvents?: (events: GameEvent[]) => void;
  /** A player's level-up overlay just opened: tell that player (once per level-up). */
  onLevelUpOffer?: (playerId: string, offer: LevelUpOffer) => void;
  onEnd?: (end: HostEnd) => void;
}

export class HostDriver {
  readonly sim: HostSim;
  private acc = 0;
  private last: number | null = null;
  private stepsSinceSnapshot = 0;
  private ended = false;
  private readonly offered = new Set<string>();
  private readonly lastInputAt = new Map<string, number>();
  private readonly opts: HostDriverOptions;
  /** Steps dropped because the page could not keep up (for diagnostics). */
  droppedSteps = 0;

  constructor(opts: HostDriverOptions) {
    this.opts = opts;
    this.sim = new HostSim({ players: opts.players, doubleTime: opts.doubleTime });
  }

  /** Movement intent from a guest (already shape-checked by the hub; HostSim clamps again). */
  input(playerId: string, dx: number, dy: number, nowMs: number): void {
    this.lastInputAt.set(playerId, nowMs);
    this.sim.setInput(playerId, dx, dy);
  }

  /** The host's own keyboard/touch intent. */
  localInput(playerId: string, dx: number, dy: number): void {
    this.sim.setInput(playerId, dx, dy);
  }

  /** A player's pick from their level-up overlay (the hub passes guests' picks through as a bare index). */
  chooseUpgrade(playerId: string, index: number): boolean {
    return this.sim.chooseUpgrade(playerId, index);
  }

  /** Advance to `nowMs`. Returns the number of steps run. */
  advance(nowMs: number): number {
    if (this.ended) return 0;
    if (this.last === null) {
      this.last = nowMs;
      return 0;
    }
    const dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (!(dt > 0)) return 0;
    this.acc += dt;

    // Guests that went quiet stand still instead of walking on their last intent.
    for (const [id, at] of this.lastInputAt) {
      if (nowMs - at > INPUT_STALE_MS) {
        this.sim.setInput(id, 0, 0);
        this.lastInputAt.delete(id);
      }
    }

    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_ADVANCE) {
      this.sim.step();
      this.acc -= FIXED_DT;
      steps++;
      if (++this.stepsSinceSnapshot >= SNAPSHOT_EVERY) {
        this.stepsSinceSnapshot = 0;
        this.emitSnapshot();
      }
      if (this.sim.status !== 'playing') {
        this.finish(this.sim.status);
        return steps;
      }
    }
    this.announceLevelUps();
    if (this.acc >= FIXED_DT) {
      // Could not keep up: forget the backlog rather than spiral.
      this.droppedSteps += Math.floor(this.acc / FIXED_DT);
      this.acc = 0;
    }
    return steps;
  }

  /** Offer each newly opened level-up to its owner exactly once; forget it once it is resolved. */
  private announceLevelUps(): void {
    const pending = this.sim.pendingLevelUpPlayers();
    for (const id of this.offered) if (!pending.includes(id)) this.offered.delete(id);
    for (const id of pending) {
      if (this.offered.has(id)) continue;
      const p = this.sim.getPendingLevelUp(id);
      if (!p) continue;
      this.offered.add(id);
      this.opts.onLevelUpOffer?.(id, {
        choices: p.choices,
        remaining: p.remaining,
        level: this.sim.getPlayerProgress(id)?.level ?? 1,
      });
    }
  }

  private emitSnapshot(): void {
    this.opts.send(this.sim.getSnapshot());
    const ev = this.sim.drainEvents();
    if (ev.length > 0) this.opts.onEvents?.(ev);
  }

  private finish(status: HostStatus): void {
    if (this.ended) return;
    this.ended = true;
    // One last snapshot so every screen shows the final state.
    this.emitSnapshot();
    this.opts.onEnd?.({
      victory: status === 'victory',
      stats: this.sim.getPlayerStats(),
      sharedKills: this.sim.world.sharedKills,
      bossesDefeated: [...this.sim.bossesDefeated],
      time: this.sim.world.time,
    });
  }

  get isEnded(): boolean {
    return this.ended;
  }
}
