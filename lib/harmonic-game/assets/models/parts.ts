/**
 * Low-poly part assembly for the procedural models (plan H2.4). A model is a list of `Part`s —
 * boxes, capsules, cylinders — in model space (Source units, three axes: +X left, +Y up, +Z
 * forward), each optionally bound rigidly to one bone. `assemble` bakes them into flat-shaded
 * geometry, one mesh per material, and (for skinned models) a skeleton.
 *
 * Render side: imports three. The pure, Node-safe description of the same models lives in
 * `info.ts`. Deterministic: no randomness, same parts give the same vertices.
 */
import {
  type AnimationClip,
  Bone,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rgb } from '../palette';

/** Source units → metres (the renderer's scale). */
export const U = 0.01905;

export type Vec = readonly [number, number, number];

export type Shape = 'box' | 'cap' | 'cyl';

export interface Part {
  shape: Shape;
  /** Centre, model space (units). */
  c: Vec;
  /**
   * box: full size [x, y, z]. cap: radius x, cylinder length (y), radius z.
   * cyl: radius x, height (y), radius z.
   */
  s: Vec;
  mat: string;
  /** Bone the part is rigidly skinned to (skinned models). */
  bone?: string;
  /** Euler XYZ, degrees, about the part centre. */
  rot?: Vec;
  /** Top radius as a fraction of the bottom one (cyl): a taper. */
  k?: number;
  /** A transform applied after the part is placed (carrying a held item into a pose). */
  xf?: Matrix4;
  /** Radial segments for a round shape. */
  seg?: number;
}

export interface MatDef {
  rgb: Rgb;
  /** Drawn at its own colour whatever the light (lamps, emitters). */
  glow?: boolean;
}

/** An Object3D that carries its clips (the `GLTF.animations` of the stub loader). */
export type ModelObject = Object3D & { animations: AnimationClip[] };

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Position relative to the parent, units. */
  pos: Vec;
}

const rad = Math.PI / 180;

/** World bind position of every bone (units). */
export function bindPositions(bones: readonly BoneDef[]): Map<string, Vector3> {
  const out = new Map<string, Vector3>();
  for (const b of bones) {
    const p = b.parent ? out.get(b.parent) : undefined;
    out.set(b.name, new Vector3(...b.pos).add(p ?? new Vector3()));
  }
  return out;
}

function partGeometry(p: Part): BufferGeometry {
  let g: BufferGeometry;
  const seg = p.seg ?? 8;
  if (p.shape === 'box') {
    g = new BoxGeometry(p.s[0], p.s[1], p.s[2]);
  } else if (p.shape === 'cap') {
    g = new CapsuleGeometry(p.s[0], p.s[1], 2, Math.max(5, seg - 2));
    if (p.s[2] !== p.s[0]) g.scale(1, 1, p.s[2] / p.s[0]);
  } else {
    g = new CylinderGeometry(p.s[0] * (p.k ?? 1), p.s[0], p.s[1], seg);
    if (p.s[2] !== p.s[0]) g.scale(1, 1, p.s[2] / p.s[0]);
  }
  if (p.rot) {
    g.applyMatrix4(
      new Matrix4().makeRotationFromEuler(
        new Euler(p.rot[0] * rad, p.rot[1] * rad, p.rot[2] * rad, 'XYZ'),
      ),
    );
  }
  g.translate(p.c[0], p.c[1], p.c[2]);
  if (p.xf) g.applyMatrix4(p.xf);
  g.scale(U, U, U);
  // Flat shading: facets read as intentional at this poly count.
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

export interface Assembled {
  root: ModelObject;
  materials: Material[];
  bones: Bone[];
}

/**
 * Bakes parts into a model. With `bones`, parts are skinned to their bone (default: the first)
 * and the root group holds the root bone and one SkinnedMesh per material; otherwise plain meshes.
 */
export function assemble(
  name: string,
  parts: readonly Part[],
  mats: Record<string, MatDef>,
  bones?: readonly BoneDef[],
): Assembled {
  const root = new Group() as unknown as ModelObject;
  root.name = name;
  root.animations = [];
  const boneObjs: Bone[] = [];
  const boneIndex = new Map<string, number>();
  if (bones) {
    const byName = new Map<string, Bone>();
    for (const d of bones) {
      const b = new Bone();
      b.name = d.name;
      b.position.set(d.pos[0] * U, d.pos[1] * U, d.pos[2] * U);
      boneIndex.set(d.name, boneObjs.length);
      boneObjs.push(b);
      byName.set(d.name, b);
      if (d.parent) byName.get(d.parent)!.add(b);
      else root.add(b);
    }
    root.updateMatrixWorld(true);
  }
  const skeleton = bones ? new Skeleton(boneObjs) : null;
  const materials: Material[] = [];
  const order: string[] = [];
  const byMat = new Map<string, BufferGeometry[]>();
  for (const p of parts) {
    if (!mats[p.mat]) throw new Error(`model ${name}: unknown material "${p.mat}"`);
    const g = partGeometry(p);
    if (skeleton) {
      const bi = boneIndex.get(p.bone ?? bones![0].name);
      if (bi === undefined) throw new Error(`model ${name}: unknown bone "${p.bone}"`);
      const n = g.getAttribute('position').count;
      const idx = new Uint16Array(n * 4);
      const w = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = bi;
        w[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new Float32BufferAttribute(w, 4));
    }
    let list = byMat.get(p.mat);
    if (!list) {
      list = [];
      byMat.set(p.mat, list);
      order.push(p.mat);
    }
    list.push(g);
  }
  for (const key of order) {
    const geom = mergeGeometries(byMat.get(key)!, false);
    for (const g of byMat.get(key)!) g.dispose();
    const def = mats[key];
    const mat = new MeshStandardMaterial({ name: `mat_${key}` });
    mat.color = new Color().setRGB(
      def.rgb[0] / 255,
      def.rgb[1] / 255,
      def.rgb[2] / 255,
      SRGBColorSpace,
    );
    if (def.glow) mat.userData = { selfillum: true };
    materials.push(mat);
    let mesh: Mesh;
    if (skeleton) {
      const sm = new SkinnedMesh(geom, mat);
      sm.bind(skeleton, new Matrix4());
      mesh = sm;
    } else mesh = new Mesh(geom, mat);
    mesh.name = `mesh_${key}`;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  return { root, materials, bones: boneObjs };
}

/** Parts moved by a matrix (a held item carried into a hand), optionally re-bound to a bone. */
export function transformParts(parts: readonly Part[], m: Matrix4, bone?: string): Part[] {
  return parts.map((p) => ({
    ...p,
    bone: bone ?? p.bone,
    xf: p.xf ? m.clone().multiply(p.xf) : m,
  }));
}

/** A capsule running from point `a` to point `b` (units), radius `r`. */
export function segment(a: Vec, b: Vec, r: number, mat: string, bone?: string, rz = r): Part {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return {
    shape: 'cap',
    c: [0, 0, 0],
    s: [r, Math.max(0, len - 2 * r), rz],
    mat,
    bone,
    xf: new Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new Vector3(1, 1, 1)),
  };
}

/** A basis from the model's own axes: columns forward, left, up (Source order, in three axes). */
export function sourceBasis(fwd: Vector3, left: Vector3, up: Vector3, pos: Vector3): Matrix4 {
  return new Matrix4().makeBasis(fwd, left, up).setPosition(pos);
}
