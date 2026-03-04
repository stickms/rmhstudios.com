'use client';

import { useMemo } from 'react';
import type { RockProps } from './types';

export function Rock({ position, scale = 1 }: RockProps) {
    const rotY = useMemo(() => Math.random() * Math.PI * 2, []);
    const rotX = useMemo(() => Math.random() * 0.4, []);
    return (
        <mesh position={position} rotation={[rotX, rotY, 0]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.38 * scale, 0]} />
            <meshLambertMaterial color="#7a7a6e" />
        </mesh>
    );
}
