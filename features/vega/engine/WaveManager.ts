import { mulberry32 } from '@/lib/core/rng';
import {
  BOSS_CYCLE,
  BOSS_EVERY,
  ENEMIES,
  INTRODUCED_AT,
  WAVES,
  type EnemyType,
} from './data';

export interface Spawn {
  /** Seconds after the wave starts. */
  at: number;
  type: EnemyType;
  lane: number;
}

export interface WavePlan {
  wave: number;
  spawns: Spawn[];
  /** Time of the last spawn, seconds. */
  duration: number;
  boss: EnemyType | null;
  /** Specimens catalogued for the first time in this wave. */
  introduces: EnemyType[];
}

export function isBossWave(wave: number): boolean {
  return wave % BOSS_EVERY === 0;
}

export function bossFor(wave: number): EnemyType | null {
  if (!isBossWave(wave)) return null;
  return BOSS_CYCLE[(wave / BOSS_EVERY - 1) % BOSS_CYCLE.length]!;
}

export function waveBudget(wave: number): number {
  return Math.round(WAVES.BUDGET_BASE + WAVES.BUDGET_PER_WAVE * wave);
}

/** The regular specimens available by `wave`. */
export function poolFor(wave: number): EnemyType[] {
  return (Object.keys(ENEMIES) as EnemyType[]).filter((t) => {
    const def = ENEMIES[t];
    const at = INTRODUCED_AT[t];
    return !def.boss && def.threat > 0 && at !== undefined && at <= wave;
  });
}

/**
 * Compose a wave. Deterministic for (seed, wave, lanes): the scripted part (a new specimen leads its first
 * wave, a boss every fifth) is fixed, and the rest of the threat budget is filled from the pool by a PRNG
 * seeded from the run seed and the wave number.
 */
export function composeWave(wave: number, lanes: number, seed: number): WavePlan {
  const rand = mulberry32((seed * 7919 + wave * 104_729) | 0);
  const introduces = (Object.keys(INTRODUCED_AT) as EnemyType[]).filter((t) => INTRODUCED_AT[t] === wave);
  const boss = bossFor(wave);
  let budget = waveBudget(wave) * (boss ? 0.55 : 1);
  const groups: { type: EnemyType; count: number }[] = [];

  const lead = introduces.find((t) => !ENEMIES[t].boss);
  if (lead) {
    const count = Math.max(3, Math.floor((budget * 0.5) / ENEMIES[lead].threat));
    groups.push({ type: lead, count });
    budget -= count * ENEMIES[lead].threat;
  }

  const pool = poolFor(wave);
  // Newer specimens weigh more, so each wave leans on what the player has just met.
  const weight = (t: EnemyType) => 1 + (INTRODUCED_AT[t] ?? 1) / 8;
  const total = pool.reduce((s, t) => s + weight(t), 0);
  let guard = 0;
  while (budget >= 1 && guard++ < 200) {
    let r = rand() * total;
    let type = pool[0]!;
    for (const t of pool) {
      r -= weight(t);
      if (r <= 0) {
        type = t;
        break;
      }
    }
    const threat = ENEMIES[type].threat;
    if (threat > budget) {
      // What is left is too little for this pick: spend it on Anxiety and stop.
      if (budget >= 1) groups.push({ type: 'ANXIETY', count: Math.floor(budget) });
      break;
    }
    const max = Math.max(1, Math.floor(budget / threat));
    const count = Math.min(max, 2 + Math.floor(rand() * 6));
    groups.push({ type, count });
    budget -= count * threat;
  }

  const spawns: Spawn[] = [];
  let t = 0;
  groups.forEach((g, gi) => {
    const lane = lanes > 1 ? gi % lanes : 0;
    const gap = ENEMIES[g.type].speed >= 1.6 ? WAVES.GAP * 0.7 : WAVES.GAP;
    for (let i = 0; i < g.count; i++) {
      spawns.push({ at: t, type: g.type, lane });
      t += gap;
    }
    t += WAVES.GROUP_GAP - gap;
  });

  if (boss) {
    // The boss walks in after its escort, alone in the middle lane of attention.
    const bosses = wave > WAVES.GOAL + 5 ? 2 : 1;
    for (let i = 0; i < bosses; i++) {
      spawns.push({ at: t + 1 + i * 4, type: boss, lane: lanes > 1 ? i % lanes : 0 });
    }
  }

  spawns.sort((a, b) => a.at - b.at);
  return {
    wave,
    spawns,
    duration: spawns.length ? spawns[spawns.length - 1]!.at : 0,
    boss,
    introduces,
  };
}

/** One wave on the board: its plan and how far through spawning it is. */
export class ActiveWave {
  public readonly plan: WavePlan;
  public clock = 0;
  public next = 0;
  public leaked = 0;
  public readonly early: boolean;

  constructor(plan: WavePlan, early: boolean) {
    this.plan = plan;
    this.early = early;
  }

  public get done(): boolean {
    return this.next >= this.plan.spawns.length;
  }

  /** Advance the clock and return the spawns now due. */
  public update(dt: number): Spawn[] {
    this.clock += dt;
    const due: Spawn[] = [];
    while (this.next < this.plan.spawns.length && this.plan.spawns[this.next]!.at <= this.clock) {
      due.push(this.plan.spawns[this.next]!);
      this.next++;
    }
    return due;
  }
}
