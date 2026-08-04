/**
 * Massive March — everything that grew here.
 *
 * Five thousand gum trees, banksia bushes, granite boulders and grass tussocks,
 * drawn as four instanced meshes and a fifth for the trunks. The positions come
 * from `growScatter`, which is seeded — so this is not "some trees", it is *the*
 * trees, the same ones in everybody's session, which is what lets somebody say
 * "the dead one with the fork" and be understood.
 *
 * Density scales with the render tier. Thinning the scrub on a weak device
 * changes how far you can see through it, which is a real gameplay difference —
 * so the tussocks and banksia thin first and the gums, which are the things you
 * navigate by, thin last.
 */

'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { QualityFlags } from '@/lib/render/tier';
import { LAND } from '@/lib/massive-march/palette';
import { growScatter, type ScatterItem, type ScatterKind } from '@/lib/massive-march/world/regions';

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const axis = new Vector3(0, 1, 0);
const color = new Color();

/**
 * How aggressively each kind thins at reduced density.
 *
 * Gums are landmarks, so they survive longest; tussocks are texture and go
 * first. `1` means "never thinned", `0.4` means the density multiplier bites
 * hardest here.
 */
const RESILIENCE: Record<ScatterKind, number> = {
  gum: 1,
  boulder: 0.85,
  banksia: 0.55,
  tussock: 0.35,
};

function useScatter(densityScale: number): Record<ScatterKind, ScatterItem[]> {
  return useMemo(() => {
    const all = growScatter();
    const buckets: Record<ScatterKind, ScatterItem[]> = {
      gum: [],
      banksia: [],
      boulder: [],
      tussock: [],
    };
    for (const item of all) {
      const keep = 1 - (1 - Math.min(1, densityScale)) * (1 - RESILIENCE[item.kind] + 0.55);
      // Deterministic decimation — a hash of the position, not a coin flip, so
      // two players at the same tier see the same thinned forest.
      const hash = ((Math.sin(item.x * 12.9898 + item.z * 78.233) * 43758.5453) % 1 + 1) % 1;
      if (hash > Math.min(1, Math.max(0.12, keep))) continue;
      buckets[item.kind].push(item);
    }
    return buckets;
  }, [densityScale]);
}

function fill(
  mesh: InstancedMesh | null,
  items: ScatterItem[],
  place: (item: ScatterItem) => void,
): void {
  if (!mesh) return;
  for (let i = 0; i < items.length; i++) {
    place(items[i]);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.set(items[i].tint));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function Scatter({ quality }: { quality: QualityFlags }) {
  const buckets = useScatter(quality.densityScale);
  const trunks = useRef<InstancedMesh>(null);
  const canopies = useRef<InstancedMesh>(null);
  const banksia = useRef<InstancedMesh>(null);
  const boulders = useRef<InstancedMesh>(null);
  const tussocks = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const gums = buckets.gum;

    fill(trunks.current, gums, (item) => {
      const height = 7 * item.scale;
      position.set(item.x, item.y + height / 2, item.z);
      quaternion.setFromAxisAngle(axis, item.rot);
      scale.set(item.scale, item.scale, item.scale);
    });

    fill(canopies.current, gums, (item) => {
      const height = 7 * item.scale;
      position.set(item.x, item.y + height * 0.94, item.z);
      quaternion.setFromAxisAngle(axis, item.rot * 1.7);
      // Squashed and slightly irregular per instance: a gum canopy is a wide
      // sparse thing, not a lollipop.
      scale.set(item.scale * 1.25, item.scale * 0.78, item.scale * 1.12);
    });

    fill(banksia.current, buckets.banksia, (item) => {
      position.set(item.x, item.y + 0.55 * item.scale, item.z);
      quaternion.setFromAxisAngle(axis, item.rot);
      scale.set(item.scale, item.scale * 0.82, item.scale);
    });

    fill(boulders.current, buckets.boulder, (item) => {
      position.set(item.x, item.y + 0.5 * item.scale, item.z);
      quaternion.setFromAxisAngle(axis, item.rot);
      scale.set(item.scale * 1.3, item.scale * 0.85, item.scale * 1.1);
    });

    fill(tussocks.current, buckets.tussock, (item) => {
      position.set(item.x, item.y + 0.28 * item.scale, item.z);
      quaternion.setFromAxisAngle(axis, item.rot);
      scale.set(item.scale, item.scale, item.scale);
    });
  }, [buckets]);

  return (
    <>
      {/* Trunks: pale, smooth, unmistakably gum. */}
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, Math.max(1, buckets.gum.length)]}
        castShadow={quality.shadows}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.16, 0.3, 7, 5]} />
        <meshLambertMaterial color={LAND.gumBark} />
      </instancedMesh>

      <instancedMesh
        ref={canopies}
        args={[undefined, undefined, Math.max(1, buckets.gum.length)]}
        castShadow={quality.shadows}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[2.6, 0]} />
        <meshLambertMaterial vertexColors={false} />
      </instancedMesh>

      <instancedMesh
        ref={banksia}
        args={[undefined, undefined, Math.max(1, buckets.banksia.length)]}
        castShadow={quality.shadows}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1.05, 0]} />
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={boulders}
        args={[undefined, undefined, Math.max(1, buckets.boulder.length)]}
        castShadow={quality.shadows}
        receiveShadow
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[1.6, 0]} />
        <meshLambertMaterial flatShading />
      </instancedMesh>

      <instancedMesh
        ref={tussocks}
        args={[undefined, undefined, Math.max(1, buckets.tussock.length)]}
        frustumCulled={false}
      >
        <coneGeometry args={[0.42, 0.72, 4]} />
        <meshLambertMaterial />
      </instancedMesh>
    </>
  );
}
