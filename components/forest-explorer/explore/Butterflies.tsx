'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, type Group } from 'three';

const WING_COLORS = ['#ff9ec2', '#8fc2ff', '#ffd27a', '#c9a0ff', '#9fe8b0'];

interface ButterflyData {
    cx: number;
    cz: number;
    radius: number;
    height: number;
    speed: number;
    phase: number;
    color: string;
    scale: number;
}

/**
 * Daytime meadow butterflies: each circles lazily around its home spot,
 * bobbing and flapping. Two quads per butterfly — trivial draw cost.
 */
export function Butterflies({ count = 16 }: { count?: number }) {
    const butterflies = useMemo<ButterflyData[]>(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + 7) * 43758.5453;
            return x - Math.floor(x);
        };
        return Array.from({ length: count }, (_, i) => {
            const s = i * 31.7;
            const angle = rng(s) * Math.PI * 2;
            const dist = 5 + rng(s + 1) * 55;
            return {
                cx: Math.cos(angle) * dist,
                cz: Math.sin(angle) * dist,
                radius: 1.5 + rng(s + 2) * 3.5,
                height: 0.8 + rng(s + 3) * 1.6,
                speed: 0.25 + rng(s + 4) * 0.4,
                phase: rng(s + 5) * Math.PI * 2,
                color: WING_COLORS[i % WING_COLORS.length],
                scale: 0.8 + rng(s + 6) * 0.5,
            };
        });
    }, [count]);

    return (
        <>
            {butterflies.map((b, i) => (
                <Butterfly key={i} data={b} />
            ))}
        </>
    );
}

function Butterfly({ data }: { data: ButterflyData }) {
    const groupRef = useRef<Group>(null);
    const leftRef = useRef<Group>(null);
    const rightRef = useRef<Group>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (groupRef.current) {
            const a = t * data.speed + data.phase;
            groupRef.current.position.set(
                data.cx + Math.cos(a) * data.radius,
                data.height + Math.sin(t * 1.1 + data.phase) * 0.35,
                data.cz + Math.sin(a) * data.radius,
            );
            // Face travel direction (tangent of the circle)
            groupRef.current.rotation.y = -a - Math.PI / 2;
        }
        // Wing flap
        const flap = Math.sin(t * 14 + data.phase) * 0.9;
        if (leftRef.current) leftRef.current.rotation.z = flap;
        if (rightRef.current) rightRef.current.rotation.z = -flap;
    });

    return (
        <group ref={groupRef} scale={data.scale}>
            {/* Body */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.012, 0.02, 0.14, 5]} />
                <meshLambertMaterial color="#2c2418" />
            </mesh>
            {/* Wings */}
            <group ref={leftRef}>
                <mesh position={[-0.07, 0, 0]} rotation={[0, 0, 0]}>
                    <planeGeometry args={[0.14, 0.11]} />
                    <meshLambertMaterial color={data.color} side={DoubleSide} transparent opacity={0.92} />
                </mesh>
            </group>
            <group ref={rightRef}>
                <mesh position={[0.07, 0, 0]}>
                    <planeGeometry args={[0.14, 0.11]} />
                    <meshLambertMaterial color={data.color} side={DoubleSide} transparent opacity={0.92} />
                </mesh>
            </group>
        </group>
    );
}
