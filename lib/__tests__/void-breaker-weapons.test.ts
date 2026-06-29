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
