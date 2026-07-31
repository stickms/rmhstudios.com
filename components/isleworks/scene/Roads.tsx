'use client';

/**
 * Isleworks — roads, and the traffic that runs on them.
 *
 * Roads are the one building whose appearance depends on its neighbours, so they
 * are drawn here rather than from `models.ts`: a slab per tile, then centre-line
 * dashes toward each side the tile actually connects on. That single rule
 * produces every junction shape — straight, corner, T, crossroads — with no
 * tile-set and no bitmask table.
 *
 * ## Agents
 *
 * Citizens and cars are random walkers on the road graph. They do not have
 * errands, and deliberately so: a pathfinding crowd costs a graph search per
 * agent per arrival and looks, from this camera, exactly like a random walk. The
 * population sets the crowd size, which is the only part a player can read.
 *
 * Cars keep to one side of the centre line, which is what makes two of them
 * passing look like traffic rather than like two dots overlapping.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { DIRECTIONS, inBounds, index, tileToWorld } from '@/lib/isleworks/grid';
import { CITIZEN_COLORS, MAT, VEHICLE_COLORS } from '@/lib/isleworks/palette';
import { makeRng } from '@/lib/isleworks/terrain';
import type { CityState } from '@/lib/isleworks/types';

import { world } from './clock';
import { GEOMETRY, scratch } from './geometry';
import { tileTop } from './Terrain';

const ROAD_Y = 0.035;

interface RoadTile {
  tileIndex: number;
  wx: number;
  wz: number;
  top: number;
  connections: number[];
}

/** Every road tile plus its connected neighbours, as indices into the list. */
function roadNetwork(city: CityState): { roads: RoadTile[]; byTile: Map<number, number> } {
  const roads: RoadTile[] = [];
  const byTile = new Map<number, number>();

  // One pass to learn which instance ids are roads — the alternative, asking the
  // building list per tile, is a linear search inside a 576-iteration loop.
  const roadInstances = new Set(
    city.buildings.filter((b) => b.definitionId === 'road').map((b) => b.instanceId),
  );

  for (const tile of city.tiles) {
    if (!tile.buildingId || !roadInstances.has(tile.buildingId)) continue;
    const i = index(tile.x, tile.y, city.width);
    byTile.set(i, roads.length);
    const [wx, wz] = tileToWorld(tile.x, tile.y, city.width, city.height);
    roads.push({ tileIndex: i, wx, wz, top: tileTop(tile), connections: [] });
  }

  for (const road of roads) {
    const tile = city.tiles[road.tileIndex];
    for (const { dx, dy } of DIRECTIONS) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (!inBounds(nx, ny, city.width, city.height)) continue;
      const neighbour = byTile.get(index(nx, ny, city.width));
      if (neighbour !== undefined) road.connections.push(neighbour);
    }
  }

  return { roads, byTile };
}

/* ── agents ───────────────────────────────────────────────────────────────── */

interface Agent {
  from: number;
  to: number;
  /** 0…1 along the current edge. */
  t: number;
  speed: number;
  /** Lateral offset from the centre line, in tiles. */
  lane: number;
  color: string;
  bob: number;
}

function spawnAgents(
  roads: RoadTile[],
  count: number,
  seed: number,
  colors: readonly string[],
  speed: [number, number],
  laneWidth: number,
): Agent[] {
  if (roads.length < 2) return [];
  const rng = makeRng(seed);
  const agents: Agent[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(rng() * roads.length);
    const options = roads[from].connections;
    if (!options.length) continue;
    agents.push({
      from,
      to: options[Math.floor(rng() * options.length)],
      t: rng(),
      speed: speed[0] + rng() * (speed[1] - speed[0]),
      lane: laneWidth === 0 ? (rng() - 0.5) * 0.34 : laneWidth,
      color: colors[Math.floor(rng() * colors.length)],
      bob: rng() * Math.PI * 2,
    });
  }
  return agents;
}

function stepAgents(agents: Agent[], roads: RoadTile[], delta: number, rng: () => number): void {
  for (const agent of agents) {
    agent.t += delta * agent.speed;
    while (agent.t >= 1) {
      agent.t -= 1;
      const next = roads[agent.to];
      if (!next || !next.connections.length) {
        agent.t = 0;
        break;
      }
      // Prefer not to double back, so a walker actually goes somewhere.
      const onward = next.connections.filter((c) => c !== agent.from);
      const choices = onward.length ? onward : next.connections;
      agent.from = agent.to;
      agent.to = choices[Math.floor(rng() * choices.length)];
    }
  }
}

interface RoadsProps {
  city: CityState;
  /** Drives crowd size. */
  population: number;
  reducedMotion: boolean;
}

export function Roads({ city, population, reducedMotion }: RoadsProps) {
  const { roads } = useMemo(() => roadNetwork(city), [city]);

  const slabRef = useRef<THREE.InstancedMesh>(null);
  const markRef = useRef<THREE.InstancedMesh>(null);
  const walkerRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const carRef = useRef<THREE.InstancedMesh>(null);

  /** Centre-line dashes: two per connected side. */
  const marks = useMemo(() => {
    const out: { x: number; z: number; y: number; rot: number }[] = [];
    for (const road of roads) {
      const tile = city.tiles[road.tileIndex];
      for (const dir of tile.roadConnections) {
        const [dx, dz] =
          dir === 'n' ? [0, -1] : dir === 's' ? [0, 1] : dir === 'e' ? [1, 0] : [-1, 0];
        out.push({
          x: road.wx + dx * 0.3,
          z: road.wz + dz * 0.3,
          y: road.top + ROAD_Y,
          rot: dx === 0 ? 0 : Math.PI / 2,
        });
      }
    }
    return out;
  }, [roads, city]);

  useEffect(() => {
    const slab = slabRef.current;
    if (slab) {
      roads.forEach((road, i) => {
        scratch.quaternion.identity();
        scratch.position.set(road.wx, road.top, road.wz);
        scratch.scale.set(1.0, ROAD_Y, 1.0);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        slab.setMatrixAt(i, scratch.matrix);
      });
      slab.instanceMatrix.needsUpdate = true;
      slab.computeBoundingSphere();
    }
    const mark = markRef.current;
    if (mark) {
      marks.forEach((m, i) => {
        scratch.euler.set(0, m.rot, 0);
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.position.set(m.x, m.y, m.z);
        scratch.scale.set(0.07, 0.012, 0.3);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        mark.setMatrixAt(i, scratch.matrix);
      });
      mark.instanceMatrix.needsUpdate = true;
      mark.computeBoundingSphere();
    }
  }, [roads, marks]);

  /* Crowd size follows the city, capped so a large city stays cheap. */
  const walkerCount = Math.min(60, Math.max(4, Math.round(population / 8) + 4));
  const carCount = Math.min(28, Math.max(2, Math.round(population / 22) + 2));

  const walkers = useMemo(
    () => spawnAgents(roads, walkerCount, city.seed + 11, CITIZEN_COLORS, [0.18, 0.34], 0),
    [roads, walkerCount, city.seed],
  );
  const cars = useMemo(
    () => spawnAgents(roads, carCount, city.seed + 77, VEHICLE_COLORS, [0.55, 0.95], 0.17),
    [roads, carCount, city.seed],
  );

  useEffect(() => {
    for (const [mesh, agents] of [
      [walkerRef.current, walkers],
      [headRef.current, walkers],
      [carRef.current, cars],
    ] as const) {
      if (!mesh) continue;
      agents.forEach((agent, i) => {
        scratch.color.set(agent.color);
        mesh.setColorAt(i, scratch.color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [walkers, cars]);

  const rng = useRef(makeRng(city.seed + 5));

  useFrame((_, delta) => {
    if (!roads.length) return;
    const dt = reducedMotion ? 0 : Math.min(delta, 0.1);
    stepAgents(walkers, roads, dt, rng.current);
    stepAgents(cars, roads, dt, rng.current);

    writeAgents(walkerRef.current, headRef.current, walkers, roads, 'walker');
    writeAgents(carRef.current, null, cars, roads, 'car');
  });

  if (!roads.length) return null;

  return (
    <group>
      <instancedMesh
        ref={slabRef}
        args={[GEOMETRY.box, undefined, roads.length]}
        receiveShadow
        frustumCulled={false}
        raycast={() => null}
      >
        <meshLambertMaterial color={MAT.asphalt} />
      </instancedMesh>

      {marks.length > 0 && (
        <instancedMesh
          ref={markRef}
          args={[GEOMETRY.box, undefined, marks.length]}
          frustumCulled={false}
          raycast={() => null}
        >
          <meshLambertMaterial color={MAT.roadLine} />
        </instancedMesh>
      )}

      {walkers.length > 0 && (
        <>
          <instancedMesh
            ref={walkerRef}
            args={[GEOMETRY.cyl, undefined, walkers.length]}
            castShadow
            frustumCulled={false}
            raycast={() => null}
          >
            <meshLambertMaterial flatShading />
          </instancedMesh>
          <instancedMesh
            ref={headRef}
            args={[GEOMETRY.sphere, undefined, walkers.length]}
            castShadow
            frustumCulled={false}
            raycast={() => null}
          >
            <meshLambertMaterial flatShading />
          </instancedMesh>
        </>
      )}

      {cars.length > 0 && (
        <instancedMesh
          ref={carRef}
          args={[GEOMETRY.box, undefined, cars.length]}
          castShadow
          frustumCulled={false}
          raycast={() => null}
        >
          <meshLambertMaterial />
        </instancedMesh>
      )}
    </group>
  );
}

/**
 * Place agents along their current edge.
 *
 * `head` is optional: walkers get a second instanced mesh for the head so a
 * citizen reads as a person at this zoom rather than as a coloured pip.
 */
function writeAgents(
  body: THREE.InstancedMesh | null,
  head: THREE.InstancedMesh | null,
  agents: Agent[],
  roads: RoadTile[],
  kind: 'walker' | 'car',
): void {
  if (!body) return;
  agents.forEach((agent, i) => {
    const from = roads[agent.from];
    const to = roads[agent.to];
    if (!from || !to) return;
    const dx = to.wx - from.wx;
    const dz = to.wz - from.wz;
    const heading = Math.atan2(dx, dz);
    // Right-hand offset from the direction of travel.
    const ox = -dz * agent.lane;
    const oz = dx * agent.lane;
    const x = from.wx + dx * agent.t + ox;
    const z = from.wz + dz * agent.t + oz;
    const y = from.top + (to.top - from.top) * agent.t + ROAD_Y;

    if (kind === 'walker') {
      const bounce = Math.abs(Math.sin(world.time * 7 + agent.bob)) * 0.03;
      scratch.euler.set(0, heading, 0);
      scratch.quaternion.setFromEuler(scratch.euler);
      scratch.position.set(x, y + bounce, z);
      scratch.scale.set(0.075, 0.11, 0.075);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      body.setMatrixAt(i, scratch.matrix);
      if (head) {
        scratch.position.set(x, y + bounce + 0.145, z);
        scratch.scale.set(0.085, 0.085, 0.085);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        head.setMatrixAt(i, scratch.matrix);
      }
    } else {
      scratch.euler.set(0, heading, 0);
      scratch.quaternion.setFromEuler(scratch.euler);
      scratch.position.set(x, y, z);
      scratch.scale.set(0.14, 0.1, 0.24);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      body.setMatrixAt(i, scratch.matrix);
    }
  });
  body.instanceMatrix.needsUpdate = true;
  if (head) head.instanceMatrix.needsUpdate = true;
}
