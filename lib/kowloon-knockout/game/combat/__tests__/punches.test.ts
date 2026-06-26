import { describe, it, expect } from 'vitest';
import { PUNCH_COMMIT_FRAMES, punchHitFrame } from '../punches';
import type { PunchType } from '../../fighters/types';

const TYPES: PunchType[] = ['jab', 'cross', 'hook', 'uppercut'];

describe('PUNCH_COMMIT_FRAMES', () => {
    it('preserves the jab < cross < hook < uppercut ordering', () => {
        const c = PUNCH_COMMIT_FRAMES;
        expect(c.jab).toBeLessThan(c.cross);
        expect(c.cross).toBeLessThan(c.hook);
        expect(c.hook).toBeLessThan(c.uppercut);
    });
    it('uses windows around half a second at 60Hz (24..40 frames)', () => {
        for (const t of TYPES) {
            expect(PUNCH_COMMIT_FRAMES[t]).toBeGreaterThanOrEqual(24);
            expect(PUNCH_COMMIT_FRAMES[t]).toBeLessThanOrEqual(40);
        }
    });
});

describe('punchHitFrame', () => {
    it('lands early in the window (snappy) and before it ends', () => {
        for (const t of TYPES) {
            const hit = punchHitFrame(t);
            expect(hit).toBeGreaterThan(0);
            expect(hit).toBeLessThan(PUNCH_COMMIT_FRAMES[t]);
            expect(hit).toBeLessThanOrEqual(10);
        }
    });
});
