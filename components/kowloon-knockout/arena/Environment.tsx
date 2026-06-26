'use client';

import * as THREE from 'three/webgpu';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { reflector, mix, color, float } from 'three/tsl';
import { ARENA_RADIUS } from '@/lib/kowloon-knockout/game/fighters/types';
import { useRenderTier } from './RenderTierContext';

const FLOOR_BASE = '#0d0a16';
const REFLECTION_STRENGTH = 0.35; // wet-sheen blend; tune in browser sign-off

/** Arena stage: ring platform, rope-light boundary, corner posts. */
export default function Environment() {
    const ringRef = useRef<THREE.Mesh>(null);
    const floorRef = useRef<THREE.Mesh>(null);
    const { flags } = useRenderTier();

    // Ultra only: a planar reflector turns the floor into a wet rooftop that
    // mirrors the neon emitters/fighters. Lower tiers keep the IBL metalness
    // fake below (material untouched). `reflector()` allocates an internal
    // render target, so it is memoized and disposed on tier change/unmount.
    const reflection = useMemo(
        () => (flags.reflection ? reflector() : null),
        [flags.reflection],
    );

    useLayoutEffect(() => {
        const mesh = floorRef.current;
        if (!mesh || !reflection) return;
        const mat = mesh.material as THREE.MeshStandardNodeMaterial;
        // Blend the live reflection over the dark base albedo for a damp (not
        // mirror) look. roughness/metalness are set via JSX props off the same
        // flag so a re-render can't revert them out from under this node.
        mat.colorNode = mix(color(FLOOR_BASE), reflection, float(REFLECTION_STRENGTH));
        mat.needsUpdate = true;
        // The reflector's target orients the reflection plane; parenting it to
        // the (horizontal) floor mesh makes the plane track the floor.
        mesh.add(reflection.target);
        return () => {
            mesh.remove(reflection.target);
            reflection.dispose?.();
        };
    }, [reflection]);

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
            <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <circleGeometry args={[ARENA_RADIUS, 48]} />
                <meshStandardMaterial
                    color={FLOOR_BASE}
                    roughness={flags.reflection ? 0.08 : 0.25}
                    metalness={flags.reflection ? 0.9 : 0.6}
                    envMapIntensity={1.4}
                />
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
