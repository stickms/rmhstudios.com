import { describe, it, expect } from 'vitest';
import { createFighter, startPunch, updateFighter, isHitFrame, applyHit } from '../fighter';
import { PUNCH_COMMIT_FRAMES, punchHitFrame } from '../../combat/punches';

function fresh() {
    const f = createFighter({ seat: 0, className: 'stone_tiger', team: 0, isAI: false, isLocal: true, x: 0, z: 5, displayName: 'P1' });
    f.stamina = 100; // ample for back-to-back punches in the test
    return f;
}

describe('committed punch timing', () => {
    it('stays in punching for the full commit window then returns to idle', () => {
        const f = fresh();
        expect(startPunch(f, 'jab')).toBe(true);
        for (let i = 1; i < PUNCH_COMMIT_FRAMES.jab; i++) {
            updateFighter(f);
            expect(f.state).toBe('punching');
        }
        updateFighter(f); // frame === commit
        expect(f.state).toBe('idle');
    });
    it('fires isHitFrame once, early, at punchHitFrame', () => {
        const f = fresh();
        startPunch(f, 'jab');
        const hits: number[] = [];
        for (let frame = 1; frame <= PUNCH_COMMIT_FRAMES.jab; frame++) {
            updateFighter(f);
            if (f.state === 'punching' && isHitFrame(f)) hits.push(f.punchFrame);
        }
        expect(hits).toEqual([punchHitFrame('jab')]);
    });
    it('clears bufferedPunch when interrupted by applyHit (no phantom punch)', () => {
        const victim = fresh();
        const attacker = createFighter({ seat: 1, className: 'stone_tiger', team: 1, isAI: true, isLocal: false, x: 0, z: -5, displayName: 'AI' });
        attacker.stamina = 100;
        // victim starts a jab and buffers a cross mid-swing
        startPunch(victim, 'jab');
        for (let i = 0; i < 3; i++) updateFighter(victim);
        victim.bufferedPunch = 'cross';
        // attacker lands a hit on the victim
        startPunch(attacker, 'jab');
        applyHit(victim, attacker);
        // buffered punch must be cleared — no phantom action after recovery
        expect(victim.bufferedPunch).toBeNull();
        expect(victim.state).toBe('hit');
    });

    it('starts a buffered punch on the frame it returns to idle', () => {
        const f = fresh();
        startPunch(f, 'jab');
        // advance partway, then buffer a cross (as world.ts would when busy)
        for (let i = 0; i < 5; i++) updateFighter(f);
        f.bufferedPunch = 'cross';
        // advance to the end of the jab window
        while (f.currentPunch?.type === 'jab') updateFighter(f);
        expect(f.state).toBe('punching');
        expect(f.currentPunch?.type).toBe('cross');
        expect(f.bufferedPunch).toBeNull();
    });
});
