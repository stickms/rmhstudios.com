import { SeededRng } from './rng';
import type {
  Bin,
  ClothingItem,
  ClothingType,
  ColorName,
  GameEvent,
  GameStatus,
  HudSnapshot,
  RunConfig,
  RunResult,
} from './types';
import {
  AIR_DRAG,
  BASE_POINTS,
  BIN_HEIGHT,
  BIN_Y,
  CLOTHING_TYPES,
  COLOR_ORDER,
  COMBO_PER_STEP,
  FIXED_DT,
  FLOOR_BOUNCE,
  GRAVITY,
  MAX_MULTIPLIER,
  STREAK_MAX_HEAT,
  WALL_BOUNCE,
  WRONG_PENALTY,
} from './constants';

/**
 * LaundryEngine — the framework-agnostic simulation.
 *
 * It is fully deterministic given (seed, mode, the ordered set of player drag
 * inputs): spawns come from a seeded RNG advanced on a fixed timestep, so two
 * clients that share a seed see the identical clothing stream. Only physics of
 * *dragged* items diverge between players, which is fine — multiplayer compares
 * scores, not field state.
 */
export class LaundryEngine {
  readonly config: RunConfig;
  private rng: SeededRng;

  bins: Bin[] = [];
  items: ClothingItem[] = [];

  status: GameStatus = 'idle';
  score = 0;
  combo = 0;
  streak = 0;
  bestStreak = 0;
  sorted = 0;
  missed = 0;
  /** 0→1 cozy hamper-overflow pressure (drives endless death + warning glow). */
  overflow = 0;

  private elapsed = 0; // sim seconds since start
  private acc = 0; // fixed-step accumulator
  private nextId = 1;
  private spawnTimer = 0;
  private events: GameEvent[] = [];

  /** Active drags: pointerId → { itemId, lastX, lastY }. */
  private drags = new Map<number, { itemId: number; lx: number; ly: number }>();

  constructor(config: RunConfig) {
    this.config = config;
    this.rng = new SeededRng(config.seed);
    this.buildBins();
  }

  private buildBins(): void {
    const n = Math.max(3, Math.min(COLOR_ORDER.length, this.config.colorCount));
    const colors = COLOR_ORDER.slice(0, n);
    const w = this.config.width / n;
    this.bins = colors.map((color, i) => ({ x: w * i + w / 2, width: w, color }));
  }

  private activeColors(): ColorName[] {
    return this.bins.map((b) => b.color);
  }

  start(): void {
    this.rng = new SeededRng(this.config.seed);
    this.items = [];
    this.drags.clear();
    this.events = [];
    this.status = 'running';
    this.score = 0;
    this.combo = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.sorted = 0;
    this.missed = 0;
    this.overflow = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.nextId = 1;
    this.spawnTimer = 0.3;
  }

  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.combo / COMBO_PER_STEP));
  }

  /** 0→1 flame intensity for the streak VFX. */
  get heat(): number {
    return Math.min(1, this.streak / STREAK_MAX_HEAT);
  }

  get timeLeft(): number {
    if (this.config.durationSec <= 0) return Infinity;
    return Math.max(0, this.config.durationSec - this.elapsed);
  }

  /** Difficulty ramp 0→1. Timed modes ramp on the clock; endless on items sorted. */
  private progress(): number {
    if (this.config.durationSec > 0) {
      return Math.min(1, this.elapsed / this.config.durationSec);
    }
    return Math.min(1, this.sorted / 80);
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  pointerDown(pointerId: number, x: number, y: number): void {
    if (this.status !== 'running') return;
    const item = this.pick(x, y);
    if (!item) return;
    item.heldBy = pointerId;
    item.vx = 0;
    item.vy = 0;
    this.drags.set(pointerId, { itemId: item.id, lx: x, ly: y });
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    const drag = this.drags.get(pointerId);
    if (!drag) return;
    const item = this.items.find((i) => i.id === drag.itemId);
    if (!item) {
      this.drags.delete(pointerId);
      return;
    }
    const dx = x - drag.lx;
    const dy = y - drag.ly;
    item.x = x;
    item.y = y;
    // Fling momentum carries when released.
    item.vx = dx / FIXED_DT * 0.25;
    item.vy = dy / FIXED_DT * 0.25;
    item.spin = dx * 0.01;
    drag.lx = x;
    drag.ly = y;
  }

  pointerUp(pointerId: number): void {
    const drag = this.drags.get(pointerId);
    if (!drag) return;
    const item = this.items.find((i) => i.id === drag.itemId);
    if (item) item.heldBy = -1;
    this.drags.delete(pointerId);
  }

  /** Topmost item whose padded footprint contains the point. */
  private pick(x: number, y: number): ClothingItem | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.consumed) continue;
      const pad = 14;
      const h = it.size + pad;
      if (Math.abs(x - it.x) <= h && Math.abs(y - it.y) <= h) return it;
    }
    return null;
  }

  // ── Simulation ──────────────────────────────────────────────────────────────
  /** Advance the sim by `dt` real seconds; returns the events for this frame. */
  update(dt: number): GameEvent[] {
    this.events = [];
    if (this.status !== 'running') return this.events;

    // Clamp dt so a backgrounded tab can't spiral the fixed loop.
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }

    if (this.config.durationSec > 0 && this.elapsed >= this.config.durationSec) {
      this.finish();
    }
    if (this.config.mode === 'endless' && this.overflow >= 1) {
      this.finish();
    }
    return this.events;
  }

  private step(dt: number): void {
    this.elapsed += dt;
    this.spawnTimer -= dt;

    const p = this.progress();
    if (this.spawnTimer <= 0) {
      const interval = 1.35 - p * 0.95; // 1.35s → 0.4s
      this.spawnTimer = interval;
      const count = 1 + Math.floor(p * 2.2 + this.rng.next() * 0.6);
      for (let i = 0; i < count; i++) this.spawn();
    }

    // Gentle cozy reduction of overflow pressure over time.
    if (this.overflow > 0) this.overflow = Math.max(0, this.overflow - dt * 0.04);

    const colors = this.activeColors();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.appear < 1) it.appear = Math.min(1, it.appear + dt * 4);
      it.wobble += dt * (3 + it.spin * 4);

      if (it.heldBy === -1) {
        it.vy += GRAVITY * dt;
        const drag = Math.pow(AIR_DRAG, dt);
        it.vx *= drag;
        it.vy *= drag;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rotation += it.spin * dt * 4;
        it.spin *= Math.pow(0.6, dt);

        // Walls
        if (it.x - it.size < 0) {
          it.x = it.size;
          it.vx = Math.abs(it.vx) * WALL_BOUNCE;
        } else if (it.x + it.size > this.config.width) {
          it.x = this.config.width - it.size;
          it.vx = -Math.abs(it.vx) * WALL_BOUNCE;
        }

        // Reached the bin band → resolve into a hamper.
        if (it.y + it.size >= BIN_Y - BIN_HEIGHT / 2) {
          const bin = this.binAt(it.x);
          if (bin) {
            this.resolve(it, bin.color === it.color);
            this.items.splice(i, 1);
            continue;
          }
          // Between hampers / floor — bounce, lose a little, eventually mess up.
          if (it.y + it.size >= this.config.height) {
            it.y = this.config.height - it.size;
            it.vy = -Math.abs(it.vy) * FLOOR_BOUNCE;
            if (Math.abs(it.vy) < 12) {
              this.miss(it);
              this.items.splice(i, 1);
              continue;
            }
          }
        }
      }

      it.ttl -= dt;
      if (it.ttl <= 0) {
        this.miss(it);
        this.items.splice(i, 1);
      }
    }
    void colors;
  }

  private binAt(x: number): Bin | null {
    for (const b of this.bins) {
      if (x >= b.x - b.width / 2 && x <= b.x + b.width / 2) return b;
    }
    return null;
  }

  private spawn(): void {
    const colors = this.activeColors();
    const color = this.rng.pick(colors);
    const type = this.rng.pick(CLOTHING_TYPES) as ClothingType;
    const size = type === 'towel' ? 30 : type === 'sock' ? 18 : 24;
    const x = this.rng.range(size + 8, this.config.width - size - 8);
    const item: ClothingItem = {
      id: this.nextId++,
      x,
      y: -size,
      vx: this.rng.range(-40, 40),
      vy: this.rng.range(10, 40),
      size,
      color,
      type,
      rotation: this.rng.range(0, Math.PI * 2),
      spin: this.rng.range(-1, 1),
      wobble: this.rng.range(0, Math.PI * 2),
      heldBy: -1,
      ttl: 16,
      appear: 0,
    };
    this.items.push(item);
    this.events.push({ kind: 'spawn', x: item.x, y: item.y, color });
  }

  private resolve(it: ClothingItem, correct: boolean): void {
    it.consumed = true;
    if (correct) {
      const points = BASE_POINTS * this.multiplier;
      this.score += points;
      this.combo += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.sorted += 1;
      if (this.config.mode === 'endless') this.overflow = Math.max(0, this.overflow - 0.015);
      this.events.push({ kind: 'sort', x: it.x, y: BIN_Y - BIN_HEIGHT, color: it.color, correct: true, points, combo: this.combo });
      if (this.streak > 0 && this.streak % 5 === 0) {
        this.events.push({ kind: 'streak', streak: this.streak, heat: this.heat });
      }
    } else {
      this.score = Math.max(0, this.score - WRONG_PENALTY);
      this.combo = 0;
      this.streak = 0;
      this.missed += 1;
      if (this.config.mode === 'endless') this.overflow = Math.min(1, this.overflow + 0.16);
      this.events.push({ kind: 'sort', x: it.x, y: BIN_Y - BIN_HEIGHT, color: it.color, correct: false, points: -WRONG_PENALTY, combo: 0 });
    }
  }

  /** Item lost to the floor / timeout — breaks combo, adds mess in endless. */
  private miss(it: ClothingItem): void {
    if (it.consumed) return;
    this.combo = 0;
    this.streak = 0;
    this.missed += 1;
    if (this.config.mode === 'endless') this.overflow = Math.min(1, this.overflow + 0.1);
  }

  private finish(): void {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.drags.clear();
    this.events.push({ kind: 'end' });
  }

  /** Force-end (e.g. multiplayer round timer fired on the server clock). */
  forceFinish(): void {
    this.finish();
  }

  get accuracy(): number {
    const total = this.sorted + this.missed;
    return total === 0 ? 1 : this.sorted / total;
  }

  snapshot(): HudSnapshot {
    return {
      status: this.status,
      score: this.score,
      combo: this.combo,
      multiplier: this.multiplier,
      streak: this.streak,
      bestStreak: this.bestStreak,
      heat: this.heat,
      timeLeft: this.timeLeft,
      sorted: this.sorted,
      missed: this.missed,
      accuracy: this.accuracy,
      overflow: this.overflow,
      mode: this.config.mode,
    };
  }

  result(): RunResult {
    return {
      mode: this.config.mode,
      seed: this.config.seed,
      score: this.score,
      bestStreak: this.bestStreak,
      sorted: this.sorted,
      missed: this.missed,
      accuracy: this.accuracy,
      durationSec: this.config.durationSec,
    };
  }
}
