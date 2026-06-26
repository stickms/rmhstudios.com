import type * as THREE from 'three';

/** Zero the X/Z translation of the hips ("root") position track so the sim
 *  stays the sole owner of a fighter's ground position; vertical (Y) motion is
 *  kept so crouches and the KO topple still read. Matches the Mixamo hips bone
 *  under either `mixamorigHips` or `mixamorig:Hips` naming. Mutates in place. */
export function stripRootMotionXZ(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) continue;
        if (!track.name.includes('Hips')) continue;
        const v = track.values; // [x,y,z, x,y,z, ...]
        for (let i = 0; i < v.length; i += 3) {
            v[i] = 0;       // x
            v[i + 2] = 0;   // z
        }
    }
}
