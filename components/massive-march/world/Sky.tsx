/**
 * Massive March — sky, sun, and the fact that it gets genuinely dark.
 *
 * The day/night cycle is a mechanic, not a mood (§9.3). At night the island is
 * dark enough that a torch stops being a convenience and becomes the thing that
 * decides who can do what — so this component is deliberately not shy about it.
 * Ambient light drops to almost nothing, fog closes in, and the only reliable
 * way to find somebody is a light they are holding or a sound they are making.
 *
 * The lighting rig is one directional light (the sun, or the moon after dark)
 * plus a hemisphere fill. Shadows are cast from a box that follows the player
 * rather than covering the island, because a shadow map that spans nine hundred
 * metres has no resolution left for a person standing on a pressure pad.
 */

'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BackSide, Color, type DirectionalLight, type Fog, type Mesh, type PointsMaterial } from 'three';
import type { QualityFlags } from '@/lib/render/tier';
import { SKY } from '@/lib/massive-march/palette';
import { daylight } from '@/lib/massive-march/constants';
import { currentDayFraction, live } from '@/lib/massive-march/live';
import { WORLD_EXTENT } from '@/lib/massive-march/world/terrain';

/**
 * The sky shell, and the far plane it has to live inside.
 *
 * These are not free numbers: a dome drawn beyond `CAMERA_FAR` is clipped by the
 * frustum and the sky becomes a disc floating on the clear colour — which is
 * exactly what shipped. The ordering that has to hold is
 *
 *   ocean half-extent (WORLD_EXTENT * 1.7)  <  DOME_RADIUS  <  CAMERA_FAR
 *
 * with the stars just inside the dome so they are never the thing that pokes
 * through it. `WorldView` reads `CAMERA_FAR` for the camera, so the two cannot
 * drift apart.
 */
export const CAMERA_FAR = 3400;

/**
 * Half-width of the shadow box that follows the player.
 *
 * Big enough to hold a whole puzzle installation and the people standing around
 * it; small enough that 2048 texels across it is a real shadow rather than a
 * suggestion. Everything beyond it is simply unshadowed, which at this scale
 * nobody notices.
 */
const SHADOW_BOX = 70;
const DOME_RADIUS = WORLD_EXTENT * 2.4;
const STAR_RADIUS = WORLD_EXTENT * 2.1;

const KEYS = {
  night: { top: new Color(SKY.night.top), bottom: new Color(SKY.night.bottom), sun: new Color(SKY.night.sun), fog: new Color(SKY.night.fog) },
  dawn: { top: new Color(SKY.dawn.top), bottom: new Color(SKY.dawn.bottom), sun: new Color(SKY.dawn.sun), fog: new Color(SKY.dawn.fog) },
  day: { top: new Color(SKY.day.top), bottom: new Color(SKY.day.bottom), sun: new Color(SKY.day.sun), fog: new Color(SKY.day.fog) },
  dusk: { top: new Color(SKY.dusk.top), bottom: new Color(SKY.dusk.bottom), sun: new Color(SKY.dusk.sun), fog: new Color(SKY.dusk.fog) },
};

/**
 * Blend the four sky keys around the clock.
 *
 * Dawn and dusk are narrow — twenty minutes of in-game time each — because they
 * are the moments the group notices the light changing and starts asking who
 * has a torch, and stretching them out would blunt exactly that.
 */
function skyAt(fraction: number, out: { top: Color; bottom: Color; sun: Color; fog: Color }): void {
  const stops: { at: number; key: keyof typeof KEYS }[] = [
    { at: 0, key: 'night' },
    { at: 0.22, key: 'night' },
    { at: 0.28, key: 'dawn' },
    { at: 0.36, key: 'day' },
    { at: 0.72, key: 'day' },
    { at: 0.8, key: 'dusk' },
    { at: 0.88, key: 'night' },
    { at: 1, key: 'night' },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (fraction >= stops[i].at && fraction <= stops[i + 1].at) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper.at - lower.at || 1;
  const t = Math.min(1, Math.max(0, (fraction - lower.at) / span));

  out.top.copy(KEYS[lower.key].top).lerp(KEYS[upper.key].top, t);
  out.bottom.copy(KEYS[lower.key].bottom).lerp(KEYS[upper.key].bottom, t);
  out.sun.copy(KEYS[lower.key].sun).lerp(KEYS[upper.key].sun, t);
  out.fog.copy(KEYS[lower.key].fog).lerp(KEYS[upper.key].fog, t);
}

export function Sky({ quality }: { quality: QualityFlags }) {
  const { scene } = useThree();
  const dome = useRef<Mesh>(null);
  const sun = useRef<DirectionalLight>(null);
  const sunDisc = useRef<Mesh>(null);
  const stars = useRef<PointsMaterial>(null);

  const colors = useMemo(
    () => ({ top: new Color(), bottom: new Color(), sun: new Color(), fog: new Color() }),
    [],
  );

  const starField = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Upper hemisphere only; the lower half is under the island.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.94);
      const r = STAR_RADIUS;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, []);

  useFrame(() => {
    const fraction = currentDayFraction();
    skyAt(fraction, colors);
    const light = daylight(fraction);

    // The sun tracks the day fraction around a tilted arc; after dark the same
    // light becomes the moon — cold, dim, and enough to see a silhouette by.
    const angle = (fraction - 0.25) * Math.PI * 2;
    const height = Math.sin(angle);
    const sunX = Math.cos(angle) * 320;
    const sunY = height * 300;
    const sunZ = 140 + Math.cos(angle) * 60;

    if (sun.current) {
      sun.current.position.set(live.self.x + sunX, Math.max(40, sunY), live.self.z + sunZ);
      sun.current.target.position.set(live.self.x, 0, live.self.z);
      sun.current.target.updateMatrixWorld();
      sun.current.color.copy(colors.sun);
      sun.current.intensity = 0.35 + light * 1.9;
    }

    if (sunDisc.current) {
      sunDisc.current.position.set(live.self.x + sunX * 1.6, Math.max(-200, sunY * 1.6), live.self.z + sunZ * 1.6);
      const material = sunDisc.current.material as unknown as { color: Color };
      material.color.copy(colors.sun);
      sunDisc.current.visible = sunY > -60;
    }

    if (dome.current) {
      dome.current.position.set(live.self.x, 0, live.self.z);
      const material = dome.current.material as unknown as { color: Color };
      material.color.copy(colors.top);
    }

    if (stars.current) {
      stars.current.opacity = Math.max(0, 1 - light * 1.6);
    }

    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(colors.fog);
      // Night fog is closer AND darker: the horizon should stop being a horizon
      // once the sun is down, so navigating by silhouette genuinely stops working.
      fog.near = 60 + light * 90;
      fog.far = 340 + light * 620;
    }
    scene.background = colors.top;
  });

  return (
    <>
      <fog attach="fog" args={['#cfe3ee', 120, 900]} />
      <hemisphereLight args={['#bcd7ef', '#5c5442', 0.55]} />
      <directionalLight
        ref={sun}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-camera-near={1}
        shadow-camera-far={620}
        shadow-camera-left={-SHADOW_BOX}
        shadow-camera-right={SHADOW_BOX}
        shadow-camera-top={SHADOW_BOX}
        shadow-camera-bottom={-SHADOW_BOX}
        shadow-bias={-0.0007}
      />

      <mesh ref={dome} scale={[-1, 1, 1]}>
        <sphereGeometry args={[DOME_RADIUS, 24, 16]} />
        <meshBasicMaterial side={BackSide} fog={false} depthWrite={false} />
      </mesh>

      <mesh ref={sunDisc}>
        <sphereGeometry args={[26, 16, 12]} />
        <meshBasicMaterial fog={false} toneMapped={false} />
      </mesh>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starField, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={stars}
          size={2.4}
          sizeAttenuation={false}
          color="#dfe8ff"
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
        />
      </points>
    </>
  );
}
