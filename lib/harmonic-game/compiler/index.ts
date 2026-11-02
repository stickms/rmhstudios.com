/**
 * The Harmonic level compiler (H0.2): `LevelSource` -> in-memory `BspFile` + `MapManifest`.
 * Deterministic (same source, same bytes); environment-agnostic (no DOM, no Node APIs).
 */
import type { BspFile } from '../../tf2-game/formats/bsp';
import type { MapManifest, MapMaterial } from '../../tf2-game/assets/map-manifest';
import { buildBsp } from './bsp-build';
import { defaultMaterialLookup, type MaterialInfo, type MaterialLookup } from './materials';
import type { LevelSource } from './types';

export * from './types';
export * from './shapes';
export { LAYER_BRUSH_NAMES, PHASE_CONTROLLER_CLASS, PHASE_CONTROLLER_NAME } from './layers';
export { defaultMaterialLookup, normalizeHarmonicMaterial } from './materials';
export type { MaterialInfo, MaterialLookup } from './materials';

export interface CompiledLevel {
  bsp: BspFile;
  manifest: MapManifest;
  /** Every material the level uses, by normalised name. */
  materials: Map<string, MaterialInfo>;
  stats: {
    brushes: number;
    faces: number;
    leaves: number;
    /** Wall-clock compile time; not part of the determinism contract. */ ms: number;
  };
}

export interface CompileOptions {
  materials?: MaterialLookup;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

/** 256-bit non-cryptographic digest (eight FNV-1a lanes) of everything that defines the BSP. */
export function bspDigest(bsp: BspFile): string {
  const lanes = new Uint32Array([
    0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c,
  ]);
  const feed = (bytes: Uint8Array): void => {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      for (let l = 0; l < 8; l++) lanes[l] = Math.imul(lanes[l] ^ (b + l), 0x01000193 + 2 * l);
    }
  };
  const arr = (a: ArrayBufferView): void =>
    feed(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const text = (s: string): void => feed(new TextEncoder().encode(s));
  arr(bsp.planes.normal);
  arr(bsp.planes.dist);
  arr(bsp.planes.type);
  arr(bsp.nodes.planeNum);
  arr(bsp.nodes.children);
  arr(bsp.nodes.mins);
  arr(bsp.nodes.maxs);
  arr(bsp.leafs.contents);
  arr(bsp.leafs.mins);
  arr(bsp.leafs.maxs);
  arr(bsp.leafs.firstLeafBrush);
  arr(bsp.leafs.numLeafBrushes);
  arr(bsp.leafs.firstLeafFace);
  arr(bsp.leafs.numLeafFaces);
  arr(bsp.leafBrushes);
  arr(bsp.leafFaces);
  arr(bsp.brushes.firstSide);
  arr(bsp.brushes.numSides);
  arr(bsp.brushes.contents);
  arr(bsp.brushSides.planeNum);
  arr(bsp.brushSides.texInfo);
  arr(bsp.brushSides.bevel);
  arr(bsp.vertexes);
  arr(bsp.edges);
  arr(bsp.surfEdges);
  for (const t of bsp.texInfo) {
    arr(t.textureVecs);
    text(`${t.flags}:${t.texData}`);
  }
  for (const t of bsp.texData) text(`${t.name}:${t.width}x${t.height}`);
  const fa = new Int32Array(bsp.faces.length * 5);
  bsp.faces.forEach((f, i) => {
    fa[i * 5] = f.planeNum;
    fa[i * 5 + 1] = f.firstEdge;
    fa[i * 5 + 2] = f.numEdges;
    fa[i * 5 + 3] = f.texInfo;
    fa[i * 5 + 4] = f.lightOfs;
  });
  arr(fa);
  for (const m of bsp.models)
    text(
      `${m.headNode}:${m.firstFace}:${m.numFaces}:${m.mins.x},${m.mins.y},${m.mins.z}:${m.maxs.x},${m.maxs.y},${m.maxs.z}`,
    );
  text(bsp.entityText);
  return Array.from(lanes, (l) => l.toString(16).padStart(8, '0')).join('');
}

function bspBytes(bsp: BspFile): number {
  return (
    1024 +
    bsp.planes.normal.byteLength * 2 +
    bsp.nodes.children.byteLength * 4 +
    bsp.vertexes.byteLength +
    bsp.edges.byteLength +
    bsp.surfEdges.byteLength +
    bsp.faces.length * 56 +
    bsp.brushSides.planeNum.byteLength * 4 +
    bsp.entityText.length
  );
}

function manifestOf(
  src: LevelSource,
  bsp: BspFile,
  materials: Map<string, MaterialInfo>,
): MapManifest {
  const mats: Record<string, MapMaterial> = {};
  const textures: MapManifest['textures'] = {};
  for (const [name, m] of materials) {
    const e: MapMaterial = {
      shader: m.unlit || m.sky ? 'unlitgeneric' : 'lightmappedgeneric',
      color: [m.color[0], m.color[1], m.color[2]],
    };
    if (m.texture) {
      e.base = m.texture.id;
      textures[m.texture.id] = {
        file: `tex/${m.texture.id}.webp`,
        w: m.texture.w,
        h: m.texture.h,
        alpha: m.texture.alpha,
      };
    }
    if (m.translucent) e.translucent = true;
    if (m.unlit) e.unlit = true;
    if (m.nodraw) e.nodraw = true;
    if (m.sky) e.sky = true;
    mats[name] = e;
  }
  return {
    v: 1,
    game: 'hl2',
    map: src.id,
    bsp: `maps/${bspDigest(bsp)}.bsp`,
    bspBytes: bspBytes(bsp),
    lighting: 'ldr',
    materials: mats,
    textures,
    sky: src.sky ? { name: src.sky, faces: {} } : null,
    props: {},
    hulls: null,
    nav: null,
  };
}

/** Compiles a level. Throws with the brush's label on degenerate geometry. */
export function compileLevel(src: LevelSource, opts: CompileOptions = {}): CompiledLevel {
  const t0 = now();
  const built = buildBsp(src, opts.materials ?? defaultMaterialLookup);
  const manifest = manifestOf(src, built.bsp, built.materials);
  return {
    bsp: built.bsp,
    manifest,
    materials: built.materials,
    stats: { ...built.stats, ms: now() - t0 },
  };
}
