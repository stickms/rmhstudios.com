import { describe, it, expect } from 'vitest';
import { generateSkyline } from '../skyline';

describe('generateSkyline', () => {
    it('returns one array per layer', () => {
        expect(generateSkyline(1, 3)).toHaveLength(3);
        expect(generateSkyline(1, 2)).toHaveLength(2);
    });
    it('is deterministic for the same seed+layers', () => {
        expect(generateSkyline(42, 3)).toEqual(generateSkyline(42, 3));
    });
    it('differs for different seeds', () => {
        expect(generateSkyline(1, 2)).not.toEqual(generateSkyline(2, 2));
    });
    it('places farther layers at larger radius', () => {
        const [near, , far] = generateSkyline(7, 3);
        const radius = (t: { position: [number, number, number] }) => Math.hypot(t.position[0], t.position[2]);
        const avg = (a: { position: [number, number, number] }[]) => a.reduce((s, t) => s + radius(t), 0) / a.length;
        expect(avg(far)).toBeGreaterThan(avg(near));
    });
    it('makes farther layers darker (fog depth)', () => {
        const [near, , far] = generateSkyline(7, 3);
        const lum = (a: { color: [number, number, number] }[]) => a.reduce((s, t) => s + t.color[0] + t.color[1] + t.color[2], 0) / a.length;
        expect(lum(far)).toBeLessThan(lum(near));
    });
    it('puts more buildings in farther layers', () => {
        const [near, , far] = generateSkyline(7, 3);
        expect(far.length).toBeGreaterThan(near.length);
    });
});
