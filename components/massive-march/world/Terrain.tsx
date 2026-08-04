/**
 * Massive March — the island mesh and the sea around it.
 *
 * The ground is built once from `groundY`, the same function the server uses to
 * decide where people are standing, so what you see and what the hub believes
 * are the same surface by construction rather than by agreement.
 *
 * Colour is per-vertex and derived from height and slope, not from a texture:
 * pale sand at the waterline, dry grass above it, scrub in the folds, and bare
 * granite anywhere too steep to hold soil. That is what makes the land read as
 * observed while everything built on it reads as painted — the contrast the
 * whole art direction is built on.
 *
 * Resolution follows the render tier. At `ultra` the grid is fine enough that
 * the dune line behind the beach is a shape rather than a suggestion; at `low`
 * it is coarse and the silhouette still reads, which is all that navigation
 * actually needs.
 */

'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, type Mesh } from 'three';
import type { RenderTier } from '@/lib/render/tier';
import { LAND } from '@/lib/massive-march/palette';
import { groundY, SEA_LEVEL, WORLD_EXTENT } from '@/lib/massive-march/world/terrain';

const SEGMENTS: Record<RenderTier, number> = {
  low: 120,
  medium: 168,
  high: 216,
  ultra: 272,
};

const SAND_DRY = new Color(LAND.sandDry);
const SAND_WET = new Color(LAND.sandWet);
const GRASS_DRY = new Color(LAND.grassDry);
const GRASS_LUSH = new Color(LAND.grassLush);
const SCRUB = new Color(LAND.scrub);
const GRANITE = new Color(LAND.granite);
const GRANITE_WARM = new Color(LAND.graniteWarm);

const scratch = new Color();

/**
 * Ground colour at a point.
 *
 * Height decides the band and slope overrides it — a cliff face is granite
 * whatever altitude it is at, which is what gives the headlands their grey
 * shoulders and keeps the ridge from looking like a green pudding.
 */
function shade(height: number, slope: number, jitter: number, out: Color): void {
  if (height < 1.2) {
    out.copy(SAND_WET).lerp(SAND_DRY, Math.min(1, height / 1.2));
  } else if (height < 5) {
    out.copy(SAND_DRY).lerp(GRASS_DRY, (height - 1.2) / 3.8);
  } else if (height < 26) {
    out.copy(GRASS_DRY).lerp(GRASS_LUSH, (height - 5) / 21);
  } else if (height < 44) {
    out.copy(GRASS_LUSH).lerp(SCRUB, (height - 26) / 18);
  } else {
    out.copy(SCRUB).lerp(GRANITE, Math.min(1, (height - 44) / 22));
  }

  if (slope > 0.55) {
    scratch.copy(GRANITE).lerp(GRANITE_WARM, jitter);
    out.lerp(scratch, Math.min(1, (slope - 0.55) / 0.6));
  }

  // A little per-vertex variation so large flat bands are not one dead colour.
  out.offsetHSL(0, 0, (jitter - 0.5) * 0.045);
}

export function Terrain({ tier }: { tier: RenderTier }) {
  const geometry = useMemo(() => buildTerrain(SEGMENTS[tier]), [tier]);
  return (
    <mesh geometry={geometry} receiveShadow position={[0, 0, 0]}>
      {/* Lambert, not standard: the land is matte and there is exactly one
          directional light. A PBR material buys specular highlights on grass,
          which is not a thing grass does. */}
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

function buildTerrain(segments: number): BufferGeometry {
  const size = WORLD_EXTENT * 2;
  const step = size / segments;
  const verts = segments + 1;

  const positions = new Float32Array(verts * verts * 3);
  const colors = new Float32Array(verts * verts * 3);
  const indices: number[] = [];
  const color = new Color();

  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const index = j * verts + i;
      const x = -WORLD_EXTENT + i * step;
      const z = -WORLD_EXTENT + j * step;
      const y = groundY(x, z);

      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      // Slope from neighbours at grid spacing rather than `slopeAt`'s fixed
      // metre: at this scale the grid step IS the feature size.
      const gx = (groundY(x + step, z) - groundY(x - step, z)) / (2 * step);
      const gz = (groundY(x, z + step) - groundY(x, z - step)) / (2 * step);
      // A cheap hash instead of Math.random, so the terrain is identical for
      // everybody — "the grey rock by the pale patch" has to mean something.
      const jitter = ((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 + 1) % 1;
      shade(y, Math.hypot(gx, gz), jitter, color);

      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * verts + i;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The sea.
 *
 * One plane, one gentle rise and fall. Not a simulation — you cannot swim, and
 * the surf's only job is to make the coastline read as an edge you should not
 * cross rather than a place the ground stops being drawn.
 */
export function Ocean() {
  const mesh = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    mesh.current.position.y = SEA_LEVEL + 0.12 + Math.sin(t * 0.35) * 0.09;
  });

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL + 0.12, 0]}>
      <planeGeometry args={[WORLD_EXTENT * 3.4, WORLD_EXTENT * 3.4, 1, 1]} />
      <meshStandardMaterial
        color={LAND.waterShallow}
        transparent
        opacity={0.86}
        roughness={0.16}
        metalness={0.05}
      />
    </mesh>
  );
}
