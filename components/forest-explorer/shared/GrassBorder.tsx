'use client';

import { useRef, useMemo, useEffect } from 'react';
import { PlaneGeometry, MeshLambertMaterial, DoubleSide, InstancedMesh, Object3D, Color, InstancedBufferAttribute, type Group } from 'three';

export function GrassBorder() {
    const groupRef = useRef<Group>(null);

    const meshRef = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 77) * 43758.5453; return x - Math.floor(x); };
        const colorHexes = ['#2d6020', '#3d7828', '#4a8a2a', '#234e18', '#3a6e24'];

        const blades: Array<{ x: number; z: number; rotX: number; rotY: number; w: number; h: number; colorIdx: number }> = [];

        const ring1Count = 260;
        for (let c = 0; c < ring1Count; c++) {
            const baseAngle = (c / ring1Count) * Math.PI * 2;
            for (let b = 0; b < 7; b++) {
                const sc = c * 17.3 + b * 3.7;
                const jitterAngle = baseAngle + (rng(sc) - 0.5) * 0.14;
                const jitterR = 112 + (rng(sc + 1) - 0.5) * 6;
                blades.push({
                    x: Math.cos(jitterAngle) * jitterR, z: Math.sin(jitterAngle) * jitterR,
                    rotY: rng(sc + 2) * Math.PI * 2, rotX: 0.08 + rng(sc + 3) * 0.18,
                    w: 0.12 + rng(sc + 4) * 0.09, h: 1.4 + rng(sc + 5) * 1.2,
                    colorIdx: Math.floor(rng(sc + 6) * 5),
                });
            }
        }

        const ring2Count = 160;
        for (let c = 0; c < ring2Count; c++) {
            const baseAngle = (c / ring2Count) * Math.PI * 2 + Math.PI / ring2Count;
            for (let b = 0; b < 5; b++) {
                const sc = c * 23.7 + b * 5.1 + 9000;
                const jitterAngle = baseAngle + (rng(sc) - 0.5) * 0.16;
                const jitterR = 121 + (rng(sc + 1) - 0.5) * 8;
                blades.push({
                    x: Math.cos(jitterAngle) * jitterR, z: Math.sin(jitterAngle) * jitterR,
                    rotY: rng(sc + 2) * Math.PI * 2, rotX: 0.05 + rng(sc + 3) * 0.12,
                    w: 0.14 + rng(sc + 4) * 0.10, h: 2.0 + rng(sc + 5) * 1.5,
                    colorIdx: Math.floor(rng(sc + 6) * 5),
                });
            }
        }

        const count = blades.length;
        const geo = new PlaneGeometry(1, 1);
        const mat = new MeshLambertMaterial({ side: DoubleSide });
        const im = new InstancedMesh(geo, mat, count);

        const dummy = new Object3D();
        const col = new Color();
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const b = blades[i];
            dummy.position.set(b.x, b.h / 2, b.z);
            dummy.rotation.set(b.rotX, b.rotY, 0);
            dummy.scale.set(b.w, b.h, 1);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);

            col.set(colorHexes[b.colorIdx]);
            colors.set([col.r, col.g, col.b], i * 3);
        }

        im.instanceColor = new InstancedBufferAttribute(colors, 3);
        return im;
    }, []);

    useEffect(() => {
        const group = groupRef.current;
        if (!group || !meshRef) return;
        group.add(meshRef);
        return () => { group.remove(meshRef); };
    }, [meshRef]);

    return <group ref={groupRef} />;
}
