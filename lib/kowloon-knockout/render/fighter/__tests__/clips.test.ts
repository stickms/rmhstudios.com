import { describe, it, expect } from 'vitest';
import { CLIP_KEYS, CLIPS, type ClipKey } from '../clips';

describe('CLIPS manifest', () => {
    it('has a definition for every clip key', () => {
        for (const k of CLIP_KEYS) expect(CLIPS[k]).toBeDefined();
        expect(CLIP_KEYS).toHaveLength(11);
    });
    it('gives every clip a unique .fbx file', () => {
        const files = CLIP_KEYS.map((k) => CLIPS[k].file);
        expect(new Set(files).size).toBe(files.length);
        for (const f of files) expect(f.endsWith('.fbx')).toBe(true);
    });
    it('loops locomotion/hold/emote clips and one-shots the strikes/reactions', () => {
        const loops: ClipKey[] = ['idle', 'walk', 'block', 'stunned', 'dance'];
        const oneShots: ClipKey[] = ['jab', 'cross', 'hook', 'uppercut', 'hit', 'ko'];
        for (const k of loops) expect(CLIPS[k].loop).toBe(true);
        for (const k of oneShots) expect(CLIPS[k].loop).toBe(false);
    });
});
