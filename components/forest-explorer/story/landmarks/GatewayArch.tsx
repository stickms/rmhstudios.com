'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';

interface GatewayArchProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

export function GatewayArch({ position, scale = 1, id }: GatewayArchProps) {
    const portalRef = useRef<Mesh>(null);
    const storyFlags = useStoryStore(s => s.storyFlags);

    // Portal appears when the gateway event is triggered
    const isOpen = storyFlags[`${id.split('_')[0]}_gateway_opened`] ?? false;

    useFrame((state) => {
        if (!portalRef.current) return;
        const mat = portalRef.current.material as MeshStandardMaterial;
        if (isOpen) {
            mat.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
            mat.emissiveIntensity = 1.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.4;
            portalRef.current.rotation.y += 0.005;
        } else {
            mat.opacity = 0;
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Left pillar */}
            <mesh position={[-2, 2.5, 0]} castShadow>
                <boxGeometry args={[0.8, 5, 0.8]} />
                <meshLambertMaterial color="#5a4a3a" />
            </mesh>
            {/* Right pillar */}
            <mesh position={[2, 2.5, 0]} castShadow>
                <boxGeometry args={[0.8, 5, 0.8]} />
                <meshLambertMaterial color="#5a4a3a" />
            </mesh>
            {/* Arch top */}
            <mesh position={[0, 5.2, 0]} castShadow>
                <boxGeometry args={[4.8, 0.6, 0.8]} />
                <meshLambertMaterial color="#6a5a4a" />
            </mesh>
            {/* Decorative keystone */}
            <mesh position={[0, 5.6, 0]}>
                <dodecahedronGeometry args={[0.4, 0]} />
                <meshStandardMaterial
                    color="#8a7a6a"
                    emissive={new Color(isOpen ? '#ffaa44' : '#333333')}
                    emissiveIntensity={isOpen ? 0.8 : 0.1}
                />
            </mesh>
            {/* Portal glow (visible only when open) */}
            <mesh ref={portalRef} position={[0, 2.8, 0]}>
                <planeGeometry args={[3.2, 4.5]} />
                <meshStandardMaterial
                    color="#88aaff"
                    transparent
                    opacity={0}
                    emissive={new Color('#4466dd')}
                    emissiveIntensity={0}
                    side={DoubleSide}
                />
            </mesh>
        </group>
    );
}
