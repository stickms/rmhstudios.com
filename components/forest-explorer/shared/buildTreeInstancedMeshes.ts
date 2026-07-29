import { CylinderGeometry, ConeGeometry, MeshLambertMaterial, InstancedMesh, Object3D, Color, InstancedBufferAttribute } from 'three';
import type { TreeData } from './types';

const TRUNK_COLORS = ['#7a5c32', '#6b4423', '#8a6440'];
const FOLIAGE_PALETTES: [string, string, string][] = [
    ['#1a4d0f', '#276614', '#338019'],
    ['#14402a', '#1e6040', '#288053'],
    ['#2b4d14', '#3d6e1e', '#4f8a28'],
];

/**
 * Edge length (world units) of one spatial chunk.
 *
 * An InstancedMesh is culled as a single unit, so putting all ~300 trees in one
 * buffer means every tree is transformed and rasterised every frame even when
 * the camera faces the other way. forest-explorer was measured pushing ~182k
 * triangles per frame at only 94 draw calls — nothing was ever culled
 * (docs/3d-performance-audit.md §1.2).
 *
 * Chunking trades a few more draw calls for real frustum culling. 64 units
 * suits these maps (radius 130–180): small enough that a 75° FOV discards most
 * chunks, large enough that a whole map is ~5x5 cells of 4 meshes rather than
 * hundreds of tiny batches.
 */
const CHUNK_SIZE = 64;

/** Y offset of each tree part, relative to the base, multiplied by scale. */
const Y_OFFSETS = [1.5, 3.6, 5.3, 6.8];

/**
 * Build instanced tree meshes, partitioned into spatial chunks so the frustum
 * can cull them.
 *
 * Geometry and materials are created once and shared by every chunk, so
 * chunking costs only the extra instance-matrix buffers. Returns a flat list;
 * callers add them all to a group exactly as before.
 */
export function buildTreeInstancedMeshes(trees: TreeData[], enableShadows = true): InstancedMesh[] {
    if (trees.length === 0) return [];

    const geometries = [
        new CylinderGeometry(0.16, 0.26, 3, 7),
        new ConeGeometry(1.9, 2.8, 7),
        new ConeGeometry(1.35, 2.4, 7),
        new ConeGeometry(0.75, 2.0, 7),
    ];
    const materials = [
        new MeshLambertMaterial(),
        new MeshLambertMaterial(),
        new MeshLambertMaterial(),
        new MeshLambertMaterial(),
    ];

    // Bucket trees by grid cell.
    const chunks = new Map<string, TreeData[]>();
    for (const tree of trees) {
        const key = `${Math.floor(tree.x / CHUNK_SIZE)}:${Math.floor(tree.z / CHUNK_SIZE)}`;
        const bucket = chunks.get(key);
        if (bucket) bucket.push(tree);
        else chunks.set(key, [tree]);
    }

    const dummy = new Object3D();
    const col = new Color();
    const out: InstancedMesh[] = [];

    for (const bucket of chunks.values()) {
        const count = bucket.length;
        const colors = [
            new Float32Array(count * 3),
            new Float32Array(count * 3),
            new Float32Array(count * 3),
            new Float32Array(count * 3),
        ];
        const meshes = geometries.map((geo, part) => {
            const im = new InstancedMesh(geo, materials[part], count);
            im.castShadow = enableShadows;
            return im;
        });

        for (let i = 0; i < count; i++) {
            const { x, z, scale: s, variety: v } = bucket[i];

            for (let part = 0; part < 4; part++) {
                dummy.position.set(x, Y_OFFSETS[part] * s, z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.setScalar(s);
                dummy.updateMatrix();
                meshes[part].setMatrixAt(i, dummy.matrix);
            }

            // Per-instance colors
            col.set(TRUNK_COLORS[v % 3]);
            colors[0].set([col.r, col.g, col.b], i * 3);

            const [dark, mid, light] = FOLIAGE_PALETTES[v % 3];
            col.set(dark);  colors[1].set([col.r, col.g, col.b], i * 3);
            col.set(mid);   colors[2].set([col.r, col.g, col.b], i * 3);
            col.set(light); colors[3].set([col.r, col.g, col.b], i * 3);
        }

        for (let part = 0; part < 4; part++) {
            meshes[part].instanceColor = new InstancedBufferAttribute(colors[part], 3);
            // Without this three culls against the geometry's own bounds, which
            // describe one tree at the origin — the chunk would disappear at the
            // wrong times. Computing here bakes the instance matrices in.
            meshes[part].computeBoundingSphere();
            out.push(meshes[part]);
        }
    }

    return out;
}

/**
 * Release the GPU resources held by a set of tree meshes.
 *
 * Geometries and materials are shared across chunks, so each unique one is
 * disposed once rather than per mesh.
 */
export function disposeTreeInstancedMeshes(meshes: InstancedMesh[]): void {
    const geometries = new Set(meshes.map((m) => m.geometry));
    const materials = new Set(
        meshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])),
    );
    meshes.forEach((m) => m.dispose());
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
}
