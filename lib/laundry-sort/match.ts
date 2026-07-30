/**
 * Laundry Sort — the match: a deterministic drop schedule, the scoring rules,
 * and the fixed-timestep clock that drives both.
 *
 * The whole schedule is generated up front from a 32-bit seed. That is what
 * makes a race a race: two players on the same seed get the same garments, in
 * the same order, at the same simulated moments, regardless of hardware. It
 * also makes the director trivially testable — no clock, no randomness at
 * runtime, just a list.
 *
 * The clock is **simulated**, not wall-clock. A device that cannot hold 60 fps
 * consumes the schedule more slowly in real seconds but sees exactly the same
 * laundry, so a weak phone loses nothing but patience. Wall-clock deadlines
 * live on the server (with a grace window), never here.
 */

import {
  ARENA,
  DIFFICULTY_TUNING,
  FIXED_DT,
  MAX_LIVE_GARMENTS,
  MAX_TICKS_PER_FRAME,
  SUBSTEPS,
  WASH_COLORS,
  scoreFor,
  type Difficulty,
} from './constants';
import { buildArena, type ArenaLayout } from './arena';
import { createRng } from './rng';
import { GARMENT_KINDS, PATTERNS, type GarmentKind } from './patterns';
import { ClothWorld, REST_SPEED, type Garment, type Ray, type SpawnDesc } from './solver';

// ─── Drop schedule ──────────────────────────────────────────────────────────

export interface Drop extends SpawnDesc {
  /** Simulated seconds from the start of the match. */
  at: number;
}

/** Relative frequency of each cut. Shirts are the friendliest to grab. */
const KIND_WEIGHTS: Record<GarmentKind, number> = {
  shirt: 0.34,
  pants: 0.26,
  towel: 0.22,
  sock: 0.18,
};

function pickKind(roll: number): GarmentKind {
  let acc = 0;
  for (const kind of GARMENT_KINDS) {
    acc += KIND_WEIGHTS[kind];
    if (roll < acc) return kind;
  }
  return 'shirt';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build the full drop list for a match. Pure: same inputs, same output, on
 * every device and every run.
 */
export function buildDropSchedule(
  seed: number,
  durationSec: number,
  difficulty: Difficulty,
): Drop[] {
  const rng = createRng(seed);
  const tuning = DIFFICULTY_TUNING[difficulty];
  const drops: Drop[] = [];

  // A beat of quiet at the start so the player can read the bins before the
  // first garment is in reach.
  let t = 0.8;

  while (t < durationSec - 0.3) {
    const progress = Math.min(t / durationSec, 1);
    const batchFloat = lerp(tuning.startBatch, tuning.endBatch, progress);
    // Fractional batch sizes accumulate probabilistically, so difficulty ramps
    // smoothly instead of stepping from "one garment" to "two" at a threshold.
    const batch = Math.max(1, Math.floor(batchFloat) + (rng.next() < batchFloat % 1 ? 1 : 0));

    // One garment per lane keeps a batch from stacking into a single column,
    // which would be unreadable and unfair to grab.
    const usable = ARENA.halfWidth * 2 - 1.2;
    const laneWidth = usable / batch;
    const lanes = shuffle(
      Array.from({ length: batch }, (_, i) => i),
      rng.next,
    );

    for (let b = 0; b < batch; b++) {
      const lane = lanes[b];
      const laneCenter = -usable / 2 + laneWidth * (lane + 0.5);
      const kind = pickKind(rng.next());
      const jitter = Math.min(laneWidth * 0.3, 0.5);

      drops.push({
        at: t + b * 0.08,
        kind,
        colorIndex: rng.int(WASH_COLORS.length),
        x: laneCenter + rng.range(-jitter, jitter),
        z: rng.range(-0.5, 0.5),
        roll: rng.range(-Math.PI, Math.PI),
        yaw: rng.range(-1, 1),
        vx: rng.range(-0.6, 0.6),
        vy: rng.range(-0.5, 0),
        // Tumble out of the chute. The spin about the view axis is the one the
        // player actually reads, so it gets the widest range.
        spinX: rng.range(-2.2, 2.2),
        spinY: rng.range(-2.6, 2.6),
        spinZ: rng.range(-3.4, 3.4),
        bow: rng.range(0.05, 0.16) * (rng.next() < 0.5 ? -1 : 1),
      });
    }

    t += lerp(tuning.startInterval, tuning.endInterval, progress);
  }

  return drops;
}

/** Fisher-Yates against a supplied uniform source, so it stays seeded. */
function shuffle<T>(items: T[], next: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

// ─── Scoring policy ─────────────────────────────────────────────────────────

/** Share of a garment's particles that must be in a bin before it counts. */
const SORT_THRESHOLD = 0.62;
/** Seconds a garment must lie still on the floor before it counts as missed. */
const MISS_SETTLE = 1.1;
/** Seconds a resolved garment stays visible, flopping into place, before culling. */
const CULL_DELAY = 0.9;

export type MatchEventType = 'sorted' | 'wrong' | 'missed';

export interface MatchEvent {
  type: MatchEventType;
  garmentId: number;
  binIndex: number | null;
  points: number;
  /** Combo *after* the event — what the HUD should show. */
  combo: number;
  x: number;
  y: number;
  z: number;
  colorIndex: number;
}

export interface MatchStats {
  score: number;
  combo: number;
  bestCombo: number;
  sorted: number;
  wrong: number;
  missed: number;
}

export const EMPTY_STATS: MatchStats = {
  score: 0,
  combo: 0,
  bestCombo: 0,
  sorted: 0,
  wrong: 0,
  missed: 0,
};

// ─── Match ──────────────────────────────────────────────────────────────────

export interface MatchOptions {
  seed: number;
  durationSec: number;
  difficulty: Difficulty;
}

/**
 * Owns a `ClothWorld`, the schedule, and the score. React drives it with
 * {@link advance}, which is the only place wall-clock time enters — and even
 * there it is immediately quantised into whole fixed ticks.
 */
export class LaundryMatch {
  readonly world: ClothWorld;
  readonly arena: ArenaLayout;
  readonly options: MatchOptions;
  readonly drops: Drop[];

  stats: MatchStats = { ...EMPTY_STATS };
  finished = false;

  /** Events produced by the last {@link advance}; the HUD drains them. */
  readonly events: MatchEvent[] = [];

  private cursor = 0;
  private accumulator = 0;
  /**
   * Ticks consumed, and the budget. The round's length is counted in **ticks,
   * not seconds**: summing 3600 copies of 1/60 in binary floating point lands
   * a hair short of 60, so a seconds comparison would end the round one tick
   * late — and, worse, could land differently after an unrelated change to the
   * timestep. An integer count is exact everywhere.
   */
  private ticks = 0;
  private readonly totalTicks: number;

  constructor(options: MatchOptions) {
    this.options = options;
    this.arena = buildArena();
    this.world = new ClothWorld(this.arena);
    this.drops = buildDropSchedule(options.seed, options.durationSec, options.difficulty);
    this.totalTicks = Math.round(options.durationSec / FIXED_DT);
  }

  /** Simulated seconds elapsed. */
  get elapsed(): number {
    return this.ticks * FIXED_DT;
  }

  /** Simulated seconds left, floored at zero. */
  get remaining(): number {
    return Math.max(0, (this.totalTicks - this.ticks) * FIXED_DT);
  }

  /**
   * Feed real time in. Consumes it in whole {@link FIXED_DT} ticks and drops
   * the excess beyond {@link MAX_TICKS_PER_FRAME}, so a backgrounded tab
   * resumes instead of trying to simulate the minute it was asleep.
   */
  advance(deltaSeconds: number): void {
    if (this.finished) return;
    this.events.length = 0;

    this.accumulator += Math.min(deltaSeconds, MAX_TICKS_PER_FRAME * FIXED_DT);
    let ticks = 0;
    while (this.accumulator >= FIXED_DT && ticks < MAX_TICKS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      ticks++;
      this.tick();
      if (this.finished) break;
    }
  }

  private tick(): void {
    this.ticks++;
    this.releaseDueDrops();
    this.world.step(FIXED_DT, SUBSTEPS);
    this.resolveGarments();
    this.cull();

    if (this.ticks >= this.totalTicks) {
      this.finished = true;
      this.world.endGrab();
    }
  }

  private releaseDueDrops(): void {
    const now = this.world.time;
    while (this.cursor < this.drops.length && this.drops[this.cursor].at <= now) {
      const drop = this.drops[this.cursor++];
      // The cap is a particle budget, so it is enforced by making room rather
      // than by skipping the drop — skipping would desync two players who hit
      // the cap at different moments.
      if (this.world.garments.length >= MAX_LIVE_GARMENTS) this.evictOldest();
      this.world.spawn(drop);
    }
  }

  /** Drop the least interesting garment: resolved first, then longest at rest. */
  private evictOldest(): void {
    const { garments } = this.world;
    let victim: Garment | null = null;
    for (const g of garments) {
      if (g.state !== 'falling') {
        victim = g;
        break;
      }
    }
    if (!victim) {
      for (const g of garments) {
        if (!victim || g.restingFor > victim.restingFor) victim = g;
      }
    }
    if (victim) this.world.remove(victim.id);
  }

  private resolveGarments(): void {
    for (const g of this.world.garments) {
      if (g.state !== 'falling') continue;

      // In a bin?
      let landed = -1;
      for (const bin of this.arena.bins) {
        if (this.world.fractionInside(g, bin.interior) >= SORT_THRESHOLD) {
          landed = bin.index;
          break;
        }
      }

      if (landed >= 0) {
        const correct = landed === g.colorIndex;
        const points = scoreFor(correct, this.stats.combo);
        if (correct) {
          this.stats.combo++;
          this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
          this.stats.sorted++;
        } else {
          this.stats.combo = 0;
          this.stats.wrong++;
        }
        this.stats.score = Math.max(0, this.stats.score + points);

        g.state = 'sorted';
        g.resolvedBin = landed;
        g.expiresAt = this.world.time + CULL_DELAY;
        this.events.push({
          type: correct ? 'sorted' : 'wrong',
          garmentId: g.id,
          binIndex: landed,
          points,
          combo: this.stats.combo,
          x: g.cx,
          y: g.cy,
          z: g.cz,
          colorIndex: g.colorIndex,
        });
        continue;
      }

      // A miss is "it stopped moving and it is not in a bin" — which covers
      // the floor, a garment draped across two rims, and one flung into a
      // corner. Height is deliberately not part of the test: the bins are
      // wider than the gaps between them, so most laundry that misses comes to
      // rest *on* a bin rather than beside it, and an altitude check would let
      // that clutter sit there scoring nothing forever.
      const fellOut = g.cy < ARENA.killY;
      const settled = g.speed < REST_SPEED && g.restingFor >= MISS_SETTLE;
      if (fellOut || settled) {
        this.stats.combo = 0;
        this.stats.missed++;
        g.state = 'missed';
        g.expiresAt = this.world.time + CULL_DELAY;
        this.events.push({
          type: 'missed',
          garmentId: g.id,
          binIndex: null,
          points: 0,
          combo: 0,
          x: g.cx,
          y: g.cy,
          z: g.cz,
          colorIndex: g.colorIndex,
        });
      }
    }
  }

  private cull(): void {
    const now = this.world.time;
    // Through `world.remove` rather than splicing the array, so the revision
    // counter the renderer watches actually moves.
    for (let i = this.world.garments.length - 1; i >= 0; i--) {
      const g = this.world.garments[i];
      if (g.expiresAt !== null && now >= g.expiresAt) this.world.remove(g.id);
    }
  }

  // ── Pointer passthrough ─────────────────────────────────────────────────

  beginGrab(ray: Ray): boolean {
    return this.finished ? false : this.world.beginGrab(ray);
  }

  moveGrab(ray: Ray): void {
    this.world.moveGrab(ray);
  }

  endGrab(): void {
    this.world.endGrab();
  }
}

/** Peak particle count this match could reach — used for buffer preallocation. */
export function peakParticles(): number {
  const largest = Math.max(...GARMENT_KINDS.map((k) => PATTERNS[k].count));
  return largest * MAX_LIVE_GARMENTS;
}
