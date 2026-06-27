import { runPattern, patternExists, type PatternCtx } from '../sim/patterns';
import { DIFFICULTY } from '../constants';
import { Rng } from '../rng';
import type { Bullet } from '../types';

function makeCtx(t: number): { ctx: PatternCtx; fired: Partial<Bullet>[] } {
    const fired: Partial<Bullet>[] = [];
    const ctx: PatternCtx = {
        t,
        x: 192,
        y: 100,
        rng: new Rng(1),
        diff: DIFFICULTY.normal,
        target: { x: 192, y: 400 },
        themeColors: ['red', 'orange', 'yellow', 'white'],
        fire: (o) => {
            const b = { ...o } as unknown as Partial<Bullet>;
            fired.push(b);
            return null;
        },
    };
    return { ctx, fired };
}

describe('patterns', () => {
    it('known pattern ids exist, unknown ones do not', () => {
        expect(patternExists('spell-spiralRose')).toBe(true);
        expect(patternExists('nonspell-petals')).toBe(true);
        expect(patternExists('does-not-exist')).toBe(false);
    });

    it('runPattern on an unknown id is a no-op', () => {
        const { ctx, fired } = makeCtx(0);
        runPattern('nope', ctx);
        expect(fired).toHaveLength(0);
    });

    it('spiral pattern fires bullets on its active frames', () => {
        // spell-spiralRose fires every 4 frames; t=0 should fire its arms
        const { ctx, fired } = makeCtx(0);
        runPattern('spell-spiralRose', ctx);
        expect(fired.length).toBeGreaterThan(0);
        for (const b of fired) {
            expect(typeof b.angle).toBe('number');
            expect(b.speed).toBeGreaterThan(0);
        }
    });

    it('aimed enemy pattern targets the player direction', () => {
        const { ctx, fired } = makeCtx(0); // aimed3 fires at t%46===0
        runPattern('aimed3', ctx);
        expect(fired.length).toBe(3);
        // center bullet should aim roughly downward (target is below)
        const angles = fired.map((b) => b.angle!);
        const mid = angles[1];
        expect(Math.abs(mid - Math.PI / 2)).toBeLessThan(0.5);
    });

    it('difficulty scales bullet count up on lunatic', () => {
        const countAt = (diff: typeof DIFFICULTY.normal) => {
            const fired: unknown[] = [];
            const ctx: PatternCtx = {
                t: 0,
                x: 192,
                y: 100,
                rng: new Rng(1),
                diff,
                target: { x: 192, y: 400 },
                themeColors: ['red'],
                fire: () => {
                    fired.push(1);
                    return null;
                },
            };
            runPattern('spell-fanBarrage', ctx);
            return fired.length;
        };
        expect(countAt(DIFFICULTY.lunatic)).toBeGreaterThan(countAt(DIFFICULTY.easy));
    });
});
