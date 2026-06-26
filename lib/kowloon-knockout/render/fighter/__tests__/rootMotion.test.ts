import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stripRootMotionXZ } from '../rootMotion';

describe('stripRootMotionXZ', () => {
    it('zeroes X and Z of the hips position track but keeps Y', () => {
        const hips = new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [1, 2, 3, 4, 5, 6]);
        const clip = new THREE.AnimationClip('walk', 1, [hips]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([0, 2, 0, 0, 5, 0]);
    });
    it('handles the colon bone-name variant', () => {
        const hips = new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0], [9, 8, 7]);
        const clip = new THREE.AnimationClip('walk', 1, [hips]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([0, 8, 0]);
    });
    it('leaves non-hips and non-position tracks untouched', () => {
        const spine = new THREE.VectorKeyframeTrack('mixamorigSpine.position', [0], [1, 2, 3]);
        const quat = new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0], [0, 0, 0, 1]);
        const clip = new THREE.AnimationClip('x', 1, [spine, quat]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([1, 2, 3]);
        expect(Array.from(clip.tracks[1].values)).toEqual([0, 0, 0, 1]);
    });
});
