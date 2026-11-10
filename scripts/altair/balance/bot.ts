/**
 * Altair balance bot — plays real, deterministic solo runs headlessly.
 *
 * Balance changes are only as good as the measurements behind them, and nobody can
 * play 200 hours of Altair to check a curve. This drives the SAME `SoloRun` the
 * browser and the replay verifier drive (fixed 60 Hz step, seeded sim RNG), with a
 * small policy standing in for a player: it keeps away from enemies, drifts toward
 * pickups, and picks level-up upgrades by a fixed priority.
 *
 * Three skill levels bracket human play. `novice` reacts slowly and ignores loot
 * unless it is safe; `expert` reacts fast and farms loot aggressively. Real players
 * land between them, so a build that only works for `expert` is too fiddly and one
 * that `novice` clears is too easy.
 *
 * The bot has its OWN random stream (a tiny LCG). It never touches Math.random or the
 * sim's RNG, so a (seed, class, skill) always plays out identically.
 *
 * Dev tool only: nothing in the app imports it, so it never reaches a player's bundle.
 */
import { SoloRun, type SoloResult } from '@features/altair/engine/solo/solo-run';
import type { SoloLoadout } from '@features/altair/engine/solo/solo-log';
import { createInputState } from '@features/altair/engine/engine/input';
import { useAltairGameStore, type UpgradeChoice } from '@features/altair/engine/stores/game-store';
import type { EnemyEntity, PickupEntity, ProjectileEntity } from '@features/altair/engine/engine/types';

export type BotSkill = 'novice' | 'average' | 'expert';

interface SkillProfile {
  /** Sim steps between movement decisions (human reaction time at 60 Hz). */
  reactionSteps: number;
  /** How far away the bot notices an enemy, in world px. */
  senseRadius: number;
  /** How hard it is drawn to loot (0 ignores it unless nothing is near). */
  lootPull: number;
  /** How far it will go for loot. */
  lootRadius: number;
}

const PROFILES: Record<BotSkill, SkillProfile> = {
  novice: { reactionSteps: 18, senseRadius: 180, lootPull: 0.25, lootRadius: 220 },
  average: { reactionSteps: 9, senseRadius: 260, lootPull: 0.5, lootRadius: 340 },
  expert: { reactionSteps: 4, senseRadius: 340, lootPull: 0.8, lootRadius: 460 },
};

export interface BotOptions {
  seed: number;
  classId: string;
  skill?: BotSkill;
  loadout?: SoloLoadout;
  doubleTime?: boolean;
  /** Heat tier to play at (features/altair/engine/data/heat.ts). Default 0. */
  heat?: number;
  /** Stop after this many sim steps (60 per second). Default: 30 minutes. */
  maxSteps?: number;
  viewport?: { w: number; h: number };
}

export interface BotRun {
  result: SoloResult;
  /** Wall-clock milliseconds the simulation took. */
  wallMs: number;
  /** Game-clock seconds at which each level was reached (index 0 = level 2). */
  levelTimes: number[];
  /** Weapon ids in the inventory at the end. */
  weapons: string[];
  /** Lowest HP fraction seen in each game minute (a measure of how hard that minute was). */
  minuteLowHp: number[];
  /** What dealt the final hit (an enemy or boss def id), when the run ended in defeat. */
  killedBy?: string;
  /** Whether a boss fight was under way when the run ended. */
  bossActiveAtEnd: boolean;
  /** Enemies alive when the run ended. */
  enemiesAtEnd: number;
  /** A sample every 30 game seconds: HP fraction, enemies alive, level, boss fight on. */
  timeline: { t: number; hp: number; enemies: number; level: number; boss: boolean }[];
}

const DEFAULT_LOADOUT: SoloLoadout = {
  rerolls: 0,
  banishes: 0,
  revival: 0,
  extraChoice: false,
  catalystAffinity: 0,
  greed: 0,
};

function lcg(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Higher is better. Weapons first (they are what kills), then passives, then catalysts. */
function scoreChoice(c: UpgradeChoice, weaponCount: number): number {
  switch (c.type) {
    case 'upgrade_weapon':
      return 50 + c.newLevel;
    case 'new_weapon':
      return weaponCount < 4 ? 46 : 20;
    case 'upgrade_passive':
      return 34 + c.newLevel;
    case 'new_passive':
      return 30;
    case 'upgrade_catalyst':
      return 36 + c.newLevel;
    case 'new_catalyst':
      return 32;
    case 'gold':
      return 5;
  }
}

function isLoot(t: PickupEntity['type']): boolean {
  return t.startsWith('xp') || t === 'coin' || t === 'food' || t === 'magnet' || t === 'vacuum' || t === 'chest';
}

/** Steering: repel from nearby enemies and enemy shots, attract to loot, with a drift so it never parks. */
function steer(
  px: number,
  py: number,
  enemies: readonly EnemyEntity[],
  projectiles: readonly ProjectileEntity[],
  pickups: readonly PickupEntity[],
  p: SkillProfile,
  tick: number,
  hpFrac: number,
): { x: number; y: number } {
  let rx = 0;
  let ry = 0;
  let danger = 0;
  const sense2 = p.senseRadius * p.senseRadius;
  // In a boss fight the hazards on the ground (the Hollow King's bone spikes and prison ring are enemy
  // projectiles that sit for seconds) are what decide the fight, and a human reads and steps out of them.
  const bossOn = enemies.some((e) => e.isBoss && !e.isDead);
  const hazardRadius = bossOn ? 230 : 150;
  const hazardPush = bossOn ? 2.5 : 1;
  for (const e of enemies) {
    if (e.isDead) continue; // a corpse fading out is not a threat
    const dx = px - e.x;
    const dy = py - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > sense2 || d2 < 1) continue;
    const d = Math.sqrt(d2);
    // Heavy hitters are respected more; close enemies dominate. A healthy player fights a boss instead
    // of only running from it, so its push is weaker until health drops.
    const weight = (e.isBoss ? (hpFrac > 0.55 ? 0.7 : 2.2) : 1) * Math.min(3, 1 + e.damage / 25);
    const f = (weight * 60) / Math.max(24, d - e.radius);
    rx += (dx / d) * f;
    ry += (dy / d) * f;
    danger += f;
  }
  for (const pr of projectiles) {
    if (!pr.isEnemy) continue;
    const dx = px - pr.x;
    const dy = py - pr.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > hazardRadius * hazardRadius || d2 < 1) continue;
    const d = Math.sqrt(d2);
    rx += (dx / d) * hazardPush * (40 / Math.max(16, d));
    ry += (dy / d) * hazardPush * (40 / Math.max(16, d));
    danger += hazardPush * (40 / Math.max(16, d));
  }
  // Loot: the nearest item inside the radius.
  let best: PickupEntity | null = null;
  let bestD2 = p.lootRadius * p.lootRadius;
  for (const pr of pickups) {
    if (!isLoot(pr.type)) continue;
    const dx = pr.x - px;
    const dy = pr.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = pr;
    }
  }
  const calm = danger < 1.2;
  if (best && (calm || p.lootPull > 0.45)) {
    const dx = best.x - px;
    const dy = best.y - py;
    const d = Math.sqrt(bestD2) || 1;
    const pull = calm ? 1.2 : p.lootPull;
    rx += (dx / d) * pull * 1.4;
    ry += (dy / d) * pull * 1.4;
  }
  // Fight, don't just flee: while healthy and not swamped, close on the nearest ordinary enemy so
  // melee weapons and auras can work. A player who only ever runs never kills anything.
  if (hpFrac > 0.55 && danger < 3.2) {
    let target: EnemyEntity | null = null;
    let targetD2 = 300 * 300;
    for (const e of enemies) {
      if (e.isBoss || e.isDead) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < targetD2 && d2 > 70 * 70) {
        targetD2 = d2;
        target = e;
      }
    }
    if (target) {
      const dx = target.x - px;
      const dy = target.y - py;
      const d = Math.sqrt(targetD2) || 1;
      rx += (dx / d) * 1.1;
      ry += (dy / d) * 1.1;
    }
  }
  // A boss fight: close to a distance the player's weapons can work at (nearer while healthy), and keep it
  // there. Without this the bot only ever flees a boss and says nothing about whether it can be beaten.
  const boss = enemies.find((e) => e.isBoss && !e.isDead);
  if (boss && hpFrac > 0.45) {
    const dx = boss.x - px;
    const dy = boss.y - py;
    const d = Math.hypot(dx, dy) || 1;
    // Just outside the Hollow King's 150 px cleave while healthy, further back when hurt.
    const want = hpFrac > 0.7 ? 175 : 240;
    if (d > want) {
      rx += (dx / d) * 1.4;
      ry += (dy / d) * 1.4;
    }
  }
  // Slow circling keeps the bot from standing still or running into a dead end.
  const phase = tick / 240;
  rx += Math.cos(phase) * 0.35;
  ry += Math.sin(phase) * 0.35;
  const len = Math.hypot(rx, ry) || 1;
  return { x: rx / len, y: ry / len };
}

export function playBot(opts: BotOptions): BotRun {
  const profile = PROFILES[opts.skill ?? 'average'];
  const loadout: SoloLoadout = { ...(opts.loadout ?? DEFAULT_LOADOUT), ...(opts.heat ? { heat: opts.heat } : {}) };
  const rand = lcg(opts.seed * 31 + opts.classId.length);
  const live = createInputState();
  const run = new SoloRun({
    setup: { seed: opts.seed, classId: opts.classId, doubleTime: !!opts.doubleTime, loadout },
    viewport: opts.viewport ?? { w: 1280, h: 720 },
    inputSource: () => live,
    hooks: { onDeath: (id) => (killedBy = id) },
  });

  const max = opts.maxSteps ?? 30 * 60 * 60;
  const levelTimes: number[] = [];
  const minuteLowHp: number[] = [];
  const timeline: BotRun['timeline'] = [];
  let killedBy: string | undefined;
  let nextSample = 0;
  let lastLevel = 1;
  let dir = { x: 0, y: 0 };
  const t0 = Date.now();

  for (let i = 0; i < max && run.ended === null; i++) {
    // Level-ups open the picker; choose like a player who knows the priorities.
    while (useAltairGameStore.getState().phase === 'upgrading') {
      const s = useAltairGameStore.getState();
      const choices = s.upgradeChoices;
      if (choices.length === 0) break;
      let bestIdx = 0;
      let bestScore = -1;
      choices.forEach((c, idx) => {
        const sc = scoreChoice(c, s.weapons.length) + rand() * 2;
        if (sc > bestScore) {
          bestScore = sc;
          bestIdx = idx;
        }
      });
      // Reroll a poor hand once if a reroll is banked.
      if (bestScore < 33 && s.rerollsRemaining > 0) {
        run.reroll();
        continue;
      }
      run.pick(bestIdx);
    }

    if (i % profile.reactionSteps === 0) {
      const w = run.world;
      const hpFrac = w.player.maxHp > 0 ? w.player.hp / w.player.maxHp : 0;
      dir = steer(w.player.x, w.player.y, w.enemies, w.projectiles, w.pickups, profile, i, hpFrac);
    }
    live.keys.clear();
    live.dx = dir.x;
    live.dy = dir.y;
    run.step();

    const level = useAltairGameStore.getState().level;
    if (level > lastLevel) {
      for (let l = lastLevel; l < level; l++) levelTimes.push(run.world.time);
      lastLevel = level;
    }
    if (run.world.time >= nextSample) {
      nextSample += 30;
      timeline.push({
        t: Math.round(run.world.time),
        hp: run.world.player.maxHp > 0 ? Math.round((run.world.player.hp / run.world.player.maxHp) * 100) / 100 : 0,
        enemies: run.world.enemies.length,
        level: useAltairGameStore.getState().level,
        boss: run.world.bossActive,
      });
    }
    const minute = Math.floor(run.world.time / 60);
    const frac = run.world.player.maxHp > 0 ? run.world.player.hp / run.world.player.maxHp : 0;
    minuteLowHp[minute] = Math.min(minuteLowHp[minute] ?? 1, frac);
  }

  return {
    result: run.result(),
    wallMs: Date.now() - t0,
    levelTimes,
    weapons: run.world.weapons.map((w) => w.weaponId),
    minuteLowHp: Array.from(minuteLowHp, (v) => v ?? 1),
    killedBy,
    bossActiveAtEnd: run.world.bossActive,
    enemiesAtEnd: run.world.enemies.length,
    timeline,
  };
}
