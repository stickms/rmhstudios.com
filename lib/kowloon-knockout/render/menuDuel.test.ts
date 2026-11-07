import { describe, expect, it } from 'vitest';
import { BEATS, DUEL_KO_POWER, DUEL_PERIOD, DUEL_POWER, HOME_X, cameraDistance, duelAt, duelImpacts, hitTimes } from './menuDuel';

describe('menu duel', () => {
    it('is deterministic and loops (the footwork closes exactly: nothing pops at the loop point)', () => {
        expect(duelAt(3.3)).toEqual(duelAt(3.3));
        for (const t of [0.3, 1.2, 4.7, 9.9]) {
            for (const k of [1, 2, -1]) {
                const a = duelAt(t);
                const b = duelAt(t + k * DUEL_PERIOD);
                for (const i of [0, 1]) {
                    expect(b[i].x).toBeCloseTo(a[i].x, 6);
                    expect(b[i].z).toBeCloseTo(a[i].z, 6);
                    expect(b[i].state).toBe(a[i].state);
                    expect(b[i].actionProgress).toBeCloseTo(a[i].actionProgress, 6);
                }
            }
        }
        expect(duelAt(-0.5)[0].x).toBeCloseTo(duelAt(DUEL_PERIOD - 0.5)[0].x, 6);
    });
    it('keeps both fighters on a tight stage, never crossing, and turned to face each other', () => {
        for (let t = 0; t < DUEL_PERIOD; t += 0.05) {
            const [l, r] = duelAt(t);
            for (const f of [l, r]) {
                expect(Math.abs(f.x)).toBeLessThan(HOME_X + 0.7 + 0.35);
                expect(Math.abs(f.z)).toBeLessThanOrEqual(0.37);
            }
            expect(l.x).toBeLessThan(r.x); // never cross
            // facing: the left fighter looks toward +X (yaw near 0), the right toward -X (near PI), within the circling
            expect(Math.abs(l.yaw)).toBeLessThan(0.7);
            expect(Math.abs(Math.abs(r.yaw) - Math.PI)).toBeLessThan(0.7);
        }
    });
    it('nobody stands planted: both fighters keep moving, circling in depth and working in and out', () => {
        const xs: number[][] = [[], []];
        const zs: number[][] = [[], []];
        for (let t = 0; t < DUEL_PERIOD; t += 0.1) {
            const fr = duelAt(t);
            for (const i of [0, 1]) { xs[i].push(fr[i].x); zs[i].push(fr[i].z); }
        }
        for (const i of [0, 1]) {
            expect(Math.max(...zs[i]) - Math.min(...zs[i])).toBeGreaterThan(0.4);   // orbit in depth
            expect(Math.max(...xs[i]) - Math.min(...xs[i])).toBeGreaterThan(0.45);  // in and out
        }
        // and the two orbit in opposite senses
        let opposed = 0;
        for (let k = 0; k < zs[0].length; k++) if (Math.sign(zs[0][k]) !== Math.sign(zs[1][k])) opposed++;
        expect(opposed / zs[0].length).toBeGreaterThan(0.6);
    });
    it('shows a shuffle when the beat has a fighter standing but the footwork has them moving', () => {
        let walking = 0, idle = 0;
        for (let t = 0; t < DUEL_PERIOD; t += 0.05) {
            for (const f of duelAt(t)) { if (f.state === 'walking') walking++; if (f.state === 'idle') idle++; }
        }
        expect(walking).toBeGreaterThan(idle * 0.5); // mostly in motion, with only brief still moments
    });
    it('punches progress 0..1 and name a punch', () => {
        let seen = 0;
        for (let t = 0; t < DUEL_PERIOD; t += 0.02) {
            for (const f of duelAt(t)) {
                if (f.state === 'punching') {
                    seen++;
                    expect(f.punch).not.toBeNull();
                    expect(f.actionProgress).toBeGreaterThanOrEqual(0);
                    expect(f.actionProgress).toBeLessThanOrEqual(1);
                } else expect(f.punch).toBeNull();
            }
        }
        expect(seen).toBeGreaterThan(0);
    });
    it('the knockdown lies down (not alive) and the next loop starts standing', () => {
        const ko = hitTimes().at(-1)! + 0.8;
        const down = duelAt(ko).find((f) => f.state === 'knockedOut')!;
        expect(down.alive).toBe(false);
        for (const f of duelAt(0)) { expect(f.alive).toBe(true); expect(f.state).not.toBe('knockedOut'); }
    });
    it('flashes at most 3 times a second', () => {
        const hits = hitTimes();
        for (let i = 1; i < hits.length; i++) expect(hits[i] - hits[i - 1]).toBeGreaterThan(1 / 3);
        expect(hits.length).toBeLessThanOrEqual(Math.ceil(DUEL_PERIOD)); // well under 1/s overall
        expect(BEATS.every((b) => b.length >= 1.4)).toBe(true);
    });
    it('backs the camera off on narrow screens so both fighters fit', () => {
        const wide = cameraDistance(16 / 9, 34);
        const phone = cameraDistance(9 / 16, 34);
        expect(phone).toBeGreaterThan(wide);
        // at the chosen distance the visible half-width covers the duel on a phone
        const visibleHalf = Math.tan((34 * Math.PI) / 360) * phone * (9 / 16);
        expect(visibleHalf).toBeGreaterThanOrEqual(2.3 - 1e-9);
        expect(cameraDistance(0, 34)).toBeGreaterThan(0); // degenerate aspect is clamped, not NaN
    });
});

describe('duelImpacts', () => {
    const all = duelImpacts(0, DUEL_PERIOD);
    it('lists every beat once per loop: blocks, hits and the knockout', () => {
        expect(all).toHaveLength(BEATS.length);
        expect(all.map((i) => i.kind)).toEqual(['block', 'hit', 'block', 'hit', 'hit', 'block', 'ko']);
    });
    it('power follows the punch, the knockout is the biggest', () => {
        expect(all[1].power).toBe(DUEL_POWER.cross);
        expect(all[3].power).toBe(DUEL_POWER.hook);
        expect(all[4].power).toBe(DUEL_POWER.uppercut);
        expect(all.at(-1)!.power).toBe(DUEL_KO_POWER);
        expect(Math.max(...all.map((i) => i.power))).toBe(DUEL_KO_POWER);
    });
    it('names attacker and victim, and pushes away from the attacker', () => {
        for (const i of all) {
            expect(i.victim).not.toBe(i.attacker);
            // pushed away from the attacker: along +X for the left fighter's blows, -X for the right's (circling tilts it a little)
            expect(Math.sign(i.dirX)).toBe(i.attacker === 0 ? 1 : -1);
            expect(Math.hypot(i.dirX, i.dirZ)).toBeCloseTo(1, 6);
            expect(Math.abs(i.dirZ)).toBeLessThan(0.6);
        }
    });
    it('places the contact on the victim, in front of the camera at chest height', () => {
        for (const i of all) {
            expect(Math.abs(i.x)).toBeLessThan(1.4);
            expect(i.y).toBeGreaterThan(0.9);
            expect(i.y).toBeLessThan(1.4);
        }
    });
    it('reports an impact in exactly the window that contains it, once', () => {
        const at = hitTimes()[1]; // the cross, a real hit
        expect(duelImpacts(at - 0.01, at + 0.01)).toHaveLength(1);
        expect(duelImpacts(at - 0.2, at - 0.01)).toHaveLength(0);
        expect(duelImpacts(at, at + 0.2)).toHaveLength(0); // the window is (prev, t]
        // stepping in small frames finds it exactly once
        let n = 0;
        for (let t = at - 0.3; t < at + 0.3; t += 1 / 30) n += duelImpacts(t, t + 1 / 30).length;
        expect(n).toBe(1);
    });
    it('handles the loop wrapping, and any number of loops', () => {
        const span = duelImpacts(DUEL_PERIOD - 0.1, DUEL_PERIOD + 1);
        expect(span).toHaveLength(1); // the first beat's block, early in the next loop
        expect(span[0].kind).toBe('block');
        expect(duelImpacts(0, DUEL_PERIOD * 3)).toHaveLength(BEATS.length * 3);
        expect(duelImpacts(DUEL_PERIOD * 5, DUEL_PERIOD * 5 + 3)).toHaveLength(duelImpacts(0, 3).length);
    });
    it('returns nothing for an empty, reversed or NaN window', () => {
        expect(duelImpacts(2, 2)).toEqual([]);
        expect(duelImpacts(3, 1)).toEqual([]);
        expect(duelImpacts(NaN, 4)).toEqual([]);
    });
    it('impacts never arrive closer than a third of a second (WCAG flash rate)', () => {
        const times: number[] = [];
        let start = 0;
        for (const b of BEATS) { times.push(start + 0.625); start += b.length; }
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(1 / 3);
        expect(times[0] + DUEL_PERIOD - times.at(-1)!).toBeGreaterThan(1 / 3);
    });
});
