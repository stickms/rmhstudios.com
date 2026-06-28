"use client";

import { Sky } from '@react-three/drei';
import { useCookgameStore } from '@/lib/cookgame/store';
import { phaseOfDay, sunDirection, type DayPhase } from '@/lib/cookgame/timeOfDay';
import { PALETTE } from './palette';

const SUN_DIST = 22; // matches the shadow camera extent

// Per-phase lighting look. Key = warm sun, ambient/hemi = fill, sky tints via sunPosition height.
const PHASE_LOOK: Record<DayPhase, { key: number; keyColor: string; ambient: number; hemi: number }> = {
  dawn:  { key: 0.9, keyColor: '#ffd2a6', ambient: 0.28, hemi: 0.5 },
  day:   { key: 1.4, keyColor: '#fff4e0', ambient: 0.25, hemi: 0.6 },
  dusk:  { key: 0.8, keyColor: '#ffb07a', ambient: 0.26, hemi: 0.45 },
  night: { key: 0.18, keyColor: '#9fb4ff', ambient: 0.12, hemi: 0.22 },
};

/**
 * Day–night lighting rig for CookGame. Reads a 1-second-quantized day clock
 * from the store and recomputes sun position, key intensity/color, and fill.
 */
export default function Lighting() {
  // Quantize to whole seconds to cap re-renders at ~1 Hz (sun moves ~1°/s).
  const clockSec = useCookgameStore((s) => Math.floor(s.clock / 1000));
  const clock = clockSec * 1000;

  const phase = phaseOfDay(clock);
  const look = PHASE_LOOK[phase];
  const [dx, dy, dz] = sunDirection(clock);
  // Clamp the sky/light sun above the horizon so drei's <Sky> stays lit at night
  // (the key intensity, not the sun height, is what darkens the world).
  const sun: [number, number, number] = [dx * SUN_DIST, Math.max(dy, 0.05) * SUN_DIST, dz * SUN_DIST];

  return (
    <>
      {/* Procedural sky — sun tracks the key light */}
      <Sky sunPosition={sun} />

      {/* Hemisphere fill: warm sky overhead, earthy ground bounce */}
      <hemisphereLight color={PALETTE.skyTop} groundColor={PALETTE.grass} intensity={look.hemi} />

      {/* Soft fill so shadow faces aren't pure black */}
      <ambientLight intensity={look.ambient} />

      {/* Sun key light */}
      <directionalLight
        position={sun}
        intensity={look.key}
        color={look.keyColor}
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
