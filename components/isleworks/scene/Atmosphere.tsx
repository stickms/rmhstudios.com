'use client';

/**
 * Isleworks — light, sky, sea and clouds.
 *
 * Everything here is driven by one number: `world.daylight`. The sun's colour
 * and angle, the ambient fill, the fog, the backdrop and the sea all read it in
 * `useFrame`, so a month passing looks like a day passing without a single React
 * render.
 *
 * ## Shadows
 *
 * One directional light with a tight orthographic shadow camera sized to the
 * island. Tight is the whole trick: a shadow camera scaled to "whatever might be
 * on screen" spreads the same 2048 texels over ten times the area and turns the
 * soft diorama shadows into stair-steps.
 *
 * ## Clouds
 *
 * Chunky low-poly clumps of faceted spheres, drifting on the wind and wrapping
 * round. They cast shadows — a moving shadow crossing the city is most of what
 * makes a still diorama feel alive — but they fly high enough, and thin enough,
 * that nothing important is hidden for more than a few seconds.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { SKY } from '@/lib/isleworks/palette';
import { makeRng } from '@/lib/isleworks/terrain';

import { world } from './clock';
import { GEOMETRY, scratch } from './geometry';
import { WATER_LEVEL } from './Terrain';

const DAY = new THREE.Color(SKY.day);
const DUSK = new THREE.Color(SKY.dusk);
const NIGHT = new THREE.Color(SKY.night);
const SUN_DAY = new THREE.Color(SKY.sun);
const SUN_NIGHT = new THREE.Color(SKY.moon);

/** Blend day → dusk → night on a single 1…0 daylight value. */
function skyColor(target: THREE.Color, daylight: number): THREE.Color {
  if (daylight > 0.5) return target.copy(DUSK).lerp(DAY, (daylight - 0.5) * 2);
  return target.copy(NIGHT).lerp(DUSK, daylight * 2);
}

interface AtmosphereProps {
  /** Half-extent of the island, in tiles — sizes the sea and the shadow camera. */
  radius: number;
  shadows: boolean;
  shadowMapSize: number;
  reducedMotion: boolean;
}

export function Atmosphere({ radius, shadows, shadowMapSize, reducedMotion }: AtmosphereProps) {
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const seaRef = useRef<THREE.Mesh>(null);

  const fog = useMemo(() => new THREE.Fog(SKY.day, radius * 2.6, radius * 6.5), [radius]);
  const background = useMemo(() => new THREE.Color(SKY.day), []);

  useFrame(() => {
    const daylight = world.daylight;

    skyColor(background, daylight);
    scene.background = background;
    fog.color.copy(background);
    scene.fog = fog;

    const sun = sunRef.current;
    if (sun) {
      sun.intensity = 0.35 + daylight * 1.35;
      sun.color.copy(SUN_NIGHT).lerp(SUN_DAY, daylight);
      // The sun swings across as the day goes; at night it is the moon, low and
      // on the other side, which keeps a night city readable rather than black.
      const angle = Math.PI * 0.25 + (1 - daylight) * Math.PI * 0.5;
      sun.position.set(
        Math.cos(angle) * radius * 1.8,
        radius * (0.9 + daylight * 0.7),
        Math.sin(angle) * radius * 1.4,
      );
    }
    if (ambientRef.current) ambientRef.current.intensity = 0.55 + daylight * 0.45;
    if (hemiRef.current) hemiRef.current.intensity = 0.3 + daylight * 0.35;

    const sea = seaRef.current;
    if (sea && !reducedMotion) {
      sea.position.y = WATER_LEVEL - 0.06 + Math.sin(world.time * 0.6) * 0.012;
    }
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={1} color="#eef6ff" />
      <hemisphereLight ref={hemiRef} color="#dff1ff" groundColor="#89b98f" intensity={0.5} />
      <directionalLight
        ref={sunRef}
        castShadow={shadows}
        intensity={1.4}
        position={[radius * 1.4, radius * 1.6, radius]}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={radius * 6}
        shadow-camera-left={-radius * 1.35}
        shadow-camera-right={radius * 1.35}
        shadow-camera-top={radius * 1.35}
        shadow-camera-bottom={-radius * 1.35}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      />

      {/* The sea. A single plane — the island's own water tiles do the detail. */}
      <mesh
        ref={seaRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, WATER_LEVEL - 0.06, 0]}
        receiveShadow={shadows}
        raycast={() => null}
      >
        <planeGeometry args={[radius * 12, radius * 12]} />
        <meshLambertMaterial color={SKY.ocean} transparent opacity={0.92} />
      </mesh>

      {/* The deep, so the island reads as floating rather than as a cut-out. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]} raycast={() => null}>
        <planeGeometry args={[radius * 14, radius * 14]} />
        <meshBasicMaterial color={SKY.oceanDeep} />
      </mesh>

      <Clouds radius={radius} shadows={shadows} reducedMotion={reducedMotion} />
    </group>
  );
}

interface Puff {
  cloud: number;
  ox: number;
  oy: number;
  oz: number;
  scale: number;
}

const CLOUD_COUNT = 11;

function Clouds({
  radius,
  shadows,
  reducedMotion,
}: {
  radius: number;
  shadows: boolean;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  const { puffs, origins } = useMemo(() => {
    const rng = makeRng(1337);
    const puffs: Puff[] = [];
    const origins: { x: number; y: number; z: number; speed: number }[] = [];
    for (let c = 0; c < CLOUD_COUNT; c++) {
      // High and spread wide. Earlier they sat at half the island's radius,
      // which on an orthographic camera puts them visually *in front of* the
      // city rather than above it — the diorama disappeared behind the weather.
      origins.push({
        x: (rng() - 0.5) * radius * 5,
        y: radius * 1.05 + rng() * radius * 0.65,
        z: (rng() - 0.5) * radius * 4,
        speed: 0.14 + rng() * 0.2,
      });
      const lumps = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < lumps; i++) {
        puffs.push({
          cloud: c,
          ox: (rng() - 0.5) * 2.2,
          oy: (rng() - 0.5) * 0.4,
          oz: (rng() - 0.5) * 1.3,
          scale: 0.55 + rng() * 0.6,
        });
      }
    }
    return { puffs, origins };
  }, [radius]);

  const span = radius * 5;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const drift = reducedMotion ? 0 : world.time;
    puffs.forEach((puff, i) => {
      const origin = origins[puff.cloud];
      // Wrap in X so the sky never runs out of clouds.
      let x = origin.x + drift * origin.speed + puff.ox;
      x = ((((x + span / 2) % span) + span) % span) - span / 2;
      scratch.position.set(x, origin.y + puff.oy, origin.z + puff.oz);
      scratch.euler.set(puff.ox, puff.oz, puff.oy);
      scratch.quaternion.setFromEuler(scratch.euler);
      const s = puff.scale;
      scratch.scale.set(s * 1.5, s * 0.95, s * 1.2);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    // Clouds pick up the sky's tint so a storm-dark sky darkens them too.
    const material = mesh.material as THREE.MeshLambertMaterial;
    material.color.setRGB(1, 1, 1).lerp(NIGHT, (1 - world.daylight) * 0.55);

    // Fade them out as the camera comes down to street level. An orthographic
    // camera gives a cloud at 15 units up exactly the same on-screen size as the
    // house beneath it, so zoomed in they stop reading as weather and start
    // reading as a white sheet over the game.
    const zoom = (camera as THREE.OrthographicCamera).zoom ?? 46;
    material.opacity = THREE.MathUtils.clamp((78 - zoom) / 22, 0, 1);
    mesh.visible = material.opacity > 0.03;
    // A cloud you cannot see should not still be dimming the street below it.
    mesh.castShadow = shadows && material.opacity > 0.55;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[GEOMETRY.facet, undefined, puffs.length]}
      castShadow={shadows}
      frustumCulled={false}
      raycast={() => null}
    >
      <meshLambertMaterial color="#ffffff" flatShading transparent depthWrite={false} />
    </instancedMesh>
  );
}
