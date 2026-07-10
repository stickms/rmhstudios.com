'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { distToRiver, RIVER_HALF_WIDTH, TREE_COLLIDERS, PLAYER_POS } from './constants';

function TikiTorch({ position, phase }: { position: [number, number, number]; phase: number }) {
    const innerFlameRef = useRef<Mesh>(null);
    const midFlameRef   = useRef<Mesh>(null);
    const glowRef       = useRef<Mesh>(null);
    const lightRef      = useRef<PointLight>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const flicker = Math.sin(t * 7 + phase) * 0.5 + Math.sin(t * 13 + phase * 2) * 0.3;

        if (innerFlameRef.current) {
            innerFlameRef.current.scale.y = 0.85 + flicker * 0.18;
            innerFlameRef.current.position.y = 2.55 + flicker * 0.05;
            const mat = innerFlameRef.current.material as MeshStandardMaterial;
            mat.emissiveIntensity = 2.0 + flicker * 2.5;
        }
        if (midFlameRef.current) {
            midFlameRef.current.scale.y = 0.9 + flicker * 0.12;
            const mat = midFlameRef.current.material as MeshStandardMaterial;
            mat.emissiveIntensity = 1.2 + flicker * 1.3;
        }
        if (glowRef.current) {
            const mat = glowRef.current.material as MeshStandardMaterial;
            mat.opacity = 0.18 + flicker * 0.10;
        }
        if (lightRef.current) {
            const dx = position[0] - PLAYER_POS.x;
            const dz = position[2] - PLAYER_POS.z;
            const nearPlayer = dx * dx + dz * dz < 576; // within 24m
            lightRef.current.visible = nearPlayer;
            if (nearPlayer) lightRef.current.intensity = 7 + flicker * 2;
        }
    });

    return (
        <group position={position}>
            <mesh position={[0, 1.1, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 2.2, 6]} />
                <meshLambertMaterial color="#6b3e1a" />
            </mesh>
            <mesh position={[0, 2.35, 0]}>
                <cylinderGeometry args={[0.18, 0.12, 0.28, 7]} />
                <meshLambertMaterial color="#3a2000" />
            </mesh>
            <mesh ref={midFlameRef} position={[0, 2.44, 0]}>
                <coneGeometry args={[0.13, 0.22, 6]} />
                <meshStandardMaterial
                    color="#ff6600"
                    emissive={new Color('#ff4400')}
                    emissiveIntensity={1.2}
                />
            </mesh>
            <mesh ref={innerFlameRef} position={[0, 2.55, 0]}>
                <coneGeometry args={[0.06, 0.32, 6]} />
                <meshStandardMaterial
                    color="#ff2200"
                    emissive={new Color('#ff0000')}
                    emissiveIntensity={2.0}
                />
            </mesh>
            <mesh ref={glowRef} position={[0, 2.48, 0]}>
                <sphereGeometry args={[0.22, 8, 6]} />
                <meshStandardMaterial color="#ffaa00" transparent opacity={0.18} />
            </mesh>
            <pointLight ref={lightRef} color="#ff8833" intensity={7} distance={30} decay={1.5} />
        </group>
    );
}

export function TikiTorches() {
    const torches = useMemo(() => {
        const positions: { pos: [number, number, number]; phase: number }[] = [];
        // Trimmed ring density: every torch is 7 meshes + a (culled) light,
        // so torch count is a direct night frame cost
        const rings = [
            { r: 8,  count: 4, offset: 0 },
            { r: 25, count: 5, offset: Math.PI / 6 },
            { r: 50, count: 6, offset: Math.PI / 8 },
            { r: 80, count: 6, offset: Math.PI / 10 },
        ];
        let id = 0;
        for (const { r, count, offset } of rings) {
            for (let i = 0; i < count; i++) {
                let angle = (i / count) * Math.PI * 2 + offset;
                for (let attempt = 0; attempt <= 8; attempt++) {
                    const cx = Math.cos(angle) * r;
                    const cz = Math.sin(angle) * r;
                    const inRiver = distToRiver(cx, cz) < RIVER_HALF_WIDTH + 1.0;
                    const blocked = inRiver || TREE_COLLIDERS.some((t) => {
                        const dx = cx - t.x, dz = cz - t.z;
                        return dx * dx + dz * dz < (t.r + 1.5) * (t.r + 1.5);
                    });
                    if (!blocked) {
                        positions.push({ pos: [cx, 0, cz], phase: id * 1.37 });
                        id++;
                        break;
                    }
                    angle += 0.12;
                }
            }
        }
        return positions;
    }, []);

    return (
        <>
            {torches.map((t, i) => (
                <TikiTorch key={i} position={t.pos} phase={t.phase} />
            ))}
        </>
    );
}
