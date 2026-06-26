import { describe, it, expect } from 'vitest';
import { signAnim, type SignPattern } from '../signage';

const PATTERNS: SignPattern[] = ['pulse', 'scroll', 'dropout'];

describe('signAnim', () => {
    it('is deterministic per index', () => {
        expect(signAnim(5)).toEqual(signAnim(5));
    });
    it('returns phase in [0, 2π)', () => {
        for (let i = 0; i < 50; i++) {
            const { phase } = signAnim(i);
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(Math.PI * 2);
        }
    });
    it('returns positive speed', () => {
        for (let i = 0; i < 50; i++) expect(signAnim(i).speed).toBeGreaterThan(0);
    });
    it('returns a known pattern', () => {
        for (let i = 0; i < 50; i++) expect(PATTERNS).toContain(signAnim(i).pattern);
    });
    it('varies phase across indices', () => {
        const phases = new Set(Array.from({ length: 20 }, (_, i) => signAnim(i).phase));
        expect(phases.size).toBeGreaterThan(10);
    });
});
