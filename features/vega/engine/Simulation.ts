/**
 * Project Vega's simulation: one run on one map, stepped at a fixed rate, with no DOM, no store and no clock of
 * its own. The canvas host (`VegaGame`) drives it in real time; the balance test drives it as fast as it can.
 *
 * Phases: `build` (between waves; untimed) -> `wave` (one or more waves on the board) -> back to `build` when
 * every wave on the board is cleared. Clearing wave GOAL raises `victory` once (the player may continue into
 * overtime); clearing wave CAP, or integrity reaching zero, ends the run (`over`).
 */
import { mulberry32 } from '@/lib/core/rng';
import {
  ECONOMY,
  MAPS,
  STEP_S,
  TOWERS,
  WAVES,
  bountyScale,
  hpScale,
  type EnemyType,
  type MapId,
  type TargetMode,
  type TowerType,
} from './data';
import { Enemy, Tower, resetEntityIds } from './Entities';
import { EntityManager, type CombatEvent } from './EntityManager';
import { GridManager } from './GridManager';
import { containmentBonus, waveScore } from './scoring';
import { ActiveWave, composeWave, type WavePlan } from './WaveManager';

export type Phase = 'build' | 'wave' | 'victory' | 'over';

export type SimEvent =
  | CombatEvent
  | { t: 'waveStart'; wave: number; early: boolean; boss: EnemyType | null }
  | { t: 'waveClear'; wave: number; score: number; perfect: boolean; serum: number; income: number }
  | { t: 'victory' }
  | { t: 'over'; complete: boolean };

/** Facts about the run, for the end screen, achievements and the score submission. */
export interface RunStats {
  kills: number;
  bossesKilled: number;
  leaks: number;
  integrityLost: number;
  earlyCalls: number;
  perfectWaves: number;
  biobankIncome: number;
  towersBuilt: number;
  typesBuilt: TowerType[];
  maxTier: number;
  serumEarned: number;
}

export type ActionResult = { ok: true } | { ok: false; reason: 'funds' | 'blocked' | 'phase' | 'max' | 'missing' };

/** A build-phase snapshot: everything needed to resume a run between waves. */
export interface RunSave {
  v: 1;
  map: MapId;
  seed: number;
  wave: number;
  serum: number;
  integrity: number;
  score: number;
  victoryShown: boolean;
  elapsedMs: number;
  stats: RunStats;
  towers: {
    type: TowerType;
    cx: number;
    cy: number;
    tier: number;
    mode: TargetMode;
    invested: number;
    dmg: number;
    kills: number;
  }[];
}

export class Simulation {
  public readonly mapId: MapId;
  public readonly seed: number;
  public readonly grid: GridManager;
  public readonly entities = new EntityManager();
  public phase: Phase = 'build';
  /** Highest wave started. */
  public wave = 0;
  /** Highest wave cleared. */
  public cleared = 0;
  public serum: number = ECONOMY.START_SERUM;
  public integrity: number = ECONOMY.START_INTEGRITY;
  public score = 0;
  public victoryShown = false;
  /** Simulation time of the run, seconds. */
  public time = 0;
  public stats: RunStats = {
    kills: 0,
    bossesKilled: 0,
    leaks: 0,
    integrityLost: 0,
    earlyCalls: 0,
    perfectWaves: 0,
    biobankIncome: 0,
    towersBuilt: 0,
    typesBuilt: [],
    maxTier: 0,
    serumEarned: 0,
  };
  public active: ActiveWave[] = [];
  private events: SimEvent[] = [];
  private phaseRand: () => number;

  constructor(mapId: MapId, seed: number) {
    resetEntityIds();
    this.mapId = mapId;
    this.seed = seed;
    this.grid = new GridManager(MAPS[mapId]);
    this.phaseRand = mulberry32(seed ^ 0x5eed);
  }

  /** Events since the last drain, oldest first. */
  public drain(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  public hpFor(wave: number): number {
    return hpScale(wave) * MAPS[this.mapId].hp;
  }

  /** The plan of the next wave (for the preview strip). */
  public nextPlan(): WavePlan {
    return composeWave(this.wave + 1, this.grid.lanes.length, this.seed);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  public canAfford(type: TowerType): boolean {
    return this.serum >= TOWERS[type].tiers[0].cost;
  }

  public place(type: TowerType, cx: number, cy: number): ActionResult {
    if (this.phase === 'over') return { ok: false, reason: 'phase' };
    const cost = TOWERS[type].tiers[0].cost;
    if (this.serum < cost) return { ok: false, reason: 'funds' };
    if (!this.grid.placeTower(cx, cy)) return { ok: false, reason: 'blocked' };
    this.serum -= cost;
    this.entities.addTower(new Tower(cx, cy, type));
    this.stats.towersBuilt++;
    if (!this.stats.typesBuilt.includes(type)) this.stats.typesBuilt.push(type);
    return { ok: true };
  }

  public upgrade(tower: Tower): ActionResult {
    if (this.phase === 'over') return { ok: false, reason: 'phase' };
    const cost = tower.upgradeCost();
    if (cost === null) return { ok: false, reason: 'max' };
    if (this.serum < cost) return { ok: false, reason: 'funds' };
    this.serum -= cost;
    tower.tier++;
    tower.totalInvested += cost;
    this.stats.maxTier = Math.max(this.stats.maxTier, tower.tier);
    this.entities.markBuffsDirty();
    return { ok: true };
  }

  public sell(tower: Tower): ActionResult {
    if (this.phase === 'over') return { ok: false, reason: 'phase' };
    if (!this.entities.towers.includes(tower)) return { ok: false, reason: 'missing' };
    this.serum += tower.getSellValue();
    this.entities.removeTower(tower);
    this.grid.removeTower(tower.cx, tower.cy);
    return { ok: true };
  }

  public setTargetMode(tower: Tower, mode: TargetMode) {
    tower.targetMode = mode;
  }

  /** True when a wave can be started now: always in build; during a wave once the newest has finished spawning. */
  public canStartWave(): boolean {
    if (this.phase === 'build') return true;
    if (this.phase !== 'wave') return false;
    const newest = this.active[this.active.length - 1];
    return !!newest && newest.done && this.active.length < 2;
  }

  public startWave(): boolean {
    if (!this.canStartWave()) return false;
    const early = this.phase === 'wave';
    this.wave++;
    const plan = composeWave(this.wave, this.grid.lanes.length, this.seed);
    this.active.push(new ActiveWave(plan, early));
    this.phase = 'wave';
    if (early) {
      this.stats.earlyCalls++;
      const bonus = ECONOMY.EARLY_BASE + ECONOMY.EARLY_PER_WAVE * this.wave;
      this.earn(bonus);
    }
    this.events.push({ t: 'waveStart', wave: this.wave, early, boss: plan.boss });
    return true;
  }

  /** After the victory screen: keep going into overtime. */
  public continueOvertime() {
    if (this.phase === 'victory') this.phase = this.active.length ? 'wave' : 'build';
  }

  private earn(n: number) {
    this.serum += n;
    this.stats.serumEarned += n;
  }

  // ── Stepping ───────────────────────────────────────────────────────────────

  /** Advance by one fixed step. */
  public step(dt: number = STEP_S) {
    if (this.phase !== 'wave') return;
    this.time += dt;

    for (const w of this.active) {
      for (const s of w.update(dt)) {
        const e = new Enemy(s.type, s.lane, w.plan.wave, this.hpFor(w.plan.wave), this.phaseRand() * Math.PI * 2);
        const p = this.grid.positionAt(this.grid.lanes[s.lane]!, 0);
        e.x = p.x;
        e.y = p.y;
        this.entities.addEnemy(e);
      }
    }

    this.entities.update(dt, {
      grid: this.grid,
      emit: (ev) => this.onCombat(ev),
      bountyFor: (e) => Math.round(e.def.bounty * bountyScale(e.wave)),
      hpFor: (w) => this.hpFor(w),
      phase: () => this.phaseRand() * Math.PI * 2,
    });

    if (this.integrity <= 0) {
      this.integrity = 0;
      this.phase = 'over';
      this.events.push({ t: 'over', complete: false });
      return;
    }

    // Clear finished waves, oldest first.
    for (const w of [...this.active]) {
      if (!w.done || this.entities.aliveInWave(w.plan.wave) > 0) continue;
      this.active.splice(this.active.indexOf(w), 1);
      this.clearWave(w);
      if (this.phase !== 'wave') return;
    }
    if (this.active.length === 0) this.phase = 'build';
  }

  private onCombat(ev: CombatEvent) {
    if (ev.t === 'kill') {
      this.stats.kills++;
      if (ev.boss) this.stats.bossesKilled++;
      this.earn(ev.bounty);
    } else if (ev.t === 'leak') {
      this.stats.leaks++;
      const lost = Math.min(this.integrity, ev.amount);
      this.integrity -= ev.amount;
      this.stats.integrityLost += lost;
      const w = this.active.find((a) => a.plan.wave === ev.wave);
      if (w) w.leaked += ev.amount;
    }
    this.events.push(ev);
  }

  private clearWave(w: ActiveWave) {
    const wave = w.plan.wave;
    const perfect = w.leaked === 0;
    if (perfect) this.stats.perfectWaves++;
    const points = waveScore(wave, this.mapId, perfect, w.early);
    this.score += points;
    this.cleared = Math.max(this.cleared, wave);
    let income = 0;
    for (const t of this.entities.towers) income += t.stats.income ?? 0;
    this.stats.biobankIncome += income;
    const serum = ECONOMY.CLEAR_BASE + ECONOMY.CLEAR_PER_WAVE * wave;
    this.earn(serum + income);
    this.events.push({ t: 'waveClear', wave, score: points, perfect, serum, income });

    if (wave === WAVES.GOAL && !this.victoryShown) {
      this.victoryShown = true;
      this.score += containmentBonus(this.integrity, this.mapId);
      this.phase = 'victory';
      this.events.push({ t: 'victory' });
    }
    if (wave >= WAVES.CAP) {
      this.phase = 'over';
      this.events.push({ t: 'over', complete: true });
    }
  }

  // ── Save / restore (build phase only) ──────────────────────────────────────

  public save(elapsedMs: number): RunSave | null {
    if (this.phase !== 'build') return null;
    return {
      v: 1,
      map: this.mapId,
      seed: this.seed,
      wave: this.wave,
      serum: this.serum,
      integrity: this.integrity,
      score: this.score,
      victoryShown: this.victoryShown,
      elapsedMs,
      stats: { ...this.stats, typesBuilt: [...this.stats.typesBuilt] },
      towers: this.entities.towers.map((t) => ({
        type: t.type,
        cx: t.cx,
        cy: t.cy,
        tier: t.tier,
        mode: t.targetMode,
        invested: t.totalInvested,
        dmg: t.damageDealt,
        kills: t.kills,
      })),
    };
  }

  public static restore(save: RunSave): Simulation {
    const sim = new Simulation(save.map, save.seed);
    sim.wave = save.wave;
    sim.cleared = save.wave;
    sim.serum = save.serum;
    sim.integrity = save.integrity;
    sim.score = save.score;
    sim.victoryShown = save.victoryShown;
    sim.stats = { ...save.stats, typesBuilt: [...save.stats.typesBuilt] };
    for (const s of save.towers) {
      if (!TOWERS[s.type] || !sim.grid.placeTower(s.cx, s.cy)) continue;
      const t = new Tower(s.cx, s.cy, s.type);
      t.tier = Math.max(0, Math.min(2, s.tier | 0));
      t.targetMode = s.mode;
      t.totalInvested = s.invested;
      t.damageDealt = s.dmg;
      t.kills = s.kills;
      sim.entities.addTower(t);
    }
    return sim;
  }
}
