'use client';

/**
 * Isleworks — the buildings layer.
 *
 * Flattens every placed building into primitive parts (`lib/isleworks/models`),
 * buckets them by shape + glow, and draws each bucket as one `InstancedMesh`.
 * A four-hundred-building city is a dozen draw calls.
 *
 * ## Why there are three kinds of bucket
 *
 *  - **Static** buckets hold everything that does not move. Their matrices are
 *    written once per rebuild, and again only while a building is rising out of
 *    the ground. A settled city uploads nothing per frame.
 *  - **Spin** buckets hold turbine blades, which move every frame regardless.
 *    Separating them is the difference between uploading 40 matrices a frame and
 *    uploading two thousand.
 *  - **Hitboxes** is an invisible box per building, sized to its footprint. It
 *    exists so pointer-picking costs one ray test per *building* rather than one
 *    per part, and so clicking the top of a tower selects the tower rather than
 *    whatever tile happens to be behind it.
 *
 * Windows live in the `glow` buckets: the same geometry, a second material whose
 * emissive intensity is driven by the world clock, so every pane in the city
 * lights at dusk without a single per-instance colour write.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { tryGetDefinition } from '@/lib/isleworks/catalog';
import { footprintCenter, rotatedFootprint } from '@/lib/isleworks/grid';
import { buildingModel, type Part } from '@/lib/isleworks/models';
import { MAT } from '@/lib/isleworks/palette';
import type { BuildingInstance, CityState } from '@/lib/isleworks/types';

import { world } from './clock';
import { FLAT_SHADED, GEOMETRY, SHAPE_KEYS, scratch, type ShapeKey } from './geometry';

/** How long a building takes to rise into place, in seconds. */
const RISE_SECONDS = 0.85;

interface Placed {
  local: Part;
  owner: number;
  spin?: number;
}

interface Bucket {
  key: string;
  shape: ShapeKey;
  glow: boolean;
  items: Placed[];
}

interface Owner {
  instanceId: string;
  /** World-space centre of the footprint. */
  ox: number;
  oz: number;
  yaw: number;
  height: number;
  /** Footprint after rotation, for the hitbox. */
  fw: number;
  fd: number;
  blocked: boolean;
}

interface Flattened {
  buckets: Bucket[];
  spinBuckets: Bucket[];
  owners: Owner[];
}

/** Turn the city into instancing buckets. Pure — memoised on the city object. */
function flatten(city: CityState): Flattened {
  const byKey = new Map<string, Bucket>();
  const spinByKey = new Map<string, Bucket>();
  const owners: Owner[] = [];

  // The prefix matters: a spin bucket and a static bucket of the same shape are
  // two different meshes, and without it they collided on one React key.
  const bucketFor = (map: Map<string, Bucket>, shape: ShapeKey, glow: boolean, prefix: string) => {
    const key = `${prefix}:${shape}|${glow ? 'g' : 's'}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, shape, glow, items: [] };
      map.set(key, bucket);
    }
    return bucket;
  };

  city.buildings.forEach((instance: BuildingInstance) => {
    const def = tryGetDefinition(instance.definitionId);
    if (!def) return;
    const model = buildingModel(def.modelId, instance.level, instance.gridX * 31 + instance.gridY);
    const [cx, cz] = footprintCenter(
      instance.gridX,
      instance.gridY,
      def.footprint,
      instance.rotation,
      city.width,
      city.height,
    );
    const fp = rotatedFootprint(def.footprint, instance.rotation);
    const owner = owners.length;
    owners.push({
      instanceId: instance.instanceId,
      ox: cx,
      oz: cz,
      yaw: (instance.rotation * Math.PI) / 2,
      height: model.height,
      fw: fp.width,
      fd: fp.height,
      // Only *blocking* warnings get a pip in the world. "Not enough workers"
      // and "traffic jam" are things to read in the inspector; putting them in
      // the sky too turned a busy city into a field of orange cones and made the
      // three warnings that actually stop a building working invisible.
      blocked: instance.warnings.some(
        (w) => w === 'no-road' || w === 'no-power' || w === 'no-water',
      ),
    });

    for (const part of model.parts) {
      const spins = part.spin !== undefined;
      bucketFor(
        spins ? spinByKey : byKey,
        part.shape as ShapeKey,
        Boolean(part.glow),
        spins ? 'spin' : 'static',
      ).items.push({
        local: part,
        owner,
        spin: part.spin,
      });
    }
  });

  return {
    buckets: SHAPE_KEYS.flatMap((shape) =>
      [false, true]
        .map((glow) => byKey.get(`static:${shape}|${glow ? 'g' : 's'}`))
        .filter((b): b is Bucket => Boolean(b)),
    ),
    spinBuckets: [...spinByKey.values()],
    owners,
  };
}

interface BuildingsProps {
  city: CityState;
  freshIds: string[];
  selectedId: string | null;
  onPick: (instanceId: string) => void;
  onHoverBuilding: (instanceId: string | null) => void;
}

export function Buildings({ city, freshIds, selectedId, onPick, onHoverBuilding }: BuildingsProps) {
  const flattened = useMemo(() => flatten(city), [city]);
  const meshes = useRef(new Map<string, THREE.InstancedMesh>());
  const hitboxRef = useRef<THREE.InstancedMesh>(null);
  const warningRef = useRef<THREE.InstancedMesh>(null);
  const glowMaterials = useRef(new Map<string, THREE.MeshLambertMaterial>());

  /**
   * When each building first appeared, in `world.time`.
   *
   * The first flatten of a session marks everything as long-since-built, so
   * loading a save does not replay four hundred rise animations at once; only
   * ids the player places afterwards animate.
   */
  const bornAt = useRef(new Map<string, number>());
  const seeded = useRef(false);
  const needsFullWrite = useRef(true);

  useEffect(() => {
    const fresh = new Set(freshIds);
    for (const owner of flattened.owners) {
      if (bornAt.current.has(owner.instanceId)) continue;
      bornAt.current.set(
        owner.instanceId,
        seeded.current && fresh.has(owner.instanceId) ? world.time : -999,
      );
    }
    seeded.current = true;
    needsFullWrite.current = true;
  }, [flattened, freshIds]);

  /* Colours change only when the city does — never per frame. */
  useEffect(() => {
    for (const bucket of [...flattened.buckets, ...flattened.spinBuckets]) {
      const mesh = meshes.current.get(bucket.key);
      if (!mesh) continue;
      bucket.items.forEach((item, i) => {
        scratch.color.set(item.local.color);
        mesh.setColorAt(i, scratch.color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [flattened]);

  /** Compose one part's world matrix, including its building's rise offset. */
  const writePart = (
    mesh: THREE.InstancedMesh,
    i: number,
    item: Placed,
    owners: Owner[],
    spinAngle: number,
  ) => {
    const owner = owners[item.owner];
    const born = bornAt.current.get(owner.instanceId) ?? -999;
    const t = Math.min(1, Math.max(0, (world.time - born) / RISE_SECONDS));
    // Sink the whole building below the plate and let it push up, with a small
    // overshoot at the top so placement lands with a bounce rather than a stop.
    const sink = (1 - Math.min(1, t * 1.35)) * (owner.height + 0.4);
    const pop = 1 + 0.1 * Math.sin(Math.PI * t);

    const local = item.local;
    scratch.euler.set(
      local.r?.[0] ?? 0,
      local.r?.[1] ?? 0,
      (local.r?.[2] ?? 0) + (item.spin !== undefined ? spinAngle + item.spin : 0),
    );
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.position.set(local.p[0], local.p[1], local.p[2]);
    scratch.scale.set(local.s[0], local.s[1], local.s[2]);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);

    // Building transform, composed as translate × rotateY × uniform-pop.
    const parent = parentMatrix
      .makeRotationY(owner.yaw)
      .setPosition(owner.ox, -sink, owner.oz)
      .scale(scaleVec.set(pop, pop, pop));

    scratch.matrix.premultiply(parent);
    mesh.setMatrixAt(i, scratch.matrix);
  };

  useFrame(() => {
    // `world.time` is advanced by GameClock — this layer only reads it.
    const owners = flattened.owners;
    const spinAngle = world.time * 1.9;

    let rising = needsFullWrite.current;
    if (!rising) {
      for (const owner of owners) {
        const born = bornAt.current.get(owner.instanceId) ?? -999;
        if (world.time - born < RISE_SECONDS + 0.05) {
          rising = true;
          break;
        }
      }
    }

    if (rising) {
      for (const bucket of flattened.buckets) {
        const mesh = meshes.current.get(bucket.key);
        if (!mesh) continue;
        bucket.items.forEach((item, i) => writePart(mesh, i, item, owners, spinAngle));
        mesh.instanceMatrix.needsUpdate = true;
      }
      writeHitboxes(hitboxRef.current, owners);
      needsFullWrite.current = false;
    }

    for (const bucket of flattened.spinBuckets) {
      const mesh = meshes.current.get(bucket.key);
      if (!mesh) continue;
      bucket.items.forEach((item, i) => writePart(mesh, i, item, owners, spinAngle));
      mesh.instanceMatrix.needsUpdate = true;
    }

    /* Windows warm up as the sun goes down. */
    const glow = (1 - world.daylight) * 0.95;
    for (const material of glowMaterials.current.values()) material.emissiveIntensity = glow;

    /* Warning pips bob above anything that is not working. */
    const warn = warningRef.current;
    if (warn) {
      let n = 0;
      const bob = Math.sin(world.time * 3) * 0.05;
      for (const owner of owners) {
        if (!owner.blocked) continue;
        scratch.position.set(owner.ox, owner.height + 0.3 + bob, owner.oz);
        scratch.euler.set(Math.PI, 0, 0);
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.scale.set(0.18, 0.22, 0.18);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        warn.setMatrixAt(n++, scratch.matrix);
      }
      warn.count = n;
      warn.instanceMatrix.needsUpdate = true;
    }
  });

  const selectedOwner = useMemo(
    () => flattened.owners.find((o) => o.instanceId === selectedId),
    [flattened, selectedId],
  );

  const warningCount = flattened.owners.filter((o) => o.blocked).length;

  return (
    <group>
      {[...flattened.buckets, ...flattened.spinBuckets].map((bucket) =>
        bucket.items.length ? (
          <instancedMesh
            key={bucket.key}
            ref={(mesh) => {
              if (mesh) meshes.current.set(bucket.key, mesh);
              else meshes.current.delete(bucket.key);
            }}
            args={[GEOMETRY[bucket.shape], undefined, bucket.items.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
            raycast={() => null}
          >
            {bucket.glow ? (
              <meshLambertMaterial
                ref={(material) => {
                  if (material) glowMaterials.current.set(bucket.key, material);
                  else glowMaterials.current.delete(bucket.key);
                }}
                emissive={MAT.window}
                emissiveIntensity={0}
                flatShading={FLAT_SHADED[bucket.shape]}
              />
            ) : (
              <meshLambertMaterial flatShading={FLAT_SHADED[bucket.shape]} />
            )}
          </instancedMesh>
        ) : null,
      )}

      {/* Invisible pick volumes — see the header note. */}
      {flattened.owners.length > 0 && (
        <instancedMesh
          ref={hitboxRef}
          args={[GEOMETRY.box, undefined, flattened.owners.length]}
          frustumCulled={false}
          onPointerDown={(event) => {
            const i = event.instanceId;
            if (i === undefined) return;
            event.stopPropagation();
            onPick(flattened.owners[i].instanceId);
          }}
          onPointerMove={(event) => {
            const i = event.instanceId;
            if (i === undefined) return;
            event.stopPropagation();
            onHoverBuilding(flattened.owners[i].instanceId);
          }}
          onPointerOut={() => onHoverBuilding(null)}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </instancedMesh>
      )}

      {warningCount > 0 && (
        <instancedMesh
          ref={warningRef}
          args={[GEOMETRY.cone, undefined, warningCount]}
          frustumCulled={false}
          raycast={() => null}
        >
          <meshBasicMaterial color={MAT.warm} toneMapped={false} />
        </instancedMesh>
      )}

      {selectedOwner && (
        <mesh
          position={[selectedOwner.ox, 0.13, selectedOwner.oz]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry
            args={[
              Math.max(selectedOwner.fw, selectedOwner.fd) * 0.52,
              Math.max(selectedOwner.fw, selectedOwner.fd) * 0.62,
              28,
            ]}
          />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const parentMatrix = new THREE.Matrix4();
const scaleVec = new THREE.Vector3();

function writeHitboxes(mesh: THREE.InstancedMesh | null, owners: Owner[]): void {
  if (!mesh) return;
  owners.forEach((owner, i) => {
    scratch.position.set(owner.ox, 0, owner.oz);
    scratch.quaternion.identity();
    scratch.scale.set(owner.fw * 0.96, Math.max(0.2, owner.height), owner.fd * 0.96);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(i, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
