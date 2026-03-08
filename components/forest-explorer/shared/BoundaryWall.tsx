'use client';

import { useRef, useMemo, useEffect } from 'react';
import type { Group } from 'three';
import type { TreeData } from './types';
import { buildTreeInstancedMeshes } from './buildTreeInstancedMeshes';

export function BoundaryWall() {
    const groupRef = useRef<Group>(null);

    const meshes = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 99) * 43758.5453; return x - Math.floor(x); };

        const trees: TreeData[] = [];

        const rings = [
            { radius: 118, spacing: 3.5, offset: 0, baseScale: 2.0, scaleRange: 0.8, seedOffset: 0, varietyOffset: 0 },
            { radius: 122, spacing: 3.8, offset: 0, baseScale: 2.1, scaleRange: 0.9, seedOffset: 500, varietyOffset: 1 },
            { radius: 126, spacing: 2.8, offset: 0, baseScale: 2.2, scaleRange: 0.7, seedOffset: 1000, varietyOffset: 2 },
            { radius: 130, spacing: 3.2, offset: 0, baseScale: 2.0, scaleRange: 1.0, seedOffset: 1500, varietyOffset: 0 },
        ];

        // Compute offsets for rings 2-4
        rings[1].offset = Math.PI / Math.floor((2 * Math.PI * rings[1].radius) / rings[1].spacing);
        rings[2].offset = (Math.PI * 0.7) / Math.floor((2 * Math.PI * rings[2].radius) / rings[2].spacing);
        rings[3].offset = Math.PI / Math.floor((2 * Math.PI * rings[3].radius) / rings[3].spacing);

        for (const ring of rings) {
            const count = Math.floor((2 * Math.PI * ring.radius) / ring.spacing);
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + ring.offset;
                const spread = (rng(i * 3.7 + ring.seedOffset) - 0.5) * 2;
                const r = ring.radius + spread;
                trees.push({
                    x: Math.cos(angle) * r,
                    z: Math.sin(angle) * r,
                    scale: ring.baseScale + rng(i * 2.1 + ring.seedOffset) * ring.scaleRange,
                    variety: (i + ring.varietyOffset) % 3,
                });
            }
        }

        return buildTreeInstancedMeshes(trees, true);
    }, []);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        meshes.forEach(m => group.add(m));
        return () => { meshes.forEach(m => group.remove(m)); };
    }, [meshes]);

    return <group ref={groupRef} />;
}
