/**
 * Draws many procedural models with a handful of draw calls: every part of every instance is
 * grouped by (shape, palette colour) into one InstancedMesh, so a forest of 500 trees is a few
 * draws, not 1,500 meshes. Models are plain data (`ModelSpec`), so what is drawn is exactly
 * what the style checker (features/hearthworks/engine/art/style-rules.ts) approved.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import * as THREE from 'three';
import {
  PALETTE,
  type ModelSpec,
  type PaletteKey,
  type Part,
} from '@features/hearthworks/engine/art';

export interface ModelInstance {
  spec: ModelSpec;
  x: number;
  z: number;
  y?: number;
  scale?: number;
  rotY?: number;
}

const GEOMETRY_FACTORIES: Record<
  Part['shape'],
  () => THREE.BufferGeometry
> =
  {
    box: () =>
      new THREE.BoxGeometry(
        1,
        1,
        1,
      ),
    cylinder:
      () =>
        new THREE.CylinderGeometry(
          0.5,
          0.5,
          1,
          14,
        ),
    cone: () =>
      new THREE.ConeGeometry(
        0.5,
        1,
        14,
      ),
    sphere:
      () =>
        new THREE.SphereGeometry(
          0.5,
          14,
          10,
        ),
  };

interface Group {
  key: string;
  shape: Part['shape'];
  color: PaletteKey;
  matrices: THREE.Matrix4[];
}

const tmpPos =
  new THREE.Vector3();
const tmpQuat =
  new THREE.Quaternion();
const tmpScale =
  new THREE.Vector3();
const yAxis =
  new THREE.Vector3(
    0,
    1,
    0,
  );

function groupInstances(
  instances: readonly ModelInstance[],
): Group[] {
  const groups =
    new Map<
      string,
      Group
    >();
  for (const inst of instances) {
    const base =
      new THREE.Matrix4().compose(
        tmpPos.set(
          inst.x,
          inst.y ??
            0,
          inst.z,
        ),
        tmpQuat.setFromAxisAngle(
          yAxis,
          inst.rotY ??
            0,
        ),
        tmpScale.setScalar(
          inst.scale ??
            1,
        ),
      );
    for (const part of inst
      .spec
      .parts) {
      const local =
        new THREE.Matrix4().compose(
          tmpPos.set(
            part
              .pos[0],
            part
              .pos[1],
            part
              .pos[2],
          ),
          tmpQuat.setFromAxisAngle(
            yAxis,
            part.rotY ??
              0,
          ),
          tmpScale.set(
            part
              .size[0],
            part
              .size[1],
            part
              .size[2],
          ),
        );
      const key = `${part.shape}|${part.color}`;
      let g =
        groups.get(
          key,
        );
      if (
        !g
      )
        groups.set(
          key,
          (g =
            {
              key,
              shape:
                part.shape,
              color:
                part.color,
              matrices:
                [],
            }),
        );
      g.matrices.push(
        new THREE.Matrix4().multiplyMatrices(
          base,
          local,
        ),
      );
    }
  }
  return [
    ...groups.values(),
  ];
}

function InstancedGroup({
  group,
}: {
  group: Group;
}) {
  const ref =
    useRef<THREE.InstancedMesh>(
      null,
    );
  const geometry =
    useMemo(
      () =>
        GEOMETRY_FACTORIES[
          group
            .shape
        ](),
      [
        group.shape,
      ],
    );
  const material =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial(
          {
            color:
              PALETTE[
                group
                  .color
              ],
            roughness: 0.85,
            metalness: 0,
          },
        ),
      [
        group.color,
      ],
    );
  useLayoutEffect(() => {
    const mesh =
      ref.current;
    if (
      !mesh
    )
      return;
    group.matrices.forEach(
      (
        m,
        i,
      ) =>
        mesh.setMatrixAt(
          i,
          m,
        ),
    );
    mesh.instanceMatrix.needsUpdate = true;
  }, [
    group,
  ]);
  useLayoutEffect(
    () =>
      () => {
        geometry.dispose();
        material.dispose();
      },
    [
      geometry,
      material,
    ],
  );
  return (
    <instancedMesh
      ref={
        ref
      }
      // A new count means a new buffer; keying on it makes React rebuild the mesh instead of overflowing it.
      key={
        group
          .matrices
          .length
      }
      args={[
        geometry,
        material,
        group
          .matrices
          .length,
      ]}
      // Instances span the whole board, so the shared geometry's bounds say nothing about visibility.
      frustumCulled={
        false
      }
    />
  );
}

export function InstancedModels({
  instances,
}: {
  instances: readonly ModelInstance[];
}) {
  const groups =
    useMemo(
      () =>
        groupInstances(
          instances,
        ),
      [
        instances,
      ],
    );
  return (
    <>
      {groups.map(
        (
          g,
        ) => (
          <InstancedGroup
            key={
              g.key
            }
            group={
              g
            }
          />
        ),
      )}
    </>
  );
}
