import { describe, it, expect } from 'vitest';
import { hiScoreKey } from '../highscore';

describe('hiScoreKey', () => {
    it('keys a personal best by both character and difficulty', () => {
        expect(hiScoreKey('lmy', 'normal')).toBe('dr.hi.lmy.normal');
        expect(hiScoreKey('bllm', 'hard')).toBe('dr.hi.bllm.hard');
    });

    it('gives different characters separate slots on the same difficulty', () => {
        // The bug: a high score on Hikari (lmy) and one on Reika (bllm) used to
        // collide in a single `dr.hi.<difficulty>` slot, so the last run won.
        expect(hiScoreKey('lmy', 'hard')).not.toBe(hiScoreKey('bllm', 'hard'));
    });

    it('gives the same character separate slots per difficulty', () => {
        expect(hiScoreKey('bllm', 'normal')).not.toBe(hiScoreKey('bllm', 'hard'));
    });
});
