import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon, isWeaponId } from '@/lib/void-breaker/weapons';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import type { InputState } from '@/lib/void-breaker/types';

function mk(over: Partial<InputState> = {}): InputState {
  return { up:false,down:false,left:false,right:false,mouseX:1200,mouseY:500,
    detonate:false,dash:false,focus:false,pause:false,voidPulse:false,phaseShift:false,
    reflectShield:false,allySynergy:false, ...over };
}
function toPlaying(g: VoidBreakerEngine) { for (let i=0;i<200 && g.state!=='playing';i++) g.update(0.05, mk()); }
function fireOnce(g: VoidBreakerEngine) {
  g.enemies.forEach(e => e.active = false);
  g.projectiles.forEach(p => p.active = false);
  g.waveEnemiesAlive = 99; g.player.fireTimer = 0; g.player.x = 800; g.player.y = 500;
  g.update(0.016, mk());
}

describe('weapons data', () => {
  it('has 5 weapons with unique ids', () => {
    expect(WEAPONS).toHaveLength(5);
    expect(new Set(WEAPONS.map(w => w.id)).size).toBe(5);
  });
  it('pulse is the free default and matches current blaster stats', () => {
    const p = getWeapon('pulse');
    expect(p.unlockCost).toBe(0);
    expect(p.baseFireInterval).toBeCloseTo(0.20, 5);
    expect(p.baseDamage).toBe(1);
    expect(p.baseProjSpeed).toBe(550);
    expect(p.fire.mode).toBe('single');
  });
  it('every non-default weapon has a positive unlock cost and sane base stats', () => {
    for (const w of WEAPONS.filter(w => w.id !== 'pulse')) {
      expect(w.unlockCost).toBeGreaterThan(0);
      expect(w.baseFireInterval).toBeGreaterThan(0);
      expect(w.baseDamage).toBeGreaterThan(0);
      expect(w.baseProjSpeed).toBeGreaterThan(0);
    }
  });
  it('getWeapon falls back to pulse for an unknown id, isWeaponId validates', () => {
    // @ts-expect-error intentionally invalid
    expect(getWeapon('nope').id).toBe('pulse');
    expect(isWeaponId('railgun')).toBe(true);
    expect(isWeaponId('nope')).toBe(false);
    expect(isWeaponId(42)).toBe(false);
  });
  it('each fire mode is represented exactly once across the roster', () => {
    const modes = WEAPONS.map(w => w.fire.mode).sort();
    expect(modes).toEqual(['arc', 'lob', 'railgun', 'single', 'spread']);
  });
});

describe('firePlayerProj dispatcher', () => {
  it('pulse fires a single player projectile', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g);
    fireOnce(g);
    expect(g.projectiles.filter(p => p.active && p.isPlayer).length).toBe(1);
  });
  it('scatter fires multiple pellets', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('scatter'); g.startGame(); toPlaying(g);
    fireOnce(g);
    expect(g.projectiles.filter(p => p.active && p.isPlayer).length).toBeGreaterThanOrEqual(5);
  });
  it('railgun rounds pierce everything', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('railgun'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const round = g.projectiles.find(p => p.active && p.isPlayer)!;
    expect(round.pierce).toBeGreaterThan(50);
  });
  it('grenade lobs a fused player bomb', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('grenade'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const bomb = g.projectiles.find(p => p.active && p.isPlayer && p.fuse > 0);
    expect(bomb).toBeTruthy();
    expect(bomb!.blastRadius).toBeGreaterThan(0);
  });
  it('arc bolts carry chain hops', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('arc'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const bolt = g.projectiles.find(p => p.active && p.isPlayer)!;
    expect(bolt.chains).toBeGreaterThanOrEqual(2);
  });
});

/** Activate a pooled enemy at (x,y) with hp. */
function placeE(g: VoidBreakerEngine, x: number, y: number, hp: number) {
  const e = g.enemies.find(en => !en.active)!;
  Object.assign(e, {
    active: true, isBoss: false, isElite: false, type: 'drifter', x, y, radius: 10,
    hp, maxHp: hp, shardCount: 0, value: 10, color: '#fff', anim: 'alive', animTimer: 0,
    speed: 0, vx: 0, vy: 0, dashState: 'idle', bossSpecialActive: false, hitFlashUntil: 0,
  });
  return e;
}
/** Activate a pooled player projectile at (x,y). */
function placeP(g: VoidBreakerEngine, x: number, y: number, over: Record<string, unknown> = {}) {
  const p = g.projectiles.find(pr => !pr.active)!;
  Object.assign(p, {
    active: true, isPlayer: true, x, y, vx: 0, vy: 0, radius: 4, damage: 1, life: 2,
    pierce: 0, lastHitId: -1, fuse: 0, blastRadius: 0,
    bounces: 0, chains: 0, explodeOnHit: false, explodeRadius: 0, homing: 0, ...over,
  });
  return p;
}
function isolateArena(g: VoidBreakerEngine) {
  g.enemies.forEach(e => e.active = false);
  g.projectiles.forEach(p => p.active = false);
  g.obstacles = []; g.waveEnemiesAlive = 99; g.player.fireTimer = 99;
}

describe('transformer behaviors', () => {
  it('explosive rounds damage a nearby second enemy (AoE)', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g); isolateArena(g);
    placeE(g, 1200, 500, 1);              // primary target, dies
    const b = placeE(g, 1230, 500, 5);   // bystander in blast radius
    placeP(g, 1200, 500, { explodeOnHit: true, explodeRadius: 60 });
    g.update(0.05, mk());
    expect(b.hp).toBeLessThan(5);
  });

  it('chain lightning arcs to a nearby enemy', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g); isolateArena(g);
    placeE(g, 1200, 500, 1);
    const b = placeE(g, 1320, 500, 5);   // within chain range
    placeP(g, 1200, 500, { chains: 2 });
    g.update(0.05, mk());
    expect(b.hp).toBeLessThan(5);
  });

  it('ricochet keeps the bullet alive and redirects to a new target', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g); isolateArena(g);
    placeE(g, 1200, 500, 1);             // primary, dies on hit
    placeE(g, 1200, 360, 5);            // off-axis second target to bounce toward
    const p = placeP(g, 1200, 500, { bounces: 1, vx: 0, vy: 0 });
    g.update(0.05, mk());
    expect(p.active).toBe(true);         // still flying
    expect(p.bounces).toBe(0);           // hop spent
    expect(p.vy).not.toBe(0);            // redirected off the x-axis
  });

  it('homing curves a bullet toward an off-axis enemy', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g); isolateArena(g);
    placeE(g, 1200, 200, 50);            // far above the bullet's path
    const p = placeP(g, 800, 500, { vx: 400, vy: 0, homing: 6, life: 5 });
    const before = Math.atan2(p.vy, p.vx);
    for (let i = 0; i < 5; i++) g.update(0.05, mk());
    const after = Math.atan2(p.vy, p.vx);
    expect(after).not.toBeCloseTo(before, 3); // heading changed (curved upward)
  });
});
