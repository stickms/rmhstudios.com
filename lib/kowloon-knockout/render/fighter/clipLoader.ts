import type { AnimationClip } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stripRootMotionXZ } from './rootMotion';
import { CLIPS, FIGHTER_ASSET_DIR, type ClipKey } from './clips';

/**
 * Module-level cache of loaded fighter animation clips.
 *
 * Both seats share one clip per key, and `stripRootMotionXZ` mutates the clip
 * in place — so stripping has to happen exactly once, at load, rather than per
 * consumer. Caching the promise also means two fighters mounting together
 * trigger one fetch, not two.
 */
const cache = new Map<ClipKey, Promise<AnimationClip | null>>();

let loader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
    loader ??= new GLTFLoader();
    return loader;
}

/** Load one animation clip, root motion already stripped. Resolves null if absent. */
export function loadFighterClip(key: ClipKey): Promise<AnimationClip | null> {
    const hit = cache.get(key);
    if (hit) return hit;

    const promise = getLoader()
        .loadAsync(`${FIGHTER_ASSET_DIR}/${CLIPS[key].file}`)
        .then((gltf) => {
            const clip = gltf.animations[0] ?? null;
            if (clip) stripRootMotionXZ(clip);
            return clip;
        })
        .catch(() => null); // a missing clip degrades to "this move doesn't animate"

    cache.set(key, promise);
    return promise;
}
