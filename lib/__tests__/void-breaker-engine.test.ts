import { describe, it, expect } from 'vitest';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import { SHARD_MULT_PER, SURGE_DURATION, DET_MIN_SHARDS } from '@/lib/void-breaker/constants';
import type { InputState } from '@/lib/void-breaker/types';

function makeInput(over: Partial<InputState> = {}): InputState {
  return {
    up: false, down: false, left: false, right: false,
    mouseX: 800, mouseY: 500,
    detonate: false, dash: false, focus: false, pause: false,
    voidPulse: false, phaseShift: false, reflectShield: false, allySynergy: false,
    ...over,
  };
}

/** Tick the engine until it leaves the countdown into active play. */
function advanceToPlaying(g: VoidBreakerEngine): void {
  const input = makeInput();
  for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, input);
}

/** Activate a pooled enemy at a position with given hp. Returns it. */
function placeEnemy(g: VoidBreakerEngine, x: number, y: number, hp: number) {
  const e = g.enemies.find(en => !en.active)!;
  e.active = true; e.isBoss = false; e.isElite = false;
  e.type = 'drifter'; e.x = x; e.y = y; e.radius = 10;
  e.hp = hp; e.maxHp = hp; e.shardCount = 1; e.value = 10;
  e.color = '#8866cc'; e.hitFlashUntil = 0; e.bossSpecialActive = false;
  return e;
}

/** Activate a pooled, stationary player bullet at a position. Returns it. */
function placePlayerProj(g: VoidBreakerEngine, x: number, y: number, dmg: number, pierce: number) {
  const p = g.projectiles.find(pr => !pr.active)!;
  p.active = true; p.isPlayer = true; p.x = x; p.y = y;
  p.vx = 0; p.vy = 0; p.radius = 4; p.damage = dmg; p.life = 2;
  p.pierce = pierce; p.lastHitId = -1;
  return p;
}

describe('VoidBreakerEngine', () => {
  it('initializes a fresh run', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    expect(g.state).toBe('countdown');
    expect(g.player.hp).toBe(3);
    expect(g.player.shards).toBe(0);
    expect(g.score).toBe(0);
    expect(g.surgeMultiplier).toBe(1);
  });

  it('reaches playing and spawns the first wave', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    expect(g.state).toBe('playing');
    expect(g.wave).toBe(1);
    expect(g.waveEnemiesAlive).toBeGreaterThan(0);
  });

  it('detonate consumes shards and banks a Surge multiplier (the "never detonate" fix)', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.player.shards = 20;
    g.player.detonateCooldown = 0;
    // First playing frame with detonate held (prevDet starts false) triggers it.
    g.update(0.05, makeInput({ detonate: true }));
    expect(g.player.shards).toBe(0);            // shield spent
    expect(g.detonations).toBe(1);
    // Surge banks the shard multiplier you spent (1 + 20 * 0.1 = 3).
    expect(g.surgeMultiplier).toBeCloseTo(1 + 20 * SHARD_MULT_PER, 5);
    expect(g.totalMultiplier).toBeGreaterThan(1);
  });

  it('Surge decays back to 1 over its duration', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.player.shards = 30;
    g.player.detonateCooldown = 0;
    g.update(0.05, makeInput({ detonate: true }));
    expect(g.surgeMultiplier).toBeGreaterThan(2);
    // Freeze the wave + make the player unkillable so we can watch the decay.
    g.waveEnemiesAlive = 999;
    g.player.invincibleUntil = g.elapsedMs + 1e9;
    for (let i = 0; i < Math.ceil(SURGE_DURATION / 0.05) + 10; i++) g.update(0.05, makeInput());
    expect(g.state).toBe('playing');
    expect(g.surgeMultiplier).toBeLessThan(1.05);
  });

  it('detonate requires the shard minimum', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.player.shards = DET_MIN_SHARDS - 1;
    g.player.detonateCooldown = 0;
    g.update(0.05, makeInput({ detonate: true }));
    expect(g.detonations).toBe(0);
    expect(g.player.shards).toBe(DET_MIN_SHARDS - 1); // untouched
  });

  it('reality-warp control inversion flips movement', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.obstacles = []; // isolate movement from collision

    // Baseline: holding right moves +x.
    g.player.x = 800; g.player.y = 500;
    g.update(0.05, makeInput({ right: true }));
    expect(g.player.x).toBeGreaterThan(800);

    // Inverted: holding right now moves -x.
    g.controlsInverted = true;
    g.invertTimer = 5; // keep it inverted across the frame
    g.player.x = 800;
    g.update(0.05, makeInput({ right: true }));
    expect(g.player.x).toBeLessThan(800);
  });

  it('siphon (lifesteal) heals on kill', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.obstacles = [];
    g.stats.lifestealChance = 1;        // guaranteed
    g.player.hp = 1;                     // below max
    g.player.x = 800; g.player.y = 500;
    placeEnemy(g, 1200, 500, 1);
    placePlayerProj(g, 1200, 500, 1, 0);
    g.update(0.05, makeInput());
    expect(g.player.hp).toBe(2);
  });

  it('deadeye crit deals extra damage and flags a CRIT', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.obstacles = [];
    g.stats.critChance = 1;             // guaranteed crit, critMult = 2
    const e = placeEnemy(g, 1200, 500, 10);
    placePlayerProj(g, 1200, 500, 1, 0);
    g.update(0.05, makeInput());
    expect(e.hp).toBe(8);               // 10 - round(1 * 2)
    expect(g.popups.some(p => p.text === 'CRIT')).toBe(true);
  });

  it('applies meta-progression bonuses at run start', () => {
    const g = new VoidBreakerEngine();
    g.metaBonuses = {
      bonusMaxHp: 2, damageBonus: 1, moveSpeedMult: 1.12,
      startShards: 6, fireRateMult: 0.85,
    };
    g.startGame();
    expect(g.player.maxHp).toBe(3 + 2);
    expect(g.player.hp).toBe(5);
    expect(g.player.shards).toBe(6);
    expect(g.stats.damageBonus).toBe(1);
    expect(g.stats.moveSpeedMult).toBeCloseTo(1.12, 5);
    expect(g.stats.fireRateMult).toBeCloseTo(0.85, 5);
  });

  it('piercing rounds pass through an enemy instead of stopping', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.obstacles = [];
    const e = placeEnemy(g, 1200, 500, 10);
    const proj = placePlayerProj(g, 1200, 500, 1, 1); // pierce 1
    g.update(0.05, makeInput());
    expect(e.hp).toBe(9);
    expect(proj.active).toBe(true);     // still flying
    expect(proj.pierce).toBe(0);        // one pierce spent
  });
});
