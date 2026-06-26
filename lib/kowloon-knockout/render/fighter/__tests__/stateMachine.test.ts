import { describe, it, expect } from 'vitest';
import { resolveClip } from '../stateMachine';

const rf = (state: string, punch: 'jab' | 'cross' | 'hook' | 'uppercut' | null = null) =>
    ({ state, punch }) as Parameters<typeof resolveClip>[0];

describe('resolveClip', () => {
    it('maps the looping locomotion/hold states', () => {
        expect(resolveClip(rf('idle'))).toEqual({ clip: 'idle', loop: true });
        expect(resolveClip(rf('walking'))).toEqual({ clip: 'walk', loop: true });
        expect(resolveClip(rf('blocking'))).toEqual({ clip: 'block', loop: true });
        expect(resolveClip(rf('stunned'))).toEqual({ clip: 'stunned', loop: true });
    });
    it('maps the one-shot reactions', () => {
        expect(resolveClip(rf('hit'))).toEqual({ clip: 'hit', loop: false });
        expect(resolveClip(rf('knockedOut'))).toEqual({ clip: 'ko', loop: false });
    });
    it('maps each punch to its own clip', () => {
        expect(resolveClip(rf('punching', 'jab')).clip).toBe('jab');
        expect(resolveClip(rf('punching', 'cross')).clip).toBe('cross');
        expect(resolveClip(rf('punching', 'hook')).clip).toBe('hook');
        expect(resolveClip(rf('punching', 'uppercut')).clip).toBe('uppercut');
        expect(resolveClip(rf('punching', 'jab')).loop).toBe(false);
    });
    it('defaults a punch with no subtype to jab', () => {
        expect(resolveClip(rf('punching', null)).clip).toBe('jab');
    });
    it('falls back to idle for an unknown state', () => {
        expect(resolveClip(rf('teleporting'))).toEqual({ clip: 'idle', loop: true });
    });
});
