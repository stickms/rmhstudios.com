'use client';

/**
 * Isleworks — the island plate.
 *
 * Two instanced boxes per tile and nothing else: a **body** in the terrain's
 * side colour that drops below the waterline, and a thin **cap** in its top
 * colour. That two-tone split is what makes the board read as a solid moulded
 * plate rather than a flat grid — and it costs one extra draw call for the whole
 * island, versus per-face vertex colours which would cost a custom material.
 *
 * The cap is also the pointer surface. Its instance ids ARE tile indices (every
 * tile is drawn, water included), so a pick is an array lookup with no search.
 *
 * Scenery — the trees, boulders and tufts on unbuilt ground — is derived from
 * tile coordinates in `scatterFor`, so it is stable frame to frame and costs
 * nothing to store. Foliage sways; trunks and rocks do not, which is why they
 * are in different buckets.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { parcelBounds, parcelIndexFor, tileToWorld } from '@/lib/isleworks/grid';
import { MAT, TERRAIN_COLORS, TERRAIN_SIDE_COLORS } from '@/lib/isleworks/palette';
import { scatterFor } from '@/lib/isleworks/terrain';
import type { CityState, Tile } from '@/lib/isleworks/types';
import type { OverlayMode } from '@/lib/isleworks/store';

import { world } from './clock';
import { GEOMETRY, scratch } from './geometry';

/** Height of one elevation step, and how far the plate drops below its cap. */
const STEP = 0.16;
const PLATE_DEPTH = 1.1;
const CAP = 0.07;
export const WATER_LEVEL = -0.14;

export function tileTop(tile: Tile): number {
  return tile.terrainType === 'water' ? WATER_LEVEL : (tile.elevation - 1) * STEP;
}

/**
 * Should this tile be shaded as "not yours yet"?
 *
 * Land only. Dimming the sea as well made two thirds of the board navy on a new
 * island, which read as night rather than as unbought.
 */
function dims(tile: Tile): boolean {
  return !tile.unlocked && tile.terrainType !== 'water';
}

/* ── overlay ramps ─────────────────────────────────────────────────────────
 * Each overlay maps a tile to 0…1 and a colour ramp. Deliberately only five —
 * an overlay the player cannot name is an overlay they will not use.
 */
const OVERLAY_LOW = new THREE.Color('#2b3f63');
const OVERLAY_RAMP: Record<Exclude<OverlayMode, 'none'>, [string, string]> = {
  power: ['#3d4b63', '#ffd76b'],
  water: ['#3d4b63', '#6fc6f0'],
  pollution: ['#a8dfa4', '#c9603f'],
  'land-value': ['#5d6b86', '#6fd39a'],
  traffic: ['#8fd8c4', '#ef7370'],
};

function overlayValue(tile: Tile, mode: Exclude<OverlayMode, 'none'>): number {
  switch (mode) {
    case 'power':
      return tile.hasPower ? 1 : 0;
    case 'water':
      return tile.hasWater ? 1 : 0;
    case 'pollution':
      return Math.min(1, tile.pollution / 60);
    case 'land-value':
      return Math.min(1, tile.landValue / 90);
    case 'traffic':
      return Math.min(1, tile.traffic / 90);
  }
}

interface Scenery {
  bucket: 'trunk' | 'leaf' | 'spike' | 'rock';
  x: number;
  y: number;
  z: number;
  /** Diameter and height in world units — a trunk and its crown are not the
      same shape, and one shared `scale` made every tree a brown pillar. */
  dia: number;
  height: number;
  rotation: number;
  color: string;
}

function collectScenery(city: CityState): Scenery[] {
  const out: Scenery[] = [];
  for (const tile of city.tiles) {
    // Unbought land still gets its trees — it is the same island either way.
    const top = tileTop(tile);
    const [wx, wz] = tileToWorld(tile.x, tile.y, city.width, city.height);
    for (const item of scatterFor(tile, city.seed)) {
      const x = wx + item.ox;
      const z = wz + item.oz;
      const k = item.scale;
      if (item.kind === 'tree' || item.kind === 'pine') {
        out.push({
          bucket: 'trunk',
          x,
          y: top,
          z,
          dia: 0.055 * k,
          height: 0.16 * k,
          rotation: item.rotation,
          color: MAT.trunk,
        });
        out.push(
          item.kind === 'pine'
            ? {
                bucket: 'spike',
                x,
                y: top + 0.08 * k,
                z,
                dia: 0.26 * k,
                height: 0.38 * k,
                rotation: item.rotation,
                color: MAT.leafDeep,
              }
            : {
                bucket: 'leaf',
                x,
                y: top + 0.26 * k,
                z,
                dia: 0.3 * k,
                height: 0.28 * k,
                rotation: item.rotation,
                color: MAT.leafLight,
              },
        );
      } else if (item.kind === 'rock') {
        out.push({
          bucket: 'rock',
          x,
          y: top + 0.05 * k,
          z,
          dia: 0.2 * k,
          height: 0.16 * k,
          rotation: item.rotation,
          color: tile.terrainType === 'snow' ? '#e3ecf6' : '#b3b8c8',
        });
      } else if (item.kind === 'tuft') {
        out.push({
          bucket: 'spike',
          x,
          y: top,
          z,
          dia: 0.12 * k,
          height: 0.13 * k,
          rotation: item.rotation,
          color: tile.terrainType === 'sand' ? '#c9cf87' : MAT.leafDeep,
        });
      } else {
        out.push({
          bucket: 'rock',
          x,
          y: top + 0.05,
          z,
          dia: 0.09,
          height: 0.09,
          rotation: item.rotation,
          color: MAT.flowerPink,
        });
      }
    }
  }
  return out;
}

interface TerrainProps {
  city: CityState;
  overlay: OverlayMode;
  onHoverTile: (x: number, y: number) => void;
  onLeave: () => void;
}

export function Terrain({ city, overlay, onHoverTile, onLeave }: TerrainProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const count = city.tiles.length;

  /* Plate geometry — only changes when land is bought or terrain is edited. */
  useEffect(() => {
    const body = bodyRef.current;
    const cap = capRef.current;
    if (!body || !cap) return;

    city.tiles.forEach((tile, i) => {
      const [wx, wz] = tileToWorld(tile.x, tile.y, city.width, city.height);
      const top = tileTop(tile);

      // Land tiles keep a hairline gap so the grid reads; water is one surface
      // and a gap there just shows the ocean plane through as a checkerboard.
      const seam = tile.terrainType === 'water' ? 1 : 0.985;
      scratch.quaternion.identity();
      scratch.position.set(wx, top - PLATE_DEPTH, wz);
      scratch.scale.set(seam + 0.01, PLATE_DEPTH, seam + 0.01);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      body.setMatrixAt(i, scratch.matrix);

      scratch.position.set(wx, top - CAP, wz);
      scratch.scale.set(seam, CAP, seam);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      cap.setMatrixAt(i, scratch.matrix);

      scratch.color.set(TERRAIN_SIDE_COLORS[tile.terrainType]);
      if (dims(tile)) scratch.color.lerp(OVERLAY_LOW, 0.45);
      body.setColorAt(i, scratch.color);
    });

    body.instanceMatrix.needsUpdate = true;
    cap.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    body.computeBoundingSphere();
    cap.computeBoundingSphere();
  }, [city]);

  /* Cap colours — terrain, or the active overlay ramp. */
  useEffect(() => {
    const cap = capRef.current;
    if (!cap) return;
    const mode = overlay === 'none' ? null : overlay;
    const ramp = mode
      ? ([new THREE.Color(OVERLAY_RAMP[mode][0]), new THREE.Color(OVERLAY_RAMP[mode][1])] as const)
      : null;

    city.tiles.forEach((tile, i) => {
      if (!ramp || !mode || tile.terrainType === 'water') {
        scratch.color.set(TERRAIN_COLORS[tile.terrainType]);
      } else {
        scratch.color.copy(ramp[0]).lerp(ramp[1], overlayValue(tile, mode));
      }
      if (dims(tile)) scratch.color.lerp(OVERLAY_LOW, 0.4);
      cap.setColorAt(i, scratch.color);
    });
    if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
  }, [city, overlay]);

  /* ── scenery ─────────────────────────────────────────────────────────── */
  const scenery = useMemo(() => collectScenery(city), [city]);
  const buckets = useMemo(
    () => ({
      trunk: scenery.filter((s) => s.bucket === 'trunk'),
      leaf: scenery.filter((s) => s.bucket === 'leaf'),
      spike: scenery.filter((s) => s.bucket === 'spike'),
      rock: scenery.filter((s) => s.bucket === 'rock'),
    }),
    [scenery],
  );
  const sceneryRefs = useRef(new Map<string, THREE.InstancedMesh>());

  useEffect(() => {
    for (const [name, items] of Object.entries(buckets)) {
      const mesh = sceneryRefs.current.get(name);
      if (!mesh) continue;
      items.forEach((item, i) => {
        scratch.color.set(item.color);
        mesh.setColorAt(i, scratch.color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      writeScenery(mesh, items, 0);
      mesh.computeBoundingSphere();
    }
  }, [buckets]);

  useFrame(() => {
    // Only the leaves move. Everything else was written once, above.
    const mesh = sceneryRefs.current.get('leaf');
    if (mesh) writeScenery(mesh, buckets.leaf, world.time);
  });

  const sceneryGeometry: Record<string, THREE.BufferGeometry> = {
    trunk: GEOMETRY.cyl,
    leaf: GEOMETRY.facet,
    spike: GEOMETRY.cone,
    rock: GEOMETRY.facet,
  };

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[GEOMETRY.box, undefined, count]}
        receiveShadow
        frustumCulled={false}
        raycast={() => null}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={capRef}
        args={[GEOMETRY.box, undefined, count]}
        receiveShadow
        frustumCulled={false}
        onPointerMove={(event) => {
          const i = event.instanceId;
          if (i === undefined) return;
          event.stopPropagation();
          const tile = city.tiles[i];
          if (tile) onHoverTile(tile.x, tile.y);
        }}
        onPointerOut={onLeave}
      >
        <meshLambertMaterial />
      </instancedMesh>

      {Object.entries(buckets).map(([name, items]) =>
        items.length ? (
          <instancedMesh
            key={name}
            ref={(mesh) => {
              if (mesh) sceneryRefs.current.set(name, mesh);
              else sceneryRefs.current.delete(name);
            }}
            args={[sceneryGeometry[name], undefined, items.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
            raycast={() => null}
          >
            <meshLambertMaterial flatShading />
          </instancedMesh>
        ) : null,
      )}
    </group>
  );
}

function writeScenery(mesh: THREE.InstancedMesh, items: Scenery[], time: number): void {
  items.forEach((item, i) => {
    const sway = time === 0 ? 0 : Math.sin(time * 1.1 + item.x * 0.8 + item.z * 0.6) * 0.05;
    scratch.euler.set(sway, item.rotation, sway * 0.6);
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.position.set(item.x, item.y, item.z);
    scratch.scale.set(item.dia, item.height, item.dia);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(i, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * The land-for-sale overlay.
 *
 * Only drawn while the buy tool is armed, and only over parcels adjacent to what
 * the player already owns — showing every unowned parcel would make the island
 * look like a spreadsheet and hide the one decision on offer.
 */
export function ParcelOverlay({
  city,
  parcels,
  hover,
}: {
  city: CityState;
  parcels: number[];
  hover: { x: number; y: number } | null;
}) {
  const hoveredParcel = hover ? parcelIndexFor(hover.x, hover.y, city.width) : -1;
  return (
    <group>
      {parcels.map((parcel) => {
        const { x0, y0, x1, y1 } = parcelBounds(parcel, city.width, city.height);
        const [wx, wz] = tileToWorld(x0, y0, city.width, city.height);
        const w = x1 - x0 + 1;
        const d = y1 - y0 + 1;
        const active = parcel === hoveredParcel;
        return (
          <mesh
            key={parcel}
            position={[wx + (w - 1) / 2, 0.09, wz + (d - 1) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[w - 0.1, d - 0.1]} />
            <meshBasicMaterial
              color={active ? '#ffe9a8' : '#8fd8c4'}
              transparent
              opacity={active ? 0.55 : 0.32}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
