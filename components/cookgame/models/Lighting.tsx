"use client";

import { Sky } from '@react-three/drei';
import { PALETTE } from './palette';

/**
 * Warm daytime suburban lighting rig for CookGame.
 * - HemisphereLight: sky/ground fill using palette tones.
 * - DirectionalLight (key): warm sun angle with castShadow.
 *   Shadow camera covers ±22 units to match the ~40×40 town.
 * - AmbientLight: soft fill to prevent pitch-black shadows.
 * - Sky: drei procedural sky at the same sun position as the key light.
 */
export default function Lighting() {
  return (
    <>
      {/* Procedural sky — sun position matches key light direction */}
      <Sky sunPosition={[12, 18, 8]} />

      {/* Hemisphere fill: warm sky overhead, earthy ground bounce */}
      <hemisphereLight
        color={PALETTE.skyTop}
        groundColor={PALETTE.grass}
        intensity={0.6}
      />

      {/* Soft fill so shadow faces aren't pure black */}
      <ambientLight intensity={0.25} />

      {/* Warm afternoon sun key light */}
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.4}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
    </>
  );
}
