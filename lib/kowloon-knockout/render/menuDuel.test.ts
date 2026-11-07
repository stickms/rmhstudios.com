import { describe, expect, it } from 'vitest';
import { BEATS, DUEL_PERIOD, HOME_X, cameraDistance, duelAt, hitTimes } from './menuDuel';

describe('menu duel', () => {
    it('is deterministic and loops', () => {
        expect(duelAt(3.3)).toEqual(duelAt(3.3));
        expect(duelAt(1.2)).toEqual(duelAt(1.2 + DUEL_PERIOD));
        expect(duelAt(-0.5)).toEqual(duelAt(DUEL_PERIOD - 0.5));
    });
    it('keeps both fighters in a tight stage and facing each other', () => {
        for (let t = 0; t < DUEL_PERIOD; t += 0.05) {
            const [l, r] = duelAt(t);
            for (const f of [l, r]) expect(Math.abs(f.x)).toBeLessThan(HOME_X + 0.7);
            expect(l.yaw).toBe(0);
            expect(r.yaw).toBe(Math.PI);
            expect(l.x).toBeLessThan(r.x); // never cross
        }
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
