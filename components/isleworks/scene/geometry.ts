/**
 * Isleworks — the six shared primitives.
 *
 * The whole city is drawn from these. They are module singletons because every
 * instanced bucket in the scene reuses the same geometry object: allocating a
 * BoxGeometry per building would defeat the point of instancing entirely.
 *
 * **Origin convention** (the thing to get right when authoring a model in
 * `lib/isleworks/models.ts`): box, cylinder, cone and wedge are translated so
 * their y origin is the **base** — you position them by the ground they stand
 * on. Sphere and facet keep their centre, because you position a dome or a tree
 * crown by its middle.
 *
 * Segment counts are deliberately low: 8-sided cylinders and a subdivision-zero
 * icosahedron are what give the art its faceted, moulded-plastic read. Smoothing
 * them would cost more triangles AND look worse.
 */

import * as THREE from 'three';

function baseAligned<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export const BOX = baseAligned(new THREE.BoxGeometry(1, 1, 1));
export const CYLINDER = baseAligned(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
export const CONE = baseAligned(new THREE.ConeGeometry(0.5, 1, 8));
export const SPHERE = new THREE.SphereGeometry(0.5, 10, 7);
export const FACET = new THREE.IcosahedronGeometry(0.5, 0);

/**
 * Triangular prism — the pitched roof.
 *
 * Unit cube footprint: x ∈ [−½, ½] (ridge runs along X), y ∈ [0, 1], z ∈ [−½, ½]
 * with the ridge at z = 0. Hand-built rather than lathed from a shape because a
 * six-triangle mesh with correct flat normals is shorter to write than the
 * extrude-and-fix-normals version, and this one has no seams.
 */
function makeWedge(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // 0-3 base, 4-5 ridge.
  const v = [
    [-0.5, 0, -0.5], // 0 back-left
    [0.5, 0, -0.5], // 1 back-right
    [0.5, 0, 0.5], // 2 front-right
    [-0.5, 0, 0.5], // 3 front-left
    [-0.5, 1, 0], // 4 ridge-left
    [0.5, 1, 0], // 5 ridge-right
  ];
  const faces = [
    [0, 2, 1], // base
    [0, 3, 2],
    [3, 5, 2], // front slope
    [3, 4, 5],
    [1, 4, 0], // back slope
    [1, 5, 4],
    [0, 4, 3], // left gable
    [1, 2, 5], // right gable
  ];

  const positions: number[] = [];
  for (const [a, b, c] of faces) {
    positions.push(...v[a], ...v[b], ...v[c]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export const WEDGE = makeWedge();

export type ShapeKey = 'box' | 'cyl' | 'cone' | 'sphere' | 'wedge' | 'facet';

export const GEOMETRY: Record<ShapeKey, THREE.BufferGeometry> = {
  box: BOX,
  cyl: CYLINDER,
  cone: CONE,
  sphere: SPHERE,
  wedge: WEDGE,
  facet: FACET,
};

/** Shapes whose read depends on hard facets rather than a smooth shade. */
export const FLAT_SHADED: Record<ShapeKey, boolean> = {
  box: false,
  cyl: true,
  cone: true,
  sphere: true,
  wedge: false,
  facet: true,
};

export const SHAPE_KEYS: ShapeKey[] = ['box', 'cyl', 'cone', 'sphere', 'wedge', 'facet'];

/** Scratch objects — reused every frame so the hot path allocates nothing. */
export const scratch = {
  matrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  euler: new THREE.Euler(),
  color: new THREE.Color(),
};
