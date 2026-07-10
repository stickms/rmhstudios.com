'use client';

import { useMemo } from 'react';
import { Color } from 'three';
import type { CorridorSegment } from '@/lib/forest-explorer/types';

interface PathStripsProps {
    corridors: CorridorSegment[];
    /** Trodden-earth color, act-tinted */
    color?: string;
}

/**
 * Worn dirt paths rendered along each corridor segment, with a darker center
 * line. Doubles as wayfinding — the maps read as designed places instead of
 * uniform grass discs.
 */
export function PathStrips({ corridors, color = '#4a3f2c' }: PathStripsProps) {
    const centerColor = useMemo(
        () => `#${new Color(color).multiplyScalar(0.72).getHexString()}`,
        [color],
    );
    const strips = useMemo(() => {
        return corridors.map((c, i) => {
            const [sx, sz] = c.start;
            const [ex, ez] = c.end;
            const dx = ex - sx, dz = ez - sz;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);
            return {
                id: i,
                mid: [(sx + ex) / 2, (sz + ez) / 2] as [number, number],
                len: len + c.width * 0.6,
                width: c.width * 0.62,
                angle,
            };
        });
    }, [corridors]);

    return (
        <>
            {strips.map(s => (
                <group key={s.id} position={[s.mid[0], 0, s.mid[1]]} rotation={[0, s.angle, 0]}>
                    {/* Path bed */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
                        <planeGeometry args={[s.width, s.len]} />
                        <meshLambertMaterial color={color} transparent opacity={0.85} />
                    </mesh>
                    {/* Worn center line */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
                        <planeGeometry args={[s.width * 0.35, s.len]} />
                        <meshLambertMaterial color={centerColor} transparent opacity={0.9} />
                    </mesh>
                </group>
            ))}
        </>
    );
}
