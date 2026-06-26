import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { autoScaleToHeight, findBone } from '../fighterRig';

describe('autoScaleToHeight', () => {
    it('scales an object so its bbox height matches the target', () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)); // 2 units tall
        const s = autoScaleToHeight(mesh, 1.8);
        expect(s).toBeCloseTo(0.9, 5);
        const h = new THREE.Box3().setFromObject(mesh);
        expect(h.max.y - h.min.y).toBeCloseTo(1.8, 4);
    });
    it('returns 1 and does nothing for a zero-height object', () => {
        const empty = new THREE.Group();
        expect(autoScaleToHeight(empty, 1.8)).toBe(1);
    });
});

describe('findBone', () => {
    it('finds a descendant by any candidate name', () => {
        const root = new THREE.Object3D();
        const head = new THREE.Bone(); head.name = 'mixamorigHead';
        root.add(head);
        expect(findBone(root, ['mixamorig:Head', 'mixamorigHead'])).toBe(head);
    });
    it('returns undefined when no candidate matches', () => {
        expect(findBone(new THREE.Object3D(), ['nope'])).toBeUndefined();
    });
});
