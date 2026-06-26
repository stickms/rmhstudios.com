import * as THREE from 'three';

/** Uniformly scale `obj` so its world-space bounding-box height becomes
 *  `targetHeight`. Robust to whatever units the Mixamo FBX→GLB conversion
 *  produced. Returns the scale applied (1 if the box has no height). */
export function autoScaleToHeight(obj: THREE.Object3D, targetHeight: number): number {
    const box = new THREE.Box3().setFromObject(obj);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height <= 0) return 1;
    const s = targetHeight / height;
    obj.scale.multiplyScalar(s);
    return s;
}

/** First descendant of `root` whose name equals any of `names` (handles the
 *  `mixamorigHips` vs `mixamorig:Hips` conversion variants). */
export function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | undefined {
    for (const n of names) {
        const found = root.getObjectByName(n);
        if (found) return found;
    }
    return undefined;
}
