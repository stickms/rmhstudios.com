import { describe, it, expect } from 'vitest';
import { stepParticle, type BurstParticle, type BurstKind } from '../burst';

function make(kind: BurstKind, over: Partial<BurstParticle> = {}): BurstParticle {
    return { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, life: 1, maxLife: 1, size: 0.2, kind, active: true, ...over };
}

describe('stepParticle', () => {
    it('pulls sparks down under gravity', () => {
        const p = make('spark', { vy: 0 });
        stepParticle(p, 0.1);
        expect(p.vy).toBeLessThan(0);
    });
    it('bounces debris off the floor', () => {
        const p = make('debris', { y: 0.06, vy: -5 });
        stepParticle(p, 0.1);
        expect(p.y).toBeCloseTo(0.05, 5);
        expect(p.vy).toBeGreaterThan(0);          // velocity reflected upward
    });
    it('makes smoke rise and decelerate', () => {
        const p = make('smoke', { vx: 10, vy: 0 });
        stepParticle(p, 0.1);
        expect(Math.abs(p.vx)).toBeLessThan(10);  // drag
        expect(p.vy).toBeGreaterThan(0);          // buoyancy
    });
    it('expands smoke over time', () => {
        const p = make('smoke', { size: 0.2 });
        stepParticle(p, 0.1);
        expect(p.size).toBeGreaterThan(0.2);
    });
    it('deactivates a particle whose life runs out', () => {
        const p = make('spark', { life: 0.05 });
        stepParticle(p, 0.1);
        expect(p.active).toBe(false);
    });
});
