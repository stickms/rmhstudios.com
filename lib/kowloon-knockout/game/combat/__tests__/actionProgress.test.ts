import { describe, it, expect } from 'vitest';
import { actionProgress, HIT_FRAMES, KO_FRAMES } from '../actionProgress';
import { PUNCH_COMMIT_FRAMES } from '../punches';

const base = { state: 'idle', punch: null as 'jab' | null, punchFrame: 0, stateFrame: 0 };

describe('actionProgress', () => {
    it('is 0 for looping states (idle/walk/block/stunned)', () => {
        for (const state of ['idle', 'walking', 'blocking', 'stunned']) {
            expect(actionProgress({ ...base, state })).toBe(0);
        }
    });
    it('tracks punch progress over the commit window', () => {
        const half = Math.round(PUNCH_COMMIT_FRAMES.jab / 2);
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: 0, stateFrame: 0 })).toBe(0);
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: half, stateFrame: 0 }))
            .toBeCloseTo(half / PUNCH_COMMIT_FRAMES.jab, 5);
    });
    it('clamps punch progress to 1 past the window', () => {
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: 999, stateFrame: 0 })).toBe(1);
    });
    it('is 0 for a punching state with no punch type', () => {
        expect(actionProgress({ state: 'punching', punch: null, punchFrame: 5, stateFrame: 0 })).toBe(0);
    });
    it('tracks hit and KO progress and clamps at 1', () => {
        expect(actionProgress({ ...base, state: 'hit', stateFrame: HIT_FRAMES / 2 })).toBeCloseTo(0.5, 5);
        expect(actionProgress({ ...base, state: 'hit', stateFrame: HIT_FRAMES + 9 })).toBe(1);
        expect(actionProgress({ ...base, state: 'knockedOut', stateFrame: KO_FRAMES })).toBe(1);
    });
});
