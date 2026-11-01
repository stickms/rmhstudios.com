// RMH Farming Simulator — R3F canvas host. Low dpr + no antialias + CSS
// pixelation give the chunky pixel-3D look.
'use client';

import { WebGLUnavailable, useWebGLSupport } from '@/components/shared/WebGLUnavailable';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { markGamePlaying } from '@/lib/game-capabilities';
import FarmWorld from './scene/FarmWorld';

export default function FarmCanvas() {
    const webgl = useWebGLSupport();
    // The farm runs for as long as its canvas is mounted: quiet the jelly
    // material's ambient motion and arcs (R16).
    useEffect(() => markGamePlaying(), []);
    if (!webgl) return <WebGLUnavailable gameName="RMH Farming Simulator" />;
    return (
        <Canvas
            data-jelly-zone="playfield"
            shadows
            dpr={[0.75, 1]}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            camera={{ position: [0, 14, 12], fov: 50, near: 0.1, far: 80 }}
            style={{ width: '100%', height: '100%', imageRendering: 'pixelated', touchAction: 'none' }}
        >
            <Suspense fallback={null}>
                <FarmWorld />
            </Suspense>
        </Canvas>
    );
}
