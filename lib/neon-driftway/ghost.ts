/**
 * Ghost racing for Neon Driftway (plan U9) — race a translucent copy of your
 * personal best (or the world #1 run) on the same level.
 *
 * A ghost is a 10 Hz trace of `[elapsedMs, x, distance]`, recorded during a
 * solo run and stored as a `keyframe` replay (see `lib/game/replay.ts`). It is
 * display-only: a ghost never collides, never scores, and a run raced against
 * one submits exactly like any other.
 *
 * Playback rides the multiplayer ghost renderer that already exists: the
 * player below writes one `RemoteCar` into `game.remotePlayers` each frame, so
 * there is no second renderer and no per-frame allocation — the sample cursor
 * only moves forward, and lookup is amortised O(1).
 */

import type { LevelId, RemoteCar } from './types';
import { NEON_DRIFTWAY_GHOST_VERSION } from '@/lib/game/replay-meta';

export const GHOST_VERSION = NEON_DRIFTWAY_GHOST_VERSION;
export const GHOST_SAMPLE_MS = 100;
/** Ten minutes at 10 Hz — comfortably under the 256 KB replay cap. */
export const GHOST_MAX_SAMPLES = 6_000;
export const GHOST_ID = '__ghost__';

export type GhostSample = [t: number, x: number, distance: number];

export interface GhostTrace {
  level: LevelId;
  samples: GhostSample[];
}

export type GhostMode = 'off' | 'pb' | 'top';
export const GHOST_MODES: GhostMode[] = ['off', 'pb', 'top'];

const MODE_KEY = 'ndw-ghost-mode';

export function readGhostMode(): GhostMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'pb' || v === 'top' || v === 'off' ? v : 'pb';
  } catch {
    return 'pb';
  }
}

export function writeGhostMode(mode: GhostMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage blocked — the choice lasts for this page */
  }
}

/** Records the player's own run. Allocation only at 10 Hz, never per frame. */
export class GhostRecorder {
  private samples: GhostSample[] = [];
  private nextAt = 0;

  reset(): void {
    this.samples = [];
    this.nextAt = 0;
  }

  sample(elapsedMs: number, x: number, distance: number): void {
    // The run clock went backwards: an in-game restart. Start a fresh trace.
    const last = this.samples[this.samples.length - 1];
    if (last && elapsedMs + GHOST_SAMPLE_MS < last[0]) this.reset();
    if (elapsedMs < this.nextAt || this.samples.length >= GHOST_MAX_SAMPLES) return;
    this.samples.push([
      Math.round(elapsedMs),
      Math.round(x * 100) / 100,
      Math.round(distance * 10) / 10,
    ]);
    this.nextAt = elapsedMs + GHOST_SAMPLE_MS;
  }

  trace(level: LevelId): GhostTrace | null {
    return this.samples.length >= 10 ? { level, samples: this.samples } : null;
  }
}

/** Plays a trace back into the engine's remote-player map. */
export class GhostPlayer {
  private cursor = 0;
  private readonly car: RemoteCar;

  constructor(
    private readonly trace: GhostTrace,
    name: string,
  ) {
    this.car = {
      id: GHOST_ID,
      name,
      x: 0,
      speed: 0,
      distance: 0,
      score: 0,
      lane: 0,
      prevX: 0,
      targetX: 0,
      prevDistance: 0,
      targetDistance: 0,
      lastUpdate: 0,
    };
  }

  /** Where the ghost is at `elapsedMs`, or null once its run has ended. */
  private at(elapsedMs: number): { x: number; distance: number } | null {
    const s = this.trace.samples;
    if (s.length === 0 || elapsedMs > s[s.length - 1][0]) return null;
    // A restart rewinds the clock; everything else only moves forward.
    if (this.cursor > 0 && elapsedMs < s[this.cursor][0]) this.cursor = 0;
    while (this.cursor < s.length - 2 && s[this.cursor + 1][0] <= elapsedMs) this.cursor++;
    const a = s[this.cursor];
    const b = s[Math.min(this.cursor + 1, s.length - 1)];
    const span = b[0] - a[0];
    const k = span > 0 ? Math.min(1, Math.max(0, (elapsedMs - a[0]) / span)) : 0;
    return { x: a[1] + (b[1] - a[1]) * k, distance: a[2] + (b[2] - a[2]) * k };
  }

  /**
   * Write this frame's ghost into `remotePlayers` (or remove it when the run it
   * recorded is over). The renderer's 100 ms interpolation is neutralised by
   * setting prev = target, since the position is already interpolated here.
   */
  apply(elapsedMs: number, remotePlayers: Map<string, RemoteCar>): void {
    const pos = this.at(elapsedMs);
    if (!pos) {
      remotePlayers.delete(GHOST_ID);
      return;
    }
    const c = this.car;
    c.x = c.prevX = c.targetX = pos.x;
    c.distance = c.prevDistance = c.targetDistance = pos.distance;
    c.lastUpdate = Date.now();
    if (!remotePlayers.has(GHOST_ID)) remotePlayers.set(GHOST_ID, c);
  }
}
