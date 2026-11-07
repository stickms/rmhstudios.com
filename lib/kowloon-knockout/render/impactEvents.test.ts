import { describe, expect, it } from 'vitest';
import { BLOCK_POWER, KO_POWER, nearestOther, toImpactEvent, unitDir, type FighterPos } from './impactEvents';

const F: FighterPos[] = [
    { seat: 0, x: -1, z: 0, alive: true },
    { seat: 1, x: 1, z: 0, alive: true },
    { seat: 2, x: 6, z: 6, alive: true },
    { seat: 3, x: 0.5, z: 0.2, alive: false },
];

describe('toImpactEvent', () => {
    it('a hit: attacker is the event seat, victim the target, direction attacker → victim', () => {
        const e = toImpactEvent({ kind: 'hit', seat: 0, targetSeat: 1, x: 1, y: 1.1, z: 0, color: '#f0f', power: 12 }, F)!;
        expect(e).toMatchObject({ kind: 'hit', victim: 1, attacker: 0, power: 12, dirX: 1, dirZ: 0, color: '#f0f' });
        expect(e.x).toBe(1);
    });
    it('a block names only the defender: the attacker is the nearest LIVING other fighter', () => {
        const e = toImpactEvent({ kind: 'block', seat: 1, x: 1, y: 1.1, z: 0 }, F)!;
        expect(e).toMatchObject({ kind: 'block', victim: 1, attacker: 0, power: BLOCK_POWER });
        expect(e.dirX).toBeCloseTo(1); // pushed away from fighter 0, not toward the corpse of seat 3
    });
    it('a knockout: kind ko, the biggest power, a direction away from the nearest living fighter', () => {
        const e = toImpactEvent({ kind: 'ko', seat: 0, x: -1, z: 0 }, F)!;
        expect(e).toMatchObject({ kind: 'ko', victim: 0, power: KO_POWER, y: 1.1 });
        expect(e.attacker).toBe(1);
        expect(e.dirX).toBeCloseTo(-1);
    });
    it('combo text is not an impact', () => {
        expect(toImpactEvent({ kind: 'combo', seat: 0, text: 'x' }, F)).toBeNull();
    });
    it('survives unknown seats and a lone fighter (falls back to a forward push, never NaN)', () => {
        const lone: FighterPos[] = [{ seat: 0, x: 0, z: 0, alive: true }];
        const e = toImpactEvent({ kind: 'block', seat: 0, x: 0, y: 1, z: 0 }, lone)!;
        expect(e.attacker).toBeNull();
        expect(Number.isFinite(e.dirX) && Number.isFinite(e.dirZ)).toBe(true);
        const h = toImpactEvent({ kind: 'hit', seat: 9, targetSeat: 8, x: 2, y: 1, z: 2, color: '#fff', power: 5 }, lone)!;
        expect(h).toMatchObject({ victim: 8, attacker: 9, dirX: 0, dirZ: 1 });
    });
});

describe('helpers', () => {
    it('unitDir is unit length, or forward for coincident points', () => {
        const d = unitDir(0, 0, 3, 4);
        expect(Math.hypot(d.dirX, d.dirZ)).toBeCloseTo(1);
        expect(unitDir(1, 1, 1, 1)).toEqual({ dirX: 0, dirZ: 1 });
    });
    it('nearestOther skips the seat itself and the dead; null when nobody else', () => {
        expect(nearestOther(F, 0, -1, 0)?.seat).toBe(1);
        expect(nearestOther([{ seat: 0, x: 0, z: 0, alive: true }], 0, 0, 0)).toBeNull();
    });
});
