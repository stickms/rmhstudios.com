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
});
