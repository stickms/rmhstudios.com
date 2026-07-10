'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { SphereGeometry, MeshLambertMaterial, InstancedMesh, Object3D } from 'three';

const CLOUD_PUFFS: [number, number, number, number][] = [
    [0,    0,   0,   2.2],
    [2.2,  0.5, 0,   1.8],
    [-2.0, 0.4, 0.3, 1.6],
    [1.0,  1.2, 0,   1.3],
    [-0.8, 1.1, 0.2, 1.1],
    [3.2, -0.2, 0.2, 1.2],
    [-3.0,-0.2,-0.2, 1.1],
    [0.3,  1.8, 0,   0.9],
];

interface CloudData {
    x: number;
    y: number;
    z: number;
    scale: number;
    speed: number;
}

/**
 * Drifting clouds as ONE instanced mesh (previously 14 clouds × 8 puffs =
 * 112 separate transparent meshes/draw calls). Per-instance matrices are
 * recomputed as clouds drift — trivial CPU, one GPU draw.
 */
export function Clouds({ night }: { night: boolean }) {
    const meshRef = useRef<InstancedMesh>(null);
    const dummy = useMemo(() => new Object3D(), []);

    const clouds = useMemo<CloudData[]>(() => {
        const rng = (n: number) => { const x = Math.sin(n + 1) * 43758.5453; return x - Math.floor(x); };
        return Array.from({ length: 14 }, (_, i) => ({
            x: (rng(i * 7.33) - 0.5) * 220,
            y: 42 + rng(i * 3.11) * 18,
            z: (rng(i * 11.71) - 0.5) * 220,
            scale: 0.9 + rng(i * 5.9) * 1.4,
            speed: 0.6 + rng(i * 2.3) * 0.8,
        }));
    }, []);

    // Mutable drift offsets (one per cloud)
    const offsets = useRef<number[]>(clouds.map(() => 0));

    const { geometry, material, count } = useMemo(() => ({
        geometry: new SphereGeometry(1, 7, 5),
        material: new MeshLambertMaterial({ transparent: true, opacity: 0.82 }),
        count: clouds.length * CLOUD_PUFFS.length,
    }), [clouds.length]);

    useEffect(() => () => {
        geometry.dispose();
        material.dispose();
    }, [geometry, material]);

    useEffect(() => {
        material.color.set(night ? '#1a1f2a' : '#f0f4f0');
    }, [night, material]);

    useFrame((_, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;

        let idx = 0;
        for (let c = 0; c < clouds.length; c++) {
            const cloud = clouds[c];
            offsets.current[c] += cloud.speed * delta;
            let cx = cloud.x + offsets.current[c];
            if (cx > 120) {
                offsets.current[c] -= cx + 120 - cloud.x;
                cx = -120;
            }
            for (const [px, py, pz, pr] of CLOUD_PUFFS) {
                dummy.position.set(
                    cx + px * cloud.scale,
                    cloud.y + py * cloud.scale,
                    cloud.z + pz * cloud.scale,
                );
                dummy.scale.setScalar(pr * cloud.scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(idx++, dummy.matrix);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, count]}
            frustumCulled={false}
        />
    );
}
