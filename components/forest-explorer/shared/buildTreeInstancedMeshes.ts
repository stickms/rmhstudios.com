import { CylinderGeometry, ConeGeometry, MeshLambertMaterial, InstancedMesh, Object3D, Color, InstancedBufferAttribute } from 'three';
import type { TreeData } from './types';

const TRUNK_COLORS = ['#7a5c32', '#6b4423', '#8a6440'];
const FOLIAGE_PALETTES: [string, string, string][] = [
    ['#1a4d0f', '#276614', '#338019'],
    ['#14402a', '#1e6040', '#288053'],
    ['#2b4d14', '#3d6e1e', '#4f8a28'],
];

export function buildTreeInstancedMeshes(trees: TreeData[], enableShadows = true): InstancedMesh[] {
    const count = trees.length;
    if (count === 0) return [];

    const trunkGeo = new CylinderGeometry(0.16, 0.26, 3, 7);
    const foliage1Geo = new ConeGeometry(1.9, 2.8, 7);
    const foliage2Geo = new ConeGeometry(1.35, 2.4, 7);
    const foliage3Geo = new ConeGeometry(0.75, 2.0, 7);

    const trunkMat = new MeshLambertMaterial();
    const foliage1Mat = new MeshLambertMaterial();
    const foliage2Mat = new MeshLambertMaterial();
    const foliage3Mat = new MeshLambertMaterial();

    const trunkIM = new InstancedMesh(trunkGeo, trunkMat, count);
    const foliage1IM = new InstancedMesh(foliage1Geo, foliage1Mat, count);
    const foliage2IM = new InstancedMesh(foliage2Geo, foliage2Mat, count);
    const foliage3IM = new InstancedMesh(foliage3Geo, foliage3Mat, count);

    const meshes = [trunkIM, foliage1IM, foliage2IM, foliage3IM];
    meshes.forEach(m => { m.castShadow = enableShadows; });

    const dummy = new Object3D();
    const col = new Color();

    const trunkC = new Float32Array(count * 3);
    const f1C = new Float32Array(count * 3);
    const f2C = new Float32Array(count * 3);
    const f3C = new Float32Array(count * 3);

    // Y offsets for each part (relative to tree base, multiplied by scale)
    const yOffsets = [1.5, 3.6, 5.3, 6.8];

    for (let i = 0; i < count; i++) {
        const { x, z, scale: s, variety: v } = trees[i];

        [trunkIM, foliage1IM, foliage2IM, foliage3IM].forEach((im, partIdx) => {
            dummy.position.set(x, yOffsets[partIdx] * s, z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
        });

        // Per-instance colors
        col.set(TRUNK_COLORS[v % 3]);
        trunkC.set([col.r, col.g, col.b], i * 3);

        const [dark, mid, light] = FOLIAGE_PALETTES[v % 3];
        col.set(dark);  f1C.set([col.r, col.g, col.b], i * 3);
        col.set(mid);   f2C.set([col.r, col.g, col.b], i * 3);
        col.set(light);  f3C.set([col.r, col.g, col.b], i * 3);
    }

    trunkIM.instanceColor = new InstancedBufferAttribute(trunkC, 3);
    foliage1IM.instanceColor = new InstancedBufferAttribute(f1C, 3);
    foliage2IM.instanceColor = new InstancedBufferAttribute(f2C, 3);
    foliage3IM.instanceColor = new InstancedBufferAttribute(f3C, 3);

    return meshes;
}
