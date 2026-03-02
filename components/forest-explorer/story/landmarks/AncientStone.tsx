'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';

interface AncientStoneProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

export function AncientStone({ position, scale = 1, id }: AncientStoneProps) {
    const glowRef = useRef<THREE.Mesh>(null);
    const revealedIds = useStoryStore(s => s.flashlightRevealedIds);
    const puzzleStates = useStoryStore(s => s.puzzleStates);

    // Find the related interactable — check if it's revealed or solved
    const isRevealed = revealedIds.some(rid => rid.includes(id));
    const relatedPuzzle = Object.entries(puzzleStates).find(([pid]) => pid.includes(id.replace('_landmark', '')));
    const isSolved = relatedPuzzle?.[1]?.status === 'solved';

    useFrame((state) => {
        if (!glowRef.current) return;
        const mat = glowRef.current.material as THREE.MeshStandardMaterial;
        if (isSolved) {
            mat.emissiveIntensity = 0.8 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
            mat.emissive.set('#00ff88');
        } else if (isRevealed) {
            mat.emissiveIntensity = 0.4 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
            mat.emissive.set('#6688ff');
        } else {
            mat.emissiveIntensity = 0;
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Stone circle — 6 standing stones */}
            {Array.from({ length: 6 }, (_, i) => {
                const angle = (i / 6) * Math.PI * 2;
                const r = 3;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(angle) * r, 1.2, Math.sin(angle) * r]}
                        rotation={[0, angle + Math.PI / 2, 0]}
                        castShadow
                    >
                        <boxGeometry args={[0.5, 2.4, 0.8]} />
                        <meshLambertMaterial color="#5a5a50" />
                    </mesh>
                );
            })}
            {/* Central altar stone */}
            <mesh position={[0, 0.4, 0]} castShadow>
                <cylinderGeometry args={[0.8, 1.0, 0.8, 8]} />
                <meshLambertMaterial color="#6a6a5e" />
            </mesh>
            {/* Glow effect on altar */}
            <mesh ref={glowRef} position={[0, 0.9, 0]}>
                <sphereGeometry args={[0.4, 12, 8]} />
                <meshStandardMaterial
                    color="#4466aa"
                    transparent
                    opacity={0.3}
                    emissive={new THREE.Color('#6688ff')}
                    emissiveIntensity={0}
                />
            </mesh>
        </group>
    );
}
