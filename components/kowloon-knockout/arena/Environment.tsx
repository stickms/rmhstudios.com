'use client';

import * as THREE from 'three/webgpu';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ARENA_RADIUS } from '@/lib/kowloon-knockout/game/fighters/types';
import { NEON_PALETTE } from './materials';

const NEON = NEON_PALETTE;

/** Static neon-Kowloon backdrop: ring platform, rope-light boundary, skyline. */
export default function Environment() {
    const ringRef = useRef<THREE.Mesh>(null);

    // Skyline: a ring of emissive tower blocks at a distance, randomised once.
    const towers = useMemo(() => {
        const arr: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [];
        const count = 46;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
            const dist = 22 + Math.random() * 16;
            const h = 8 + Math.random() * 30;
            const w = 2.5 + Math.random() * 3.5;
            arr.push({
                pos: [Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist],
                size: [w, h, w],
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

    // Floating vertical neon sign strips.
    const signs = useMemo(() => {
        const arr: { pos: [number, number, number]; h: number; color: string }[] = [];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const dist = 14 + Math.random() * 6;
            arr.push({
                pos: [Math.cos(a) * dist, 3 + Math.random() * 9, Math.sin(a) * dist],
                h: 2 + Math.random() * 4,
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

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
                <meshStandardMaterial color="#15101f" roughness={0.85} metalness={0.2} />
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

            {/* Skyline towers */}
            {towers.map((t, i) => (
                <mesh key={`t${i}`} position={t.pos}>
                    <boxGeometry args={t.size} />
                    <meshStandardMaterial color="#0a0a14" emissive={t.color} emissiveIntensity={0.5} flatShading toneMapped={false} />
                </mesh>
            ))}

            {/* Floating neon sign strips */}
            {signs.map((s, i) => (
                <mesh key={`s${i}`} position={s.pos}>
                    <boxGeometry args={[0.4, s.h, 0.1]} />
                    <meshBasicMaterial color={s.color} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}
