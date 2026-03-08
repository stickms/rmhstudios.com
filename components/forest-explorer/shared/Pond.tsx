'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape, Color, type Mesh, type MeshStandardMaterial } from 'three';

export function Pond() {
    const waterRef = useRef<Mesh>(null);

    const pondShape = useMemo(() => {
        const s = new Shape();
        s.ellipse(0, 0, 7, 5, 0, Math.PI * 2, false, 0);
        return s;
    }, []);

    const highlightShape = useMemo(() => {
        const s = new Shape();
        s.ellipse(0, 0, 4, 2.8, 0, Math.PI * 2, false, 0);
        return s;
    }, []);

    useFrame((state) => {
        if (!waterRef.current) return;
        const mat = waterRef.current.material as MeshStandardMaterial;
        mat.opacity = 0.82 + Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
        mat.emissiveIntensity = 0.04 + Math.sin(state.clock.elapsedTime * 0.4) * 0.02;
    });

    const pondRocks: [number, number, number, number][] = [
        [28,  0.15, -28, 0.9],
        [33,  0.12, -22, 0.7],
        [34,  0.10, -18, 0.5],
        [23,  0.14, -17, 0.8],
        [22,  0.10, -26, 0.6],
        [30,  0.18, -29, 1.1],
        [36,  0.12, -24, 0.6],
        [26,  0.10, -16, 0.5],
    ];

    const reeds: [number, number, number][] = [
        [23.5, 0, -18.5],
        [24.2, 0, -19.8],
        [22.8, 0, -20.4],
        [24.8, 0, -18.2],
        [23.1, 0, -21.0],
    ];

    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[28, 0.002, -22]}>
                <circleGeometry args={[9, 14]} />
                <meshLambertMaterial color="#1e3d28" />
            </mesh>

            <mesh
                ref={waterRef}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[28, 0.04, -22]}
            >
                <shapeGeometry args={[pondShape, 18]} />
                <meshStandardMaterial
                    color="#1a4a6b"
                    roughness={0.05}
                    metalness={0.15}
                    transparent
                    opacity={0.88}
                    emissive={new Color('#0a2030')}
                    emissiveIntensity={0.04}
                />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0.3, 0]} position={[27, 0.05, -22.5]}>
                <shapeGeometry args={[highlightShape, 14]} />
                <meshStandardMaterial
                    color="#2a6a9b"
                    roughness={0.02}
                    transparent
                    opacity={0.35}
                />
            </mesh>

            {pondRocks.map(([x, y, z, s], i) => (
                <mesh
                    key={i}
                    position={[x, y, z]}
                    rotation={[Math.sin(i) * 0.3, i * 1.3, 0]}
                    castShadow
                >
                    <dodecahedronGeometry args={[0.38 * s, 0]} />
                    <meshLambertMaterial color="#6a6a5e" />
                </mesh>
            ))}

            {reeds.map(([x, , z], i) => (
                <group key={i} position={[x, 0, z]}>
                    <mesh position={[0, 0.55, 0]}>
                        <cylinderGeometry args={[0.025, 0.03, 1.1, 5]} />
                        <meshLambertMaterial color="#4a7a30" />
                    </mesh>
                    <mesh position={[0, 1.2, 0]}>
                        <cylinderGeometry args={[0.05, 0.04, 0.22, 6]} />
                        <meshLambertMaterial color="#5a3a1a" />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
