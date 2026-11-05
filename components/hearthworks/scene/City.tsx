'use client';

/**
 * The city layer as the scene draws it: roads and zone pads as two blended ground meshes that follow the block
 * heights, the lots, utilities and town green as instanced models, a signpost over any lot short of power or water,
 * and the ghost of a road or zone stroke while it is being dragged. Everything is read from `world.city`; nothing
 * here owns game state.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  PALETTE,
  PROCEDURAL_MODELS,
  buildRoadMesh,
  buildZoneMesh,
  type CityMeshData,
  type LotLevel,
} from '@/lib/hearthworks/art';
import { brushRect, roadTiles, type Tile } from '@/lib/hearthworks/city-input';
import type { Tool } from '@/lib/hearthworks/store';
import {
  FLAG_POWERED,
  FLAG_WATERED,
  cellLevel,
  cellRoad,
  cellUtility,
  cellZone,
  cityHub,
  roadAt,
  tileTop,
  type World,
} from '@/lib/hearthworks/world';
import { InstancedModels, type ModelInstance } from './InstancedModels';

function toGeometry(data: CityMeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Turn a lot or utility to face the road beside it (its front is +z). */
const FACINGS: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [1, 0, Math.PI / 2],
  [-1, 0, -Math.PI / 2],
  [0, -1, Math.PI],
];
function facing(world: World, x: number, z: number): number {
  for (const [dx, dz, rot] of FACINGS) if (roadAt(world, x + dx, z + dz)) return rot;
  return 0;
}

function cityInstances(world: World, markers: boolean): ModelInstance[] {
  const out: ModelInstance[] = [];
  const n = world.size;
  const c = world.city;
  const hub = cityHub(n);
  let hubFree = true;
  for (let i = 0; i < c.cells.length; i++) {
    const cell = c.cells[i];
    const x = i % n;
    const z = (i - x) / n;
    const level = cellLevel(cell);
    const zone = cellZone(cell);
    const util = cellUtility(cell);
    if (zone && level > 0) {
      const y = tileTop(world, x, z);
      out.push({
        spec: PROCEDURAL_MODELS[`lot:${zone}:${level as LotLevel}`],
        x,
        z,
        y,
        rotY: facing(world, x, z),
      });
      const f = c.flags[i];
      if (markers && ((f & FLAG_POWERED) === 0 || (f & FLAG_WATERED) === 0)) {
        out.push({ spec: PROCEDURAL_MODELS['marker:unserved'], x, z, y });
      }
      if (x === hub.x && z === hub.z) hubFree = false;
    } else if (util) {
      out.push({
        spec: PROCEDURAL_MODELS[`utility:${util}`],
        x,
        z,
        y: tileTop(world, x, z),
        rotY: facing(world, x, z),
      });
      if (x === hub.x && z === hub.z) hubFree = false;
    }
  }
  if (world.buildings.some((b) => b.x === hub.x && b.z === hub.z)) hubFree = false;
  if (hubFree)
    out.push({
      spec: PROCEDURAL_MODELS['city:green'],
      x: hub.x,
      z: hub.z,
      y: tileTop(world, hub.x, hub.z) + (cellRoad(c.cells[hub.z * n + hub.x]) ? 0.04 : 0),
    });
  return out;
}

/**
 * Roads, zone pads, lots and utilities. `rev` is the store's signal that the (mutated-in-place) world changed;
 * `markers` shows the short-of-power-or-water signposts (a planning aid, so only in the plan view).
 */
export function CityLayer({
  world,
  rev,
  markers,
}: {
  world: World;
  rev: number;
  markers: boolean;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roads = useMemo(() => toGeometry(buildRoadMesh(world)), [world, rev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zones = useMemo(() => toGeometry(buildZoneMesh(world)), [world, rev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const instances = useMemo(() => cityInstances(world, markers), [world, rev, markers]);
  useEffect(() => () => roads.dispose(), [roads]);
  useEffect(() => () => zones.dispose(), [zones]);
  return (
    <>
      {/* Ground cover never takes a click: the terrain beneath it answers for the tile. */}
      <mesh geometry={zones} raycast={() => null} renderOrder={1}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      </mesh>
      <mesh geometry={roads} raycast={() => null} renderOrder={1}>
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      <InstancedModels instances={instances} />
    </>
  );
}

/** Is a tile one the armed tool can act on? Only for colouring the preview — the sim has the final word. */
function previewOk(world: World, tool: Tool, x: number, z: number): boolean {
  const i = z * world.size + x;
  if (x < 0 || z < 0 || x >= world.size || z >= world.size) return false;
  if (world.buildings.some((b) => b.x === x && b.z === z)) return false;
  const cell = world.city.cells[i];
  if (cellLevel(cell) > 0 || cellUtility(cell)) return false;
  const t = world.terrain[i];
  if (tool.kind === 'road') return t === 'grass' || t === 'sand';
  if (tool.kind === 'zone') return t === 'grass' && !cellRoad(cell) && cellZone(cell) !== tool.zone;
  return false;
}

/** The ghost of a drag: a flat tile on every tile the stroke would touch, deep teal where it would work and blush where not. */
export function StrokePreview({
  world,
  tool,
  from,
  to,
}: {
  world: World;
  tool: Tool;
  from: Tile;
  to: Tile;
}) {
  const tiles = useMemo(() => {
    if (tool.kind === 'road') return roadTiles(from, to);
    const r = brushRect(from, to);
    const out: Tile[] = [];
    for (let z = Math.min(r.z, r.z2); z <= Math.max(r.z, r.z2); z++)
      for (let x = Math.min(r.x, r.x2); x <= Math.max(r.x, r.x2); x++) out.push({ x, z });
    return out;
  }, [tool, from, to]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const ok = useMemo(() => new THREE.Color(PALETTE.deepTeal), []);
  const bad = useMemo(() => new THREE.Color(PALETTE.blush), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    tiles.forEach((t, i) => {
      const inside = t.x >= 0 && t.z >= 0 && t.x < world.size && t.z < world.size;
      m.makeTranslation(t.x, inside ? tileTop(world, t.x, t.z) + 0.05 : 0, t.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, inside && previewOk(world, tool, t.x, t.z) ? ok : bad);
    });
    mesh.count = tiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tiles, world, tool, ok, bad]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return (
    <instancedMesh
      ref={ref}
      // A new capacity needs a new buffer.
      key={tiles.length}
      args={[geometry, material, tiles.length]}
      frustumCulled={false}
      renderOrder={3}
      raycast={() => null}
    />
  );
}
