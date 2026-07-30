'use client';

/**
 * One soft body → one mesh.
 *
 * The geometry is built once from the garment's fixed topology (indices and
 * UVs never change) and its position attribute is re-uploaded every frame from
 * the solver's particle array. Normals are recomputed each frame too — cloth
 * that lights as if it were flat is the single biggest tell that a "3D" cloth
 * sim is faked.
 *
 * Nothing here calls `setState`: the whole component re-renders only when the
 * garment is added or removed. Per-frame work happens inside `useFrame` and
 * touches three.js objects directly.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WASH_COLORS } from '@/lib/laundry-sort/constants';
import type { Garment } from '@/lib/laundry-sort/solver';
import type { QualityFlags } from '@/lib/render/tier';
import { weaveTexture } from '../weave';

/** Seconds a resolved garment takes to fade out — matches `CULL_DELAY`. */
const FADE = 0.9;

interface Props {
  garment: Garment;
  quality: QualityFlags;
  /** Simulated seconds, read from the world so the fade uses the same clock. */
  timeRef: { current: number };
  /** Highlighted while the player is holding it. */
  heldRef: { current: number | null };
}

export function GarmentCloth({ garment, quality, timeRef, heldRef }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>(null);
  const wash = WASH_COLORS[garment.colorIndex] ?? WASH_COLORS[0];

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(garment.pos.length), 3),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(garment.topology.uvs), 2));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(garment.pos.length), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(garment.topology.indices), 1));
    return geo;
  }, [garment]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const texture = useMemo(() => weaveTexture(wash.weave), [wash.weave]);
  const baseColor = useMemo(() => new THREE.Color(wash.hex), [wash.hex]);

  useFrame(() => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    (position.array as Float32Array).set(garment.pos);
    position.needsUpdate = true;
    // Per-frame normals are what make a fold catch the light. Cheap here: a
    // garment is a few dozen vertices, not a character mesh.
    geometry.computeVertexNormals();

    // Resolved garments fade rather than vanish, so the player sees where the
    // points came from.
    if (garment.expiresAt !== null) {
      const left = Math.max(0, garment.expiresAt - timeRef.current);
      material.opacity = Math.min(1, left / FADE);
      material.transparent = true;
    } else if (material.opacity !== 1) {
      material.opacity = 1;
      material.transparent = false;
    }

    // Held cloth lifts toward white so it stays readable under a fast drag; a
    // sorted one glows green on its way out and a missed one goes flat.
    const held = heldRef.current === garment.id;
    const emissive = material.emissive;
    if (held) {
      emissive.setRGB(0.16, 0.16, 0.18);
    } else if (garment.state === 'sorted') {
      emissive.setRGB(0.05, 0.14, 0.06);
    } else if (garment.state === 'missed') {
      emissive.setRGB(0.02, 0.02, 0.02);
    } else {
      emissive.setRGB(0, 0, 0);
    }
  });

  const common = {
    color: baseColor,
    map: texture ?? undefined,
    // The weave doubles as a bump map, so the fabric catches the light along
    // its stripes and checks. It is what stops a garment reading as a flat
    // coloured decal once it turns toward the camera.
    bumpMap: texture ?? undefined,
    bumpScale: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
    // Cloth is not paper: lighting it from one side only makes a falling
    // garment look like a cut-out whenever it turns edge-on.
    flatShading: false,
  } as const;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      castShadow={quality.shadows}
      receiveShadow={quality.shadows}
      // Always in frame, and we do our own picking, so culling and the
      // bounding-sphere recompute it needs are pure overhead.
      frustumCulled={false}
    >
      {quality.postProcessing ? (
        <meshPhysicalMaterial
          ref={materialRef as React.Ref<THREE.MeshPhysicalMaterial>}
          {...common}
          sheen={0.65}
          sheenRoughness={0.85}
          sheenColor={baseColor}
        />
      ) : (
        <meshStandardMaterial
          ref={materialRef as React.Ref<THREE.MeshStandardMaterial>}
          {...common}
        />
      )}
    </mesh>
  );
}
