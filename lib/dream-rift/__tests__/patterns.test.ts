import { describe, it, expect } from 'vitest';
import { spawnRadial, spawnAimed, applyDifficultyToPattern } from '../patterns';
import type { BulletPatternDef, DifficultyMultipliers } from '../types';

describe('spawnRadial', () => {
  it('generates correct number of bullets in a full circle', () => {
    const bullets = spawnRadial(100, 100, {
      type: 'radial', bulletSprite: 'bullet_red', count: 8, speed: 2,
      angle: 0, spread: 360, interval: 10, duration: 60,
    });
    expect(bullets).toHaveLength(8);
    expect(bullets[0].vx).toBeCloseTo(2, 1);
    expect(bullets[0].vy).toBeCloseTo(0, 1);
  });
});

describe('spawnAimed', () => {
  it('fires bullets aimed at target', () => {
    const bullets = spawnAimed(0, 0, 100, 0, {
      type: 'aimed', bulletSprite: 'bullet_blue', count: 1, speed: 3,
      angle: 0, spread: 0, interval: 10, duration: 60,
    });
    expect(bullets).toHaveLength(1);
    expect(bullets[0].vx).toBeCloseTo(3, 1);
    expect(bullets[0].vy).toBeCloseTo(0, 1);
  });
});

describe('applyDifficultyToPattern', () => {
  it('scales pattern values by difficulty multipliers', () => {
    const pattern: BulletPatternDef = {
      type: 'radial', bulletSprite: 'b', count: 10, speed: 2,
      angle: 0, spread: 360, interval: 10, duration: 60,
    };
    const mults: DifficultyMultipliers = {
      bulletCount: 2, bulletSpeed: 1.5, bossHp: 1, spellCardCount: 3, enemyDensity: 1, grazeWindow: 16,
    };
    const scaled = applyDifficultyToPattern(pattern, mults);
    expect(scaled.count).toBe(20);
    expect(scaled.speed).toBe(3);
  });
});
