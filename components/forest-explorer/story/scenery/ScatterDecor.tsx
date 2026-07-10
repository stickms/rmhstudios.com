'use client';

import { useMemo, useRef, useEffect } from 'react';
import {
    ConeGeometry, SphereGeometry, CylinderGeometry, MeshLambertMaterial,
    InstancedMesh, Object3D, Color, InstancedBufferAttribute, type Group,
} from 'three';

interface ScatterDecorProps {
    /** Deterministic seed (use the act's treeSeed + an offset) */
    seed: number;
    /** Scatter radius */
    radius: number;
    fernCount?: number;
    flowerCount?: number;
    /** Fern foliage tints, act-themed */
    fernPalette?: string[];
    /** Flower head tints, act-themed */
    flowerPalette?: string[];
    /** Return true to reject a position (corridors, landmarks, water...) */
    reject?: (x: number, z: number) => boolean;
    /** Emissive-ish brightness for flower heads (fake bioluminescence) */
    flowerGlow?: boolean;
}

/**
 * Instanced ground cover: fern clumps and wildflowers. Three instanced
 * draws total, so hundreds of plants cost almost nothing.
 */
export function ScatterDecor({
    seed,
    radius,
    fernCount = 180,
    flowerCount = 90,
    fernPalette = ['#1d4a22', '#2a5c2e', '#173d1e'],
    flowerPalette = ['#cc6688', '#8899ee', '#ddaa55', '#bb77dd'],
    reject,
    flowerGlow = false,
}: ScatterDecorProps) {
    const groupRef = useRef<Group>(null);

    const meshes = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + seed) * 43758.5453;
            return x - Math.floor(x);
        };

        // Collect valid positions
        const ferns: Array<{ x: number; z: number; s: number; v: number }> = [];
        for (let i = 0; i < fernCount; i++) {
            const s = i * 11.17 + 3000;
            const angle = rng(s) * Math.PI * 2;
            const r = 3 + rng(s + 1) * radius;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            if (reject?.(x, z)) continue;
            ferns.push({ x, z, s: 0.6 + rng(s + 2) * 0.9, v: Math.floor(rng(s + 3) * 3) });
        }

        const flowers: Array<{ x: number; z: number; s: number; v: number }> = [];
        for (let i = 0; i < flowerCount; i++) {
            const s = i * 17.31 + 5000;
            const angle = rng(s) * Math.PI * 2;
            const r = 2 + rng(s + 1) * radius;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            if (reject?.(x, z)) continue;
            flowers.push({ x, z, s: 0.7 + rng(s + 2) * 0.6, v: Math.floor(rng(s + 3) * flowerPalette.length) });
        }

        const dummy = new Object3D();
        const col = new Color();
        const out: InstancedMesh[] = [];

        // Fern clumps: flattened cones
        if (ferns.length > 0) {
            const geo = new ConeGeometry(0.5, 0.55, 6);
            const mat = new MeshLambertMaterial();
            const im = new InstancedMesh(geo, mat, ferns.length);
            const colors = new Float32Array(ferns.length * 3);
            ferns.forEach((f, i) => {
                dummy.position.set(f.x, 0.22 * f.s, f.z);
                dummy.scale.set(f.s, f.s * 0.8, f.s);
                dummy.rotation.set(0, f.s * 7, 0);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
                col.set(fernPalette[f.v % fernPalette.length]);
                colors.set([col.r, col.g, col.b], i * 3);
            });
            im.instanceColor = new InstancedBufferAttribute(colors, 3);
            out.push(im);
        }

        // Flower stems + heads
        if (flowers.length > 0) {
            const stemGeo = new CylinderGeometry(0.015, 0.02, 0.34, 4);
            const stemMat = new MeshLambertMaterial({ color: '#3f6a2f' });
            const stems = new InstancedMesh(stemGeo, stemMat, flowers.length);

            const headGeo = new SphereGeometry(0.07, 6, 5);
            const headMat = new MeshLambertMaterial();
            if (flowerGlow) {
                headMat.emissive = new Color('#ffffff');
                headMat.emissiveIntensity = 0.25;
            }
            const heads = new InstancedMesh(headGeo, headMat, flowers.length);
            const colors = new Float32Array(flowers.length * 3);

            flowers.forEach((f, i) => {
                dummy.position.set(f.x, 0.17 * f.s, f.z);
                dummy.scale.setScalar(f.s);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                stems.setMatrixAt(i, dummy.matrix);

                dummy.position.set(f.x, 0.37 * f.s, f.z);
                dummy.updateMatrix();
                heads.setMatrixAt(i, dummy.matrix);

                col.set(flowerPalette[f.v % flowerPalette.length]);
                colors.set([col.r, col.g, col.b], i * 3);
            });
            heads.instanceColor = new InstancedBufferAttribute(colors, 3);
            out.push(stems, heads);
        }

        return out;
    }, [seed, radius, fernCount, flowerCount, fernPalette, flowerPalette, reject, flowerGlow]);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        meshes.forEach(m => group.add(m));
        return () => {
            meshes.forEach(m => {
                group.remove(m);
                m.geometry.dispose();
                (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => mat.dispose());
            });
        };
    }, [meshes]);

    return <group ref={groupRef} />;
}
