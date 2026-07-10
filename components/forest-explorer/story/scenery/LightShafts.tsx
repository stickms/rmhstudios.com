'use client';

import { AdditiveBlending, DoubleSide } from 'three';

interface LightShaftsProps {
    positions: Array<[number, number]>;
    color?: string;
    height?: number;
    radius?: number;
    opacity?: number;
    /** Tilt (radians) so shafts lean like sunlight through canopy */
    tilt?: number;
}

/**
 * Fake volumetric light: additive translucent cones falling from the canopy.
 * Cheap, and sells "light through leaves" instantly.
 */
export function LightShafts({
    positions,
    color = '#bcd8ff',
    height = 26,
    radius = 3.2,
    opacity = 0.05,
    tilt = 0.18,
}: LightShaftsProps) {
    return (
        <>
            {positions.map(([x, z], i) => (
                <mesh
                    key={i}
                    position={[x, height / 2, z]}
                    rotation={[tilt, i * 1.3, tilt * 0.6]}
                >
                    <coneGeometry args={[radius, height, 8, 1, true]} />
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={opacity}
                        blending={AdditiveBlending}
                        side={DoubleSide}
                        depthWrite={false}
                        fog={false}
                    />
                </mesh>
            ))}
        </>
    );
}
