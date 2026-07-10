// RMH Farming Simulator — R3F canvas host. Low dpr + no antialias + CSS
// pixelation give the chunky pixel-3D look.
'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import FarmWorld from './scene/FarmWorld';

export default function FarmCanvas() {
    return (
        <Canvas
            shadows
            dpr={[0.75, 1]}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            camera={{ position: [0, 14, 12], fov: 50, near: 0.1, far: 80 }}
            style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
        >
            <Suspense fallback={null}>
                <FarmWorld />
            </Suspense>
        </Canvas>
    );
}
