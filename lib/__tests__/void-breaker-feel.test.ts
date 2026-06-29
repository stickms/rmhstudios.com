import { describe, it, expect } from 'vitest';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
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
function advanceToPlaying(g: VoidBreakerEngine): void {
  for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, makeInput());
}

describe('feel layer — trauma shake', () => {
  it('addTrauma clamps to [0,1] and decays to ~0 over time', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.waveEnemiesAlive = 999;                 // don't let the wave clear
    g.player.invincibleUntil = g.elapsedMs + 1e9;
    g.addTrauma(5);                            // over-add
    expect(g.trauma).toBe(1);                  // clamped
    for (let i = 0; i < 120; i++) g.update(0.05, makeInput());
    expect(g.trauma).toBeLessThan(0.05);       // decayed
  });

  it('shake magnitude scales with trauma squared (small trauma ≪ big trauma)', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.waveEnemiesAlive = 999;
    g.player.invincibleUntil = g.elapsedMs + 1e9;
    g.addTrauma(0.2);
    g.update(0.016, makeInput());
    const small = Math.abs(g.shakeX) + Math.abs(g.shakeY);
    g.trauma = 0; g.shakeX = 0; g.shakeY = 0;
    g.addTrauma(0.8);
    g.update(0.016, makeInput());
    const big = Math.abs(g.shakeX) + Math.abs(g.shakeY);
    // quadratic curve: 4x trauma → much more than 4x shake (statistically; allow slack)
    expect(big).toBeGreaterThan(small * 5);
  });
});

describe('feel layer — headless flag', () => {
  it('headless disables hitstop so the sim is not time-distorted', () => {
    const g = new VoidBreakerEngine();
    g.headless = true;
    g.startGame();
    advanceToPlaying(g);
    // @ts-expect-error private method exercised for the headless no-op contract
    g.requestHitStop(200);
    expect(g.hitStopTimer).toBe(0);            // no-op under headless
  });
});
