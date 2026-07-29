'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Batches static descendant meshes into one draw call per (material × shadow
 * flags) combination.
 *
 * Models in this repo are authored as readable piles of small primitives — a
 * house is nine boxes, a workbench is ten boxes and cylinders — each with its
 * own geometry and its own material. That reads well but costs one draw call
 * per primitive: cookgame was measured at 432 draw calls for 10,120 triangles,
 * about 23 triangles per call (see `docs/3d-performance-audit.md` §2).
 *
 * Rather than rewrite every model as merge-ready data (error-prone, and it
 * would lose the readable JSX), this walks the mounted subtree, bakes each
 * child's local matrix into a clone of its geometry, and merges the clones by
 * material. Originals are hidden rather than detached, so React and R3F keep
 * owning the tree and unmount/reconciliation still work normally.
 *
 * Constraints:
 * - Only meshes with a single material and a matching attribute layout merge;
 *   anything else is left alone and keeps rendering as-is.
 * - Anything animated per-frame must opt out with `userData={{ noMerge: true }}`
 *   — a merged child no longer has its own transform.
 * - Pass `deps` when the children can change shape (e.g. a crop growth stage)
 *   so the batch rebuilds.
 */
export default function StaticMerge({
    children,
    deps = [],
    disabled = false,
}: {
    children: ReactNode;
    /** Rebuild the batch when these change. */
    deps?: unknown[];
    /** Escape hatch — render children untouched. */
    disabled?: boolean;
}) {
    const groupRef = useRef<THREE.Group>(null);

    useLayoutEffect(() => {
        const group = groupRef.current;
        if (!group || disabled) return;

        group.updateMatrixWorld(true);
        const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();

        // Group by material identity + shadow flags. Shadow flags are part of
        // the key so merging never silently makes a non-caster cast.
        const buckets = new Map<string, { meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
        const merged: THREE.Mesh[] = [];
        const hidden: THREE.Mesh[] = [];

        group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
            // `noMerge` opts out a whole subtree, not just the mesh it sits on,
            // so callers can exclude an animated model with one prop.
            for (let p: THREE.Object3D | null = mesh; p && p !== group; p = p.parent) {
                if (p.userData?.noMerge) return;
            }
            // Multi-material meshes can't collapse to a single draw. Note that
            // a *single*-material mesh may still carry groups — BoxGeometry
            // defines six, one per face — which is fine, because merging with
            // useGroups=false discards them.
            if (Array.isArray(mesh.material)) return;
            if (!mesh.geometry?.attributes?.position) return;

            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (!mat) return;

            const key = [
                mat.type,
                (mat as THREE.MeshStandardMaterial).color?.getHexString?.() ?? '',
                (mat as THREE.MeshStandardMaterial).roughness ?? '',
                (mat as THREE.MeshStandardMaterial).metalness ?? '',
                (mat as THREE.MeshStandardMaterial).emissive?.getHexString?.() ?? '',
                mat.transparent ? `t${mat.opacity}` : 'o',
                mat.side,
                mat.map?.uuid ?? '',
                mesh.castShadow ? 'C' : '-',
                mesh.receiveShadow ? 'R' : '-',
            ].join('|');

            // Bake the mesh's transform (relative to this group) into a clone.
            const geo = mesh.geometry.clone();
            mesh.updateMatrixWorld(true);
            geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));

            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { meshes: [], geometries: [] };
                buckets.set(key, bucket);
            }
            bucket.geometries.push(geo);
            bucket.meshes.push(mesh);
        });

        for (const { meshes, geometries } of buckets.values()) {
            // A lone mesh gains nothing from merging — leave the original as-is.
            if (geometries.length < 2) {
                geometries.forEach((g) => g.dispose());
                continue;
            }
            let batched: THREE.BufferGeometry | null = null;
            try {
                batched = mergeGeometries(geometries, false);
            } catch {
                batched = null;
            }
            geometries.forEach((g) => g.dispose());
            // Incompatible attribute layouts — leave this bucket rendering as it was.
            if (!batched) continue;

            const source = meshes[0];
            const mesh = new THREE.Mesh(batched, source.material as THREE.Material);
            mesh.castShadow = source.castShadow;
            mesh.receiveShadow = source.receiveShadow;
            mesh.userData.noMerge = true;
            merged.push(mesh);
            group.add(mesh);
            // Only now are these originals genuinely replaced.
            hidden.push(...meshes);
        }

        const replaced = hidden;
        replaced.forEach((m) => { m.visible = false; });

        return () => {
            replaced.forEach((m) => { m.visible = true; });
            merged.forEach((m) => {
                group.remove(m);
                m.geometry.dispose();
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled, ...deps]);

    return <group ref={groupRef}>{children}</group>;
}
