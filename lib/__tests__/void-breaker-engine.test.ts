import { describe, it, expect } from 'vitest';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import { SHARD_MULT_PER, SURGE_DURATION, DET_MIN_SHARDS } from '@/lib/void-breaker/constants';
import { getCharacter } from '@/lib/void-breaker/characters';
import { combineModifiers } from '@/lib/void-breaker/modifiers';
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

/**
 * Isolate the arena for a deterministic combat test: clear the random wave
 * enemies + projectiles and obstacles, and keep waveEnemiesAlive high so the
 * clear doesn't fire (which would flip state to 'upgrade').
 */
function isolate(g: VoidBreakerEngine): void {
  g.enemies.forEach(e => (e.active = false));
  g.projectiles.forEach(p => (p.active = false));
  g.obstacles = [];
  g.waveEnemiesAlive = 99;
}

/** Activate a pooled enemy at a position with given hp. Returns it. */
function placeEnemy(g: VoidBreakerEngine, x: number, y: number, hp: number) {
  const e = g.enemies.find(en => !en.active)!;
  e.active = true; e.isBoss = false; e.isElite = false;
  e.type = 'drifter'; e.x = x; e.y = y; e.radius = 10;
  e.hp = hp; e.maxHp = hp; e.shardCount = 1; e.value = 10;
  e.color = '#8866cc'; e.hitFlashUntil = 0; e.bossSpecialActive = false;
  e.anim = 'alive'; e.animTimer = 0;
  // Fully inert so it stays put (no stale speed/AI state from the pooled slot).
  e.speed = 0; e.vx = 0; e.vy = 0; e.dashState = 'idle'; e.dashTimer = 0;
  e.orbitFireTimer = 99; e.telegraphTimer = 0; e.bossSpecialTimer = 0;
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
    isolate(g);
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
    isolate(g);
    g.stats.critChance = 1;             // guaranteed crit, critMult = 2
    const e = placeEnemy(g, 1200, 500, 10);
    placePlayerProj(g, 1200, 500, 1, 0);
    g.update(0.05, makeInput());
    expect(e.hp).toBe(8);               // 10 - round(1 * 2)
    expect(g.popups.some(p => p.text === 'CRIT')).toBe(true);
  });

  it('hive broods mini-drifters', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    isolate(g);
    g.player.x = 800; g.player.y = 500;
    const hive = placeEnemy(g, 1300, 500, 6);
    hive.type = 'hive';
    hive.bossSpecialTimer = 0;          // brood on the next tick
    const before = g.enemies.filter(e => e.active && e.type === 'mini_drifter').length;
    g.update(0.05, makeInput());
    const after = g.enemies.filter(e => e.active && e.type === 'mini_drifter').length;
    expect(after).toBeGreaterThan(before);
    expect(hive.active).toBe(true);     // hive itself persists
  });

  it('bomber lobs a fused bomb that explodes for AoE damage', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    isolate(g);
    g.player.x = 800; g.player.y = 500;
    const bomber = placeEnemy(g, 1100, 500, 3);
    bomber.type = 'bomber';
    bomber.bossSpecialTimer = 0;        // lob immediately
    g.update(0.05, makeInput());
    const bomb = g.projectiles.find(pr => pr.active && pr.fuse > 0);
    expect(bomb).toBeTruthy();          // a fused bomb exists
    // Park the bomb on the (invincibility-cleared) player and burn the fuse.
    bomb!.x = 800; bomb!.y = 500; bomb!.vx = 0; bomb!.vy = 0;
    g.player.invincibleUntil = 0; g.elapsedMs = 9000;
    const hpBefore = g.player.hp;
    for (let i = 0; i < 40 && bomb!.active; i++) { g.elapsedMs = 9000; g.player.invincibleUntil = 0; g.update(0.05, makeInput()); }
    expect(bomb!.active).toBe(false);   // detonated
    expect(g.player.hp).toBeLessThan(hpBefore); // caught in the blast
  });

  it('void thorns reflects contact damage to the attacker', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    isolate(g);
    g.player.fireTimer = 99;            // suppress auto-fire interference
    g.player.invincibleUntil = 0;
    g.elapsedMs = 5000;                 // ensure not invincible
    g.stats.thornsDamage = 3;
    g.player.x = 800; g.player.y = 500;
    // hp == thornsDamage: a plain drifter contact can't kill it, so the enemy
    // dying *proves* thorns reflected. (We don't assert player HP — a contact
    // kill can drop a heart onto the player and heal the hit back.)
    const e = placeEnemy(g, 800, 500, 3);
    for (let i = 0; i < 4 && e.anim === 'alive'; i++) {
      g.player.invincibleUntil = 0; g.elapsedMs = 5000;
      g.update(0.05, makeInput());
    }
    expect(e.anim).not.toBe('alive');   // killed (dying/freed) — could only die to thorns
  });

  it('applies run modifiers to the loadout', () => {
    const frail = new VoidBreakerEngine();
    frail.runModifiers = combineModifiers(['frail']).effects;
    frail.startGame();
    expect(frail.player.maxHp).toBe(2);            // 3 - 1

    const glass = new VoidBreakerEngine();
    glass.runModifiers = combineModifiers(['glasscannon']).effects;
    glass.startGame();
    expect(glass.player.maxHp).toBe(1);            // 3 - 2 (floored at 1)
    expect(glass.stats.damageBonus).toBe(2);
  });

  it('applies the selected character at run start', () => {
    const jug = new VoidBreakerEngine();
    jug.character = getCharacter('juggernaut');
    jug.startGame();
    expect(jug.player.maxHp).toBe(3 + 2);
    expect(jug.stats.damageBonus).toBe(1);
    expect(jug.stats.moveSpeedMult).toBeCloseTo(0.85, 5);
    expect(jug.stats.dashCooldownMult).toBeCloseTo(1.25, 5);

    const gun = new VoidBreakerEngine();
    gun.character = getCharacter('gunner');
    gun.startGame();
    expect(gun.player.shards).toBe(3);
    expect(gun.stats.fireRateMult).toBeCloseTo(0.68, 5);
  });

  it('character and meta bonuses stack at run start', () => {
    const g = new VoidBreakerEngine();
    g.character = getCharacter('juggernaut');     // +2 HP, x0.85 move
    g.metaBonuses = { bonusMaxHp: 1, damageBonus: 0, moveSpeedMult: 1.06, startShards: 3, fireRateMult: 1 };
    g.startGame();
    expect(g.player.maxHp).toBe(3 + 2 + 1);
    expect(g.player.shards).toBe(3);
    expect(g.stats.moveSpeedMult).toBeCloseTo(0.85 * 1.06, 5);
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
    isolate(g);
    const e = placeEnemy(g, 1200, 500, 10);
    const proj = placePlayerProj(g, 1200, 500, 1, 1); // pierce 1
    g.update(0.05, makeInput());
    expect(e.hp).toBe(9);
    expect(proj.active).toBe(true);     // still flying
    expect(proj.pierce).toBe(0);        // one pierce spent
  });
});
