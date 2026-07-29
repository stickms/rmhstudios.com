'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { DirectionalLight } from 'three';
import { Object3D } from 'three';
import { useRenderQuality } from '@/lib/render/useRenderQuality';

interface Props {
    /** Light position relative to the player, in world units. */
    offset: [number, number, number];
    intensity: number;
    color: string;
    /**
     * Half-width of the shadow frustum. The acts previously used 100–120, which
     * spread a 1024² map over 200–240 world units — roughly 0.2 units per
     * texel, so shadows were both expensive (the whole forest re-rendered into
     * the map) and visibly blocky. 30 gives ~0.03 units/texel at 2048,
     * comparable to cookgame's, and the frustum follows the player so distant
     * geometry simply goes unshadowed.
     */
    extent?: number;
}

/**
 * Directional "sun" whose shadow camera tracks the player.
 *
 * Shadow-map resolution comes from the render tier, and the whole light drops
 * out of the tree when the tier disables shadows — so low-end devices skip the
 * shadow pass rather than paying for a low-quality one.
 */
export default function ShadowFollowSun({ offset, intensity, color, extent = 30 }: Props) {
    const lightRef = useRef<DirectionalLight>(null);
    const { camera } = useThree();
    const { quality } = useRenderQuality();
    const target = useMemo(() => new Object3D(), []);

    // World units per shadow texel — used to snap the frustum so shadow edges
    // don't shimmer as the player walks.
    const texel = (extent * 2) / quality.shadowMapSize;

    useFrame(() => {
        const light = lightRef.current;
        if (!light) return;
        const x = Math.round(camera.position.x / texel) * texel;
        const z = Math.round(camera.position.z / texel) * texel;
        target.position.set(x, 0, z);
        target.updateMatrixWorld();
        light.position.set(x + offset[0], offset[1], z + offset[2]);
    });

    if (!quality.shadows) {
        return <directionalLight position={offset} intensity={intensity} color={color} />;
    }

    return (
        <>
            <primitive object={target} />
            <directionalLight
                ref={lightRef}
                position={offset}
                intensity={intensity}
                color={color}
                target={target}
                castShadow
                shadow-mapSize-width={quality.shadowMapSize}
                shadow-mapSize-height={quality.shadowMapSize}
                shadow-camera-near={1}
                shadow-camera-far={Math.abs(offset[1]) * 2 + extent * 2}
                shadow-camera-left={-extent}
                shadow-camera-right={extent}
                shadow-camera-top={extent}
                shadow-camera-bottom={-extent}
                shadow-bias={-0.0005}
                shadow-normalBias={0.02}
            />
        </>
    );
}
