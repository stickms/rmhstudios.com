'use client';

import * as THREE from 'three/webgpu';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ARENA_RADIUS } from '@/lib/kowloon-knockout/game/fighters/types';

/** Arena stage: ring platform, rope-light boundary, corner posts. */
export default function Environment() {
    const ringRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (ringRef.current) {
            // MeshStandardNodeMaterial still exposes emissiveIntensity as a
            // uniform-backed scalar, so per-frame mutation works unchanged.
            const m = ringRef.current.material as THREE.MeshStandardNodeMaterial;
            m.emissiveIntensity = 1.6 + Math.sin(state.clock.elapsedTime * 4) * 0.4;
        }
    });

    return (
        <group>
            {/* Arena floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <circleGeometry args={[ARENA_RADIUS, 48]} />
                <meshStandardMaterial color="#0d0a16" roughness={0.25} metalness={0.6} envMapIntensity={1.4} />
            </mesh>
            {/* Inner glowing court line */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[ARENA_RADIUS - 1.2, ARENA_RADIUS - 1.0, 48]} />
                <meshBasicMaterial color="#ff3366" transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>

            {/* Rope-light boundary (the "ring") */}
            <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
                <torusGeometry args={[ARENA_RADIUS, 0.06, 8, 64]} />
                <meshStandardMaterial color="#33ccff" emissive="#33ccff" emissiveIntensity={1.8} toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.1, 0]}>
                <torusGeometry args={[ARENA_RADIUS, 0.05, 8, 64]} />
                <meshStandardMaterial color="#ff3366" emissive="#ff3366" emissiveIntensity={1.5} toneMapped={false} />
            </mesh>

            {/* Corner / cardinal posts */}
            {[0, 1, 2, 3].map((i) => {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                return (
                    <mesh key={i} position={[Math.cos(a) * ARENA_RADIUS, 0.7, Math.sin(a) * ARENA_RADIUS]} castShadow>
                        <cylinderGeometry args={[0.12, 0.14, 1.5, 6]} />
                        <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={0.7} flatShading />
                    </mesh>
                );
            })}

        </group>
    );
}
