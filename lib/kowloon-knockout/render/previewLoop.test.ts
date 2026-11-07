import { describe, expect, it } from 'vitest';
import { PREVIEW_PERIOD, SEGMENTS, previewAt } from './previewLoop';

describe('preview routine', () => {
    it('is deterministic and loops', () => {
        expect(previewAt(3.7)).toEqual(previewAt(3.7));
        expect(previewAt(1.1).state).toBe(previewAt(1.1 + PREVIEW_PERIOD).state);
        expect(previewAt(-0.2).state).toBe(previewAt(PREVIEW_PERIOD - 0.2).state);
    });
    it('opens with the bounce, then shows every punch and a guard, and returns to the bounce', () => {
        expect(previewAt(0.5).state).toBe('idle');
        const seen = new Set<string>();
        for (let t = 0; t < PREVIEW_PERIOD; t += 0.05) {
            const f = previewAt(t);
            if (f.state === 'punching') seen.add(f.punch!);
            if (f.state === 'blocking') seen.add('block');
        }
        expect([...seen].sort()).toEqual(['block', 'cross', 'hook', 'jab', 'uppercut']);
        expect(SEGMENTS.at(-1)!.state).toBe('idle');
    });
    it('keeps the bounce on screen most of the time (it is the idle people asked for)', () => {
        const idle = SEGMENTS.filter((s) => s.state === 'idle').reduce((a, s) => a + s.length, 0);
        expect(idle / PREVIEW_PERIOD).toBeGreaterThan(0.55);
    });
    it('punch progress runs 0..1 and is 0 otherwise; yaw stays a three-quarter view', () => {
        for (let t = 0; t < PREVIEW_PERIOD * 2; t += 0.03) {
            const f = previewAt(t);
            if (f.state === 'punching') {
                expect(f.actionProgress).toBeGreaterThanOrEqual(0);
                expect(f.actionProgress).toBeLessThan(1);
                expect(f.punch).not.toBeNull();
            } else {
                expect(f.actionProgress).toBe(0);
                expect(f.punch).toBeNull();
            }
            expect(f.yaw).toBeGreaterThan(-1.1);
            expect(f.yaw).toBeLessThan(0.1);
        }
    });
});
