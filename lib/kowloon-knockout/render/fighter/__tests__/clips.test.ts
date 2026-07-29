import { describe, it, expect } from 'vitest';
import { CLIP_KEYS, CLIPS, ESSENTIAL_CLIP_KEYS, DEFERRED_CLIP_KEYS, type ClipKey } from '../clips';

describe('CLIPS manifest', () => {
    it('has a definition for every clip key', () => {
        for (const k of CLIP_KEYS) expect(CLIPS[k]).toBeDefined();
        expect(CLIP_KEYS).toHaveLength(11);
    });
    it('gives every clip a unique .glb file', () => {
        const files = CLIP_KEYS.map((k) => CLIPS[k].file);
        expect(new Set(files).size).toBe(files.length);
        for (const f of files) expect(f.endsWith('.glb')).toBe(true);
    });
    it('splits the clip set into essential and deferred with no overlap', () => {
        const overlap = ESSENTIAL_CLIP_KEYS.filter((k) => DEFERRED_CLIP_KEYS.includes(k));
        expect(overlap).toEqual([]);
        expect([...ESSENTIAL_CLIP_KEYS, ...DEFERRED_CLIP_KEYS].sort()).toEqual([...CLIP_KEYS].sort());
        // The swap off StickFighter waits on these, so keep the set minimal.
        expect(ESSENTIAL_CLIP_KEYS).toEqual(['idle', 'walk']);
    });
    it('loops locomotion/hold/emote clips and one-shots the strikes/reactions', () => {
        const loops: ClipKey[] = ['idle', 'walk', 'block', 'stunned', 'dance'];
        const oneShots: ClipKey[] = ['jab', 'cross', 'hook', 'uppercut', 'hit', 'ko'];
        for (const k of loops) expect(CLIPS[k].loop).toBe(true);
        for (const k of oneShots) expect(CLIPS[k].loop).toBe(false);
    });
});
