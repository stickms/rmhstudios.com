import {
  BOARD,
  ENEMIES,
  SELL_REFUND,
  TOWERS,
  type EnemyDef,
  type EnemyType,
  type TargetMode,
  type TowerDef,
  type TowerTier,
  type TowerType,
} from './data';
import type { Point } from './Pathfinder';

export type { EnemyType, TowerType, TargetMode };
export type { Point };

let nextId = 1;
/** Deterministic ids: the simulation resets the counter at the start of a run so a seeded run replays exactly. */
export function resetEntityIds() {
  nextId = 1;
}

export class Entity {
  public id: number;
  public x: number;
  public y: number;
  public active = true;

  constructor(x: number, y: number) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
  }
}

/** A specimen walking a lane. All timers are seconds of simulation time. */
export class Enemy extends Entity {
  public readonly type: EnemyType;
  public readonly def: EnemyDef;
  public readonly lane: number;
  /** The wave this specimen belongs to (fragments and brood inherit it). */
  public readonly wave: number;
  public maxHealth: number;
  public health: number;
  public shield: number;
  public maxShield: number;
  /** Distance travelled along the lane, px. */
  public dist = 0;
  public slow = 0;
  public slowTimer = 0;
  public burnDps = 0;
  public burnTimer = 0;
  public stunTimer = 0;
  public vulnerable = 0;
  /** Set each step by the instruments that can see cloaked specimens. */
  public revealed = false;
  public healTimer = 0;
  /** Seconds since this specimen was last healed by a Dread. */
  public healedAge = 99;
  public burstClock = 0;
  public broodLevel = 0;
  public severTimer = 0;
  public shed = false;
  /** Seconds since the last hit, for the hit flash in the renderer. */
  public hitAge = 99;
  /** Fixed per-specimen phase, so membranes do not wobble in lockstep. */
  public readonly phase: number;

  constructor(type: EnemyType, lane: number, wave: number, hpMul: number, phase: number) {
    super(0, 0);
    this.type = type;
    this.def = ENEMIES[type];
    this.lane = lane;
    this.wave = wave;
    this.maxHealth = Math.round(this.def.hp * hpMul);
    this.health = this.maxHealth;
    this.maxShield = Math.round(this.maxHealth * (this.def.shield ?? 0));
    this.shield = this.maxShield;
    this.phase = phase;
  }

  public get cloaked(): boolean {
    return !!this.def.cloaked;
  }

  /** Current speed, px/s, after bursts, shedding, slows and stuns. */
  public speedPx(): number {
    if (this.stunTimer > 0) return 0;
    let s = this.def.speed * BOARD.CELL;
    const b = this.def.burst;
    if (b) {
      // Average stays `speed`: slow half at 2/(1+r), fast half at 2r/(1+r).
      const fast = Math.floor(this.burstClock / b.period) % 2 === 1;
      s *= fast ? (2 * b.ratio) / (1 + b.ratio) : 2 / (1 + b.ratio);
    }
    if (this.shed && this.def.shed) s *= this.def.shed.speedMul;
    return s * (1 - this.slow);
  }

  /**
   * Apply one hit. Returns the HP actually removed (shield included). Armour is flat per hit unless `pierce`;
   * vulnerability multiplies first; electric triples against a shield.
   */
  public takeDamage(amount: number, opts: { pierce?: boolean; electric?: boolean } = {}): number {
    if (!this.active || amount <= 0) return 0;
    let dmg = amount * (1 + this.vulnerable);
    if (!opts.pierce && this.def.armor > 0 && !this.shed) dmg = Math.max(1, dmg - this.def.armor);
    let dealt = 0;
    if (this.shield > 0) {
      const mul = opts.electric ? 3 : 1;
      const absorbed = Math.min(this.shield, dmg * mul);
      this.shield -= absorbed;
      dealt += absorbed;
      dmg -= absorbed / mul;
    }
    if (dmg > 0) {
      const hp = Math.min(this.health, dmg);
      this.health -= hp;
      dealt += hp;
    }
    this.hitAge = 0;
    if (this.health <= 0) this.active = false;
    return dealt;
  }
}

/** An instrument on a bench. */
export class Tower extends Entity {
  public readonly type: TowerType;
  public readonly def: TowerDef;
  /** Bench cell. */
  public readonly cx: number;
  public readonly cy: number;
  /** 0, 1 or 2 (shown as I, II, III). */
  public tier = 0;
  public targetMode: TargetMode;
  public cooldown = 0;
  public totalInvested = 0;
  public damageDealt = 0;
  public kills = 0;
  /** Echo bonuses applied to this instrument (recomputed when the board changes). */
  public buffDamage = 0;
  public buffRate = 0;
  /** Severed by the Surgeon: no fire while > 0. */
  public stunTimer = 0;
  /** Current beam target (Cautery) and aim angle, for the renderer. */
  public beamTarget: number | null = null;
  public aim = -Math.PI / 2;
  public firedAge = 99;

  constructor(cx: number, cy: number, type: TowerType) {
    super(cx * BOARD.CELL + BOARD.CELL / 2, cy * BOARD.CELL + BOARD.CELL / 2);
    this.type = type;
    this.def = TOWERS[type];
    this.cx = cx;
    this.cy = cy;
    this.targetMode = this.def.defaultTarget;
    this.totalInvested = this.def.tiers[0].cost;
  }

  public get stats(): TowerTier {
    return this.def.tiers[this.tier as 0 | 1 | 2];
  }

  public get rangePx(): number {
    return this.stats.range * BOARD.CELL;
  }

  /** Cost of the next tier, or null at tier III. */
  public upgradeCost(): number | null {
    if (this.tier >= 2) return null;
    return this.def.tiers[(this.tier + 1) as 1 | 2].cost;
  }

  public getSellValue(): number {
    return Math.floor(this.totalInvested * SELL_REFUND);
  }
}

/** A centrifuge canister in flight: lands on `target` after `time` seconds and splashes. */
export class Projectile extends Entity {
  public readonly from: Point;
  public readonly target: Point;
  public readonly duration: number;
  public age = 0;
  public readonly tower: Tower;

  constructor(from: Point, target: Point, duration: number, tower: Tower) {
    super(from.x, from.y);
    this.from = from;
    this.target = target;
    this.duration = duration;
    this.tower = tower;
  }
}
