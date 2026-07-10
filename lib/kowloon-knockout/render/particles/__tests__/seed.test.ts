import { describe, it, expect } from 'vitest';
import { seedRain, seedFog, type ParticleBounds } from '../seed';

const BOUNDS: ParticleBounds = { radius: 12, floor: 0, ceiling: 18 };
const FOG_BOUNDS: ParticleBounds = { radius: 12, floor: 0, ceiling: 2.5 };

describe('seedRain', () => {
    it('returns positions and velocities of length count*3', () => {
        const f = seedRain(100, BOUNDS, 1);
        expect(f.positions).toHaveLength(300);
        expect(f.velocities).toHaveLength(300);
    });
    it('is deterministic for the same seed', () => {
        expect(Array.from(seedRain(50, BOUNDS, 7).positions))
            .toEqual(Array.from(seedRain(50, BOUNDS, 7).positions));
    });
    it('places all particles inside the cylinder and height band', () => {
        const f = seedRain(200, BOUNDS, 3);
        for (let i = 0; i < 200; i++) {
            const x = f.positions[i * 3], y = f.positions[i * 3 + 1], z = f.positions[i * 3 + 2];
            expect(Math.hypot(x, z)).toBeLessThanOrEqual(BOUNDS.radius + 1e-6);
            expect(y).toBeGreaterThanOrEqual(BOUNDS.floor);
            expect(y).toBeLessThanOrEqual(BOUNDS.ceiling);
        }
    });
    it('gives every drop a downward velocity', () => {
        const f = seedRain(200, BOUNDS, 9);
        for (let i = 0; i < 200; i++) expect(f.velocities[i * 3 + 1]).toBeLessThan(0);
    });
});

describe('seedFog', () => {
    it('keeps motes in a near-floor band', () => {
        const f = seedFog(200, FOG_BOUNDS, 2);
        for (let i = 0; i < 200; i++) {
            expect(f.positions[i * 3 + 1]).toBeLessThanOrEqual(FOG_BOUNDS.ceiling);
            expect(f.positions[i * 3 + 1]).toBeGreaterThanOrEqual(FOG_BOUNDS.floor);
        }
    });
    it('gives motes near-horizontal drift (small vy)', () => {
        const f = seedFog(200, FOG_BOUNDS, 5);
        for (let i = 0; i < 200; i++) expect(Math.abs(f.velocities[i * 3 + 1])).toBeLessThan(0.2);
    });
});
