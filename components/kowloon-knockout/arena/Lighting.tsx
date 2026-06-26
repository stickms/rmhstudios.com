'use client';

import { useThree } from '@react-three/fiber';
import { Environment as DreiEnvironment, Lightformer } from '@react-three/drei';
import { useRenderTier } from './RenderTierContext';

/** Noir key light + neon fills + image-based lighting.
 *  IBL uses Lightformers (procedural, no asset dependency) so the overhaul
 *  works before any HDRI is sourced; swap to `files="/kowloon/env-night.hdr"`
 *  on DreiEnvironment once the CC0 HDRI is added. */
export default function Lighting() {
    const { flags } = useRenderTier();
    const size = flags.shadowMapSize;
    useThree(); // ensure runs inside Canvas

    return (
        <>
            {/* Image-based lighting built from emissive panels → real PBR reflections */}
            <DreiEnvironment resolution={256} background={false}>
                <Lightformer intensity={2.5} color="#33ccff" position={[-6, 4, -4]} scale={[6, 10, 1]} />
                <Lightformer intensity={2.5} color="#ff3366" position={[6, 4, 4]} scale={[6, 10, 1]} />
                <Lightformer intensity={1.2} color="#ffcc88" position={[0, 8, 0]} scale={[10, 10, 1]} rotation={[Math.PI / 2, 0, 0]} />
            </DreiEnvironment>

            <ambientLight intensity={0.12} color="#3a2f5a" />
            <directionalLight
                position={[6, 14, 8]}
                intensity={1.4}
                color="#ffe0c0"
                castShadow
                shadow-mapSize-width={size}
                shadow-mapSize-height={size}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
                shadow-bias={-0.0004}
            />
            <pointLight position={[-8, 6, -4]} intensity={50} color="#33ccff" distance={40} />
            <pointLight position={[8, 6, 4]} intensity={50} color="#ff3366" distance={40} />
        </>
    );
}
