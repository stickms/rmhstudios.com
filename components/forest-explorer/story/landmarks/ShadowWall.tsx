'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial } from 'three';
import { useLandmarkState } from './useLandmarkState';

interface ShadowWallProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

/**
 * A carved stone wall with silhouette recesses (deer, tree, moon, river)
 * flanked by two ember braziers — the stage for the Shadow Play puzzle.
 */
export function ShadowWall({ position, scale = 1, id }: ShadowWallProps) {
    const { isRevealed, isSolved } = useLandmarkState(id);
    const carvingRefs = useRef<(Mesh | null)[]>([]);
    const flameRefs = useRef<(Mesh | null)[]>([]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        carvingRefs.current.forEach((ref, i) => {
            if (!ref) return;
            const mat = ref.material as MeshStandardMaterial;
            if (isSolved) {
                mat.emissiveIntensity = 0.7 + Math.sin(t * 1.5 + i * 0.9) * 0.2;
                mat.emissive.set('#44ffaa');
            } else if (isRevealed) {
                mat.emissiveIntensity = 0.35 + Math.sin(t * 2.2 + i * 1.3) * 0.2;
                mat.emissive.set('#8866ff');
            } else {
                mat.emissiveIntensity = 0.05;
            }
        });
        flameRefs.current.forEach((ref, i) => {
            if (!ref) return;
            const flicker = Math.sin(t * 8 + i * 2.4) * 0.5 + Math.sin(t * 13 + i) * 0.3;
            ref.scale.y = 0.9 + flicker * 0.18;
            (ref.material as MeshStandardMaterial).emissiveIntensity = 1.4 + flicker;
        });
    });

    // Simplified silhouettes carved as flattened shapes on the wall face
    const carvings: Array<{ x: number; geo: 'deer' | 'tree' | 'moon' | 'river' }> = [
        { x: -2.7, geo: 'deer' },
        { x: -0.9, geo: 'tree' },
        { x: 0.9, geo: 'moon' },
        { x: 2.7, geo: 'river' },
    ];

    return (
        <group position={position} scale={scale}>
            {/* Main wall */}
            <mesh position={[0, 1.9, 0]} castShadow>
                <boxGeometry args={[8, 3.8, 0.7]} />
                <meshLambertMaterial color="#4c4a42" />
            </mesh>
            {/* Weathered cap stones */}
            <mesh position={[0, 3.95, 0]} castShadow>
                <boxGeometry args={[8.5, 0.4, 1.0]} />
                <meshLambertMaterial color="#57544a" />
            </mesh>
            {/* Cracked base rubble */}
            {[-3.4, -1.2, 1.6, 3.6].map((x, i) => (
                <mesh key={`rub-${i}`} position={[x, 0.2, 0.6]} rotation={[0.2, i * 1.7, 0.1]}>
                    <dodecahedronGeometry args={[0.35, 0]} />
                    <meshLambertMaterial color="#54514a" />
                </mesh>
            ))}

            {/* Carved silhouettes */}
            {carvings.map((c, i) => (
                <group key={c.geo} position={[c.x, 2.0, 0.38]}>
                    {c.geo === 'deer' && (
                        <mesh ref={el => { carvingRefs.current[i] = el; }}>
                            <boxGeometry args={[0.7, 0.9, 0.06]} />
                            <meshStandardMaterial color="#2a2822" emissive={new Color('#8866ff')} emissiveIntensity={0.05} />
                        </mesh>
                    )}
                    {c.geo === 'tree' && (
                        <mesh ref={el => { carvingRefs.current[i] = el; }}>
                            <coneGeometry args={[0.45, 1.0, 5]} />
                            <meshStandardMaterial color="#2a2822" emissive={new Color('#8866ff')} emissiveIntensity={0.05} />
                        </mesh>
                    )}
                    {c.geo === 'moon' && (
                        <mesh ref={el => { carvingRefs.current[i] = el; }}>
                            <torusGeometry args={[0.32, 0.12, 6, 12]} />
                            <meshStandardMaterial color="#2a2822" emissive={new Color('#8866ff')} emissiveIntensity={0.05} />
                        </mesh>
                    )}
                    {c.geo === 'river' && (
                        <mesh ref={el => { carvingRefs.current[i] = el; }} rotation={[0, 0, 0.5]}>
                            <boxGeometry args={[0.9, 0.18, 0.06]} />
                            <meshStandardMaterial color="#2a2822" emissive={new Color('#8866ff')} emissiveIntensity={0.05} />
                        </mesh>
                    )}
                </group>
            ))}

            {/* Flanking braziers */}
            {[-4.6, 4.6].map((x, i) => (
                <group key={`brazier-${i}`} position={[x, 0, 0.4]}>
                    <mesh position={[0, 0.55, 0]} castShadow>
                        <cylinderGeometry args={[0.12, 0.2, 1.1, 6]} />
                        <meshLambertMaterial color="#3a352c" />
                    </mesh>
                    <mesh position={[0, 1.18, 0]}>
                        <cylinderGeometry args={[0.3, 0.18, 0.24, 7]} />
                        <meshLambertMaterial color="#2c2820" />
                    </mesh>
                    <mesh ref={el => { flameRefs.current[i] = el; }} position={[0, 1.44, 0]}>
                        <coneGeometry args={[0.14, 0.4, 6]} />
                        <meshStandardMaterial color="#ff7722" emissive={new Color('#ff5500')} emissiveIntensity={1.4} />
                    </mesh>
                    <pointLight position={[0, 1.5, 0]} color="#ff8840" intensity={0.9} distance={9} decay={2} />
                </group>
            ))}
        </group>
    );
}
