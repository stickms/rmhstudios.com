'use client';

/**
 * One soft body → one mesh.
 *
 * The mesh is the garment's **sewn shell**, not the solver's lattice: a front
 * sheet, a back sheet and a rim stitching them together, inflated every frame
 * off the simulated mid-surface by `writeShell`. That is where the fabric's
 * volume comes from. Rendering the lattice directly — which is what this used
 * to do — gave a shirt exactly zero thickness, and a garment that turns
 * edge-on to the camera and vanishes to a line reads as a sheet of paper no
 * matter how good the cloth simulation behind it is.
 *
 * The topology is built once per garment kind (indices and UVs never change)
 * and only the position and normal attributes are re-uploaded per frame.
 * Normals are recomputed each frame too — cloth that lights as if it were flat
 * is the other big tell that a "3D" cloth sim is faked, and with a shell it is
 * the rim that has to catch the light for the volume to read.
 *
 * Because the shell is closed, the material can draw `FrontSide`, which the
 * flat sheet could not — a sheet lit from one side only looks like a cut-out
 * the moment it turns over. That is what keeps the change close to free: a
 * shirt goes from 56 triangles to 172, but back-face culling discards about
 * half of those before shading, so what actually reaches the rasteriser is
 * roughly what the double-sided sheet cost. A full arena of laundry is under
 * 2,000 triangles either way.
 *
 * Nothing here calls `setState`: the whole component re-renders only when the
 * garment is added or removed. Per-frame work happens inside `useFrame` and
 * touches three.js objects directly.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WASH_COLORS } from '@/lib/laundry-sort/constants';
import { writeShell } from '@/lib/laundry-sort/shell';
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
  /** Highlighted while the player is holding it — one of possibly several. */
  heldRef: { current: ReadonlySet<number> | null };
}

export function GarmentCloth({ garment, quality, timeRef, heldRef }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>(null);
  const wash = WASH_COLORS[garment.colorIndex] ?? WASH_COLORS[0];

  const geometry = useMemo(() => {
    const { shell } = garment.topology;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(shell.vertexCount * 3), 3),
    );
    geo.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(shell.vertexCount * 3), 3),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(shell.uvs), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(shell.indices), 1));
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
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const { topology } = garment;
    // Positions and normals in one pass, straight into the attribute buffers.
    // No allocation, which is why this can run on every garment every frame.
    writeShell(
      topology.shell,
      topology.indices,
      garment.pos,
      position.array as Float32Array,
      normal.array as Float32Array,
    );
    position.needsUpdate = true;
    normal.needsUpdate = true;

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
    const held = heldRef.current?.has(garment.id) ?? false;
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
    // its stripes and checks — surface detail on top of the shell's shape.
    bumpMap: texture ?? undefined,
    bumpScale: 0.35,
    // The shell is a closed solid: front sheet, back sheet, stitched rim. Back
    // faces are never visible, so drawing them is pure waste.
    side: THREE.FrontSide,
    roughness: 0.94,
    metalness: 0,
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
