'use client';

import { useMemo } from 'react';
import { NEON_PALETTE } from './materials';

const NEON = NEON_PALETTE;

/** Neon-Kowloon backdrop: skyline towers + floating sign strips.
 *  Extracted from Environment so the arena stage and the backdrop evolve
 *  independently (Phase 2). Currently a verbatim move — parity with the
 *  previous in-Environment rendering. */
export default function Skyline() {
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

    return (
        <group>
            {towers.map((t, i) => (
                <mesh key={`t${i}`} position={t.pos}>
                    <boxGeometry args={t.size} />
                    <meshStandardMaterial color="#0a0a14" emissive={t.color} emissiveIntensity={0.5} flatShading toneMapped={false} />
                </mesh>
            ))}
            {signs.map((s, i) => (
                <mesh key={`s${i}`} position={s.pos}>
                    <boxGeometry args={[0.4, s.h, 0.1]} />
                    <meshBasicMaterial color={s.color} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}
