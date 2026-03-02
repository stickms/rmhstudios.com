'use client';

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { TreeData } from './types';
import { SCENE_RNG, TREE_SCALE, distToRiver, RIVER_HALF_WIDTH } from './constants';
import { buildTreeInstancedMeshes } from './buildTreeInstancedMeshes';
import { Rock } from './Rock';
import { Mushroom } from './Mushroom';

export function ForestScene() {
    const groupRef = useRef<THREE.Group>(null);

    const { treeMeshes, rocks, mushrooms } = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + 1) * 43758.5453;
            return x - Math.floor(x);
        };

        const trees: TreeData[] = [];
        const rockData: Array<{ id: number; position: [number, number, number]; scale: number }> = [];
        const mushroomData: Array<{ id: number; position: [number, number, number] }> = [];

        for (let i = 0; i < 240; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < 30 ? 7 : 15;
            const radius = minR + rng(s + 1) * 95;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (distToRiver(x, z) < RIVER_HALF_WIDTH + 1.5) continue;
            trees.push({
                x, z,
                scale: TREE_SCALE(s),
                variety: Math.floor(rng(s + 3) * 3),
            });
        }

        for (let i = 0; i < 45; i++) {
            const s = i * 13.71 + 1000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 4 + rng(s + 1) * 60;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (distToRiver(x, z) < RIVER_HALF_WIDTH + 1.0) continue;
            rockData.push({ id: i, position: [x, 0.18, z], scale: 0.5 + rng(s + 2) * 1.6 });
        }

        for (let i = 0; i < 35; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 3 + rng(s + 1) * 45;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (distToRiver(x, z) < RIVER_HALF_WIDTH + 0.5) continue;
            mushroomData.push({ id: i, position: [x, 0, z] });
        }

        return { treeMeshes: buildTreeInstancedMeshes(trees), rocks: rockData, mushrooms: mushroomData };
    }, []);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        treeMeshes.forEach(m => group.add(m));
        return () => { treeMeshes.forEach(m => group.remove(m)); };
    }, [treeMeshes]);

    return (
        <group ref={groupRef}>
            {rocks.map((r) => (
                <Rock key={r.id} position={r.position} scale={r.scale} />
            ))}
            {mushrooms.map((m) => (
                <Mushroom key={m.id} position={m.position} />
            ))}
        </group>
    );
}
