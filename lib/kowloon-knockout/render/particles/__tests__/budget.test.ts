import { describe, it, expect } from 'vitest';
import { particleBudget } from '../budget';

describe('particleBudget', () => {
    it('gives ultra the full counts', () => {
        expect(particleBudget('ultra')).toEqual({ rain: 1800, fog: 2400, burstCap: 1500 });
    });
    it('gives high reduced counts with fog', () => {
        const b = particleBudget('high');
        expect(b.fog).toBeGreaterThan(0);
        expect(b.rain).toBeLessThan(particleBudget('ultra').rain);
    });
    it('gives medium rain but no fog', () => {
        const b = particleBudget('medium');
        expect(b.rain).toBeGreaterThan(0);
        expect(b.fog).toBe(0);
    });
    it('gives low no rain and no fog, only bursts', () => {
        const b = particleBudget('low');
        expect(b.rain).toBe(0);
        expect(b.fog).toBe(0);
        expect(b.burstCap).toBeGreaterThan(0);
    });
    it('scales burst cap down from ultra to low', () => {
        expect(particleBudget('ultra').burstCap).toBeGreaterThan(particleBudget('low').burstCap);
    });
});
