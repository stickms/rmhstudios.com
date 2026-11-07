import { describe, expect, it } from 'vitest';
import {
    HP_LOW, classifyRoundEnd, clampOrigin, hpFraction, hpTone, hudColumns, isLowHealth, litSegments,
    secondsLeft, stickVector,
} from './hudModel';

describe('health', () => {
    it('clamps the fraction and survives a zero max', () => {
        expect(hpFraction(50, 100)).toBe(0.5);
        expect(hpFraction(-5, 100)).toBe(0);
        expect(hpFraction(150, 100)).toBe(1);
        expect(hpFraction(10, 0)).toBe(0);
    });
    it('tones at the thresholds', () => {
        expect(hpTone(1)).toBe('ok');
        expect(hpTone(0.5)).toBe('warn');
        expect(hpTone(0.26)).toBe('warn');
        expect(hpTone(HP_LOW)).toBe('low');
        expect(hpTone(0)).toBe('low');
    });
    it('the low alarm is off for a downed fighter', () => {
        expect(isLowHealth(0.1, true)).toBe(true);
        expect(isLowHealth(0.1, false)).toBe(false);
        expect(isLowHealth(0.9, true)).toBe(false);
    });
    it('keeps one segment lit for any remaining health', () => {
        expect(litSegments(0)).toBe(0);
        expect(litSegments(0.001)).toBe(1);
        expect(litSegments(0.5)).toBe(5);
        expect(litSegments(1)).toBe(10);
        expect(litSegments(2)).toBe(10);
    });
});

describe('hudColumns', () => {
    const f = (seat: number, isLocal = false) => ({ seat, isLocal });
    it('puts the local fighter first on the left and deals the rest alternately', () => {
        const { left, right } = hudColumns([f(0), f(1), f(2, true), f(3)]);
        expect(left.map((x) => x.seat)).toEqual([2, 1]);
        expect(right.map((x) => x.seat)).toEqual([0, 3]);
    });
    it('handles two fighters and caps at four', () => {
        expect(hudColumns([f(0, true), f(1)])).toEqual({ left: [f(0, true)], right: [f(1)] });
        const five = hudColumns([f(0), f(1), f(2), f(3), f(4)]);
        expect(five.left.length + five.right.length).toBe(4);
    });
});

describe('round end + timer', () => {
    it('classifies the sim text', () => {
        expect(classifyRoundEnd('K.O.').kind).toBe('ko');
        expect(classifyRoundEnd('DRAW').kind).toBe('draw');
        expect(classifyRoundEnd('DECISION').kind).toBe('decision');
        expect(classifyRoundEnd('JADE DRAGON WINS')).toEqual({ kind: 'wins', name: 'JADE DRAGON' });
        expect(classifyRoundEnd('').kind).toBe('other');
    });
    it('rounds the frame counter up to whole seconds', () => {
        expect(secondsLeft(3600)).toBe(60);
        expect(secondsLeft(601)).toBe(11);
        expect(secondsLeft(1)).toBe(1);
        expect(secondsLeft(-3)).toBe(0);
    });
});

describe('stickVector', () => {
    it('stands still inside the dead zone and at the origin', () => {
        expect(stickVector(0, 0, 60)).toEqual({ moveX: 0, moveZ: 0, knobX: 0, knobY: 0 });
        const r = stickVector(4, 0, 60);
        expect(r.moveX).toBe(0);
        expect(r.knobX).toBe(4);
    });
    it('reaches full speed at the radius and never beyond', () => {
        const r = stickVector(300, 0, 60);
        expect(r.moveX).toBeCloseTo(1);
        expect(r.knobX).toBe(60);
        const d = stickVector(300, 300, 60);
        expect(Math.hypot(d.moveX, d.moveZ)).toBeCloseTo(1);
        expect(Math.hypot(d.knobX, d.knobY)).toBeCloseTo(60);
    });
    it('keeps the input axes: x right, z down (screen y)', () => {
        const down = stickVector(0, 40, 60);
        expect(down.moveZ).toBeGreaterThan(0);
        const left = stickVector(-40, 0, 60);
        expect(left.moveX).toBeLessThan(0);
    });
    it('ignores a zero radius', () => {
        expect(stickVector(10, 10, 0).moveX).toBe(0);
    });
});

describe('clampOrigin', () => {
    it('keeps the ring inside the zone', () => {
        expect(clampOrigin(5, 200, 60)).toBe(60);
        expect(clampOrigin(500, 200, 60)).toBe(140);
        expect(clampOrigin(100, 200, 60)).toBe(100);
        expect(clampOrigin(10, 100, 60)).toBe(60); // zone smaller than the ring
    });
});
