'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Color, DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import {
    RIVER_CURVE,
    RIVER_HALF_WIDTH,
    BRIDGE_PARAMS,
    BRIDGE_WIDTH,
    BRIDGE_LENGTH,
} from './constants';

export function River() {
    const waterRef = useRef<Mesh>(null);

    const { waterGeo, bankGeoLeft, bankGeoRight } = useMemo(() => {
        const segments = 120;
        const positions: number[] = [];
        const indices: number[] = [];

        const bankLPositions: number[] = [];
        const bankRPositions: number[] = [];
        const bankLIndices: number[] = [];
        const bankRIndices: number[] = [];
        const bankWidth = 1.5;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const p = RIVER_CURVE.getPoint(t);
            const tangent = RIVER_CURVE.getTangent(t);
            const nx = -tangent.z, nz = tangent.x;

            positions.push(
                p.x + nx * RIVER_HALF_WIDTH, 0.08, p.z + nz * RIVER_HALF_WIDTH,
                p.x - nx * RIVER_HALF_WIDTH, 0.08, p.z - nz * RIVER_HALF_WIDTH,
            );

            const lInner = RIVER_HALF_WIDTH;
            const lOuter = RIVER_HALF_WIDTH + bankWidth;
            bankLPositions.push(
                p.x + nx * lInner, 0.05, p.z + nz * lInner,
                p.x + nx * lOuter, 0.05, p.z + nz * lOuter,
            );

            bankRPositions.push(
                p.x - nx * lInner, 0.05, p.z - nz * lInner,
                p.x - nx * lOuter, 0.05, p.z - nz * lOuter,
            );

            if (i > 0) {
                const v = (i - 1) * 2;
                indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
                bankLIndices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
                bankRIndices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
            }
        }

        const wGeo = new BufferGeometry();
        wGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        wGeo.setIndex(indices);
        wGeo.computeVertexNormals();

        const blGeo = new BufferGeometry();
        blGeo.setAttribute('position', new Float32BufferAttribute(bankLPositions, 3));
        blGeo.setIndex(bankLIndices);
        blGeo.computeVertexNormals();

        const brGeo = new BufferGeometry();
        brGeo.setAttribute('position', new Float32BufferAttribute(bankRPositions, 3));
        brGeo.setIndex(bankRIndices);
        brGeo.computeVertexNormals();

        return { waterGeo: wGeo, bankGeoLeft: blGeo, bankGeoRight: brGeo };
    }, []);

    useFrame((state) => {
        if (!waterRef.current) return;
        const mat = waterRef.current.material as MeshStandardMaterial;
        mat.opacity = 0.82 + Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
        mat.emissiveIntensity = 0.04 + Math.sin(state.clock.elapsedTime * 0.4) * 0.02;
    });

    return (
        <group>
            <mesh ref={waterRef} geometry={waterGeo}>
                <meshStandardMaterial
                    color="#1a4a6b"
                    roughness={0.05}
                    metalness={0.15}
                    transparent
                    opacity={0.88}
                    emissive={new Color('#0a2030')}
                    emissiveIntensity={0.04}
                    side={DoubleSide}
                />
            </mesh>
            <mesh geometry={bankGeoLeft}>
                <meshLambertMaterial color="#1e3d28" side={DoubleSide} />
            </mesh>
            <mesh geometry={bankGeoRight}>
                <meshLambertMaterial color="#1e3d28" side={DoubleSide} />
            </mesh>
        </group>
    );
}

export function Bridges() {
    const bridges = useMemo(() => {
        return BRIDGE_PARAMS.map(t => {
            const pos = RIVER_CURVE.getPoint(t);
            const tangent = RIVER_CURVE.getTangent(t);
            const angle = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
            return { position: [pos.x, 0.12, pos.z] as [number, number, number], rotY: angle };
        });
    }, []);

    return (
        <>
            {bridges.map((b, i) => (
                <group key={i} position={b.position} rotation={[0, b.rotY, 0]}>
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[BRIDGE_WIDTH, 0.12, BRIDGE_LENGTH]} />
                        <meshLambertMaterial color="#8B6914" />
                    </mesh>
                    <mesh position={[-BRIDGE_WIDTH / 2 + 0.05, 0.35, 0]}>
                        <boxGeometry args={[0.1, 0.55, BRIDGE_LENGTH]} />
                        <meshLambertMaterial color="#6b4423" />
                    </mesh>
                    <mesh position={[BRIDGE_WIDTH / 2 - 0.05, 0.35, 0]}>
                        <boxGeometry args={[0.1, 0.55, BRIDGE_LENGTH]} />
                        <meshLambertMaterial color="#6b4423" />
                    </mesh>
                    {[-BRIDGE_LENGTH / 2 + 0.3, 0, BRIDGE_LENGTH / 2 - 0.3].map((zp, j) => (
                        <group key={j}>
                            <mesh position={[-BRIDGE_WIDTH / 2 + 0.05, 0.5, zp]}>
                                <boxGeometry args={[0.12, 0.85, 0.12]} />
                                <meshLambertMaterial color="#5a3a1a" />
                            </mesh>
                            <mesh position={[BRIDGE_WIDTH / 2 - 0.05, 0.5, zp]}>
                                <boxGeometry args={[0.12, 0.85, 0.12]} />
                                <meshLambertMaterial color="#5a3a1a" />
                            </mesh>
                        </group>
                    ))}
                </group>
            ))}
        </>
    );
}
