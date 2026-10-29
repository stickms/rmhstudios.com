/**
 * BSP v19–21 reader (TF2 ships v20). Struct layouts follow public/bspfile.h and
 * public/gamebspfile.h of the Source SDK 2013. Hot data the collision code walks
 * (planes, nodes, leafs, brushes, brush sides) is kept as typed arrays
 * (structure-of-arrays); the rest is plain objects.
 *
 * Every lump may be LZMA-compressed (lump_t.fourCC = uncompressed size, data
 * starts with Valve's "LZMA" header); TF2's shipped maps compress nearly all of
 * them, and game lumps are compressed one by one (GAMELUMPFLAG_COMPRESSED).
 */

import type { Vec3 } from '../core/vec';
import { BinaryReader, decodeText, readCString, viewOf } from './binary';
import { BspEntity, parseEntityLump } from './keyvalues';
import { decodeValveLzma, isValveLzma } from './lzma';
import { parseZip, type ZipArchive } from './zip';

export const BSP_IDENT = 0x50534256; // 'VBSP'
export const HEADER_LUMPS = 64;

export const LUMP = {
  ENTITIES: 0,
  PLANES: 1,
  TEXDATA: 2,
  VERTEXES: 3,
  VISIBILITY: 4,
  NODES: 5,
  TEXINFO: 6,
  FACES: 7,
  LIGHTING: 8,
  OCCLUSION: 9,
  LEAFS: 10,
  FACEIDS: 11,
  EDGES: 12,
  SURFEDGES: 13,
  MODELS: 14,
  WORLDLIGHTS: 15,
  LEAFFACES: 16,
  LEAFBRUSHES: 17,
  BRUSHES: 18,
  BRUSHSIDES: 19,
  AREAS: 20,
  AREAPORTALS: 21,
  DISPINFO: 26,
  ORIGINALFACES: 27,
  PHYSDISP: 28,
  PHYSCOLLIDE: 29,
  VERTNORMALS: 30,
  VERTNORMALINDICES: 31,
  DISP_LIGHTMAP_ALPHAS: 32,
  DISP_VERTS: 33,
  DISP_LIGHTMAP_SAMPLE_POSITIONS: 34,
  GAME_LUMP: 35,
  LEAFWATERDATA: 36,
  PRIMITIVES: 37,
  PRIMVERTS: 38,
  PRIMINDICES: 39,
  PAKFILE: 40,
  CLIPPORTALVERTS: 41,
  CUBEMAPS: 42,
  TEXDATA_STRING_DATA: 43,
  TEXDATA_STRING_TABLE: 44,
  OVERLAYS: 45,
  LEAFMINDISTTOWATER: 46,
  FACE_MACRO_TEXTURE_INFO: 47,
  DISP_TRIS: 48,
  PHYSCOLLIDESURFACE: 49,
  WATEROVERLAYS: 50,
  LEAF_AMBIENT_INDEX_HDR: 51,
  LEAF_AMBIENT_INDEX: 52,
  LIGHTING_HDR: 53,
  WORLDLIGHTS_HDR: 54,
  LEAF_AMBIENT_LIGHTING_HDR: 55,
  LEAF_AMBIENT_LIGHTING: 56,
  XZIPPAKFILE: 57,
  FACES_HDR: 58,
  MAP_FLAGS: 59,
  OVERLAY_FADES: 60,
} as const;

export interface BspLumpInfo {
  offset: number;
  length: number;
  version: number;
  /** Uncompressed size when the lump is LZMA-compressed, else 0. */
  uncompressedSize: number;
}

/** dplane_t, SoA. */
export interface BspPlanes {
  count: number;
  /** xyz per plane. */
  normal: Float32Array;
  dist: Float32Array;
  /** PLANE_X/Y/Z (0–2) or PLANE_ANYX/Y/Z (3–5). */
  type: Int32Array;
}

/** dnode_t, SoA. children[2i], children[2i+1]: ≥0 node index, <0 = -(leaf+1). */
export interface BspNodes {
  count: number;
  planeNum: Int32Array;
  children: Int32Array;
  mins: Int16Array;
  maxs: Int16Array;
  firstFace: Uint16Array;
  numFaces: Uint16Array;
  area: Int16Array;
}

/** dleaf_t (v1) / dleaf_version_0_t (v0), SoA. */
export interface BspLeafs {
  count: number;
  /** Leaf struct version (0 = carries ambient lighting inline, 1 = not). */
  version: number;
  contents: Int32Array;
  cluster: Int16Array;
  area: Int16Array;
  flags: Uint8Array;
  mins: Int16Array;
  maxs: Int16Array;
  firstLeafFace: Uint16Array;
  numLeafFaces: Uint16Array;
  firstLeafBrush: Uint16Array;
  numLeafBrushes: Uint16Array;
  leafWaterDataId: Int16Array;
  /** v0 only: CompressedLightCube (6 × ColorRGBExp32 = 24 bytes) per leaf. */
  ambientLighting: Uint8Array | null;
}

export interface BspTexInfo {
  /** [s.xyz, s.offset, t.xyz, t.offset] in texels per world unit. */
  textureVecs: Float32Array;
  /** Same, in lightmap luxels per world unit. */
  lightmapVecs: Float32Array;
  /** SURF_* flags. */
  flags: number;
  texData: number;
}

export interface BspTexData {
  reflectivity: Vec3;
  nameStringTableId: number;
  /** Material name (e.g. "TOOLS/TOOLSNODRAW"), as stored. */
  name: string;
  width: number;
  height: number;
  viewWidth: number;
  viewHeight: number;
}

/** dface_t. */
export interface BspFace {
  /**
   * The face's own plane: in shipped maps the winding is clockwise about this
   * normal whatever `side` says, so it is the facing normal as is.
   */
  planeNum: number;
  /** Which side of its node's plane the face lies on (vbsp bookkeeping). */
  side: number;
  onNode: number;
  firstEdge: number;
  numEdges: number;
  texInfo: number;
  dispInfo: number;
  surfaceFogVolumeId: number;
  styles: [number, number, number, number];
  /** Byte offset into the lighting lump, or -1. */
  lightOfs: number;
  area: number;
  lightmapTextureMinsInLuxels: [number, number];
  lightmapTextureSizeInLuxels: [number, number];
  origFace: number;
  numPrims: number;
  firstPrimId: number;
  smoothingGroups: number;
  /** False when the top bit of m_NumPrims disables dynamic shadows. */
  dynamicShadowsEnabled: boolean;
}

export interface BspModel {
  mins: Vec3;
  maxs: Vec3;
  origin: Vec3;
  headNode: number;
  firstFace: number;
  numFaces: number;
}

export interface BspBrushes {
  count: number;
  firstSide: Int32Array;
  numSides: Int32Array;
  contents: Int32Array;
}

export interface BspBrushSides {
  count: number;
  planeNum: Uint16Array;
  /** −1 for sides without a texinfo (e.g. some bevels). */
  texInfo: Int16Array;
  /** Not reliable in shipped maps (0 on ordinary sides); displacement brushes are removed by vbsp anyway. */
  dispInfo: Int16Array;
  bevel: Int16Array;
}

export interface DispSubNeighbor {
  /** 0xffff = none. */
  neighbor: number;
  orientation: number;
  span: number;
  neighborSpan: number;
}

export interface BspDispInfo {
  startPosition: Vec3;
  dispVertStart: number;
  dispTriStart: number;
  power: number;
  /** minTess without the flag bit. */
  minTess: number;
  /** CCoreDispInfo::SURF_* flags, from the high bit of minTess (SURF_NOPHYSICS_COLL 2, SURF_NOHULL_COLL 4, SURF_NORAY_COLL 8). */
  flags: number;
  smoothingAngle: number;
  contents: number;
  mapFace: number;
  lightmapAlphaStart: number;
  lightmapSamplePositionStart: number;
  /** [edge][sub] per NEIGHBOREDGE_* (left, top, right, bottom). */
  edgeNeighbors: DispSubNeighbor[][];
  /** Neighbour indices per CORNER_*. */
  cornerNeighbors: number[][];
  allowedVerts: Uint32Array;
}

/** CDispVert, SoA. */
export interface BspDispVerts {
  count: number;
  vector: Float32Array;
  dist: Float32Array;
  alpha: Float32Array;
}

export const DISP_SURF_NOPHYSICS_COLL = 0x2;
export const DISP_SURF_NOHULL_COLL = 0x4;
export const DISP_SURF_NORAY_COLL = 0x8;

export const DISPTRI_TAG_SURFACE = 1 << 0;
export const DISPTRI_TAG_WALKABLE = 1 << 1;
export const DISPTRI_TAG_BUILDABLE = 1 << 2;
export const DISPTRI_FLAG_SURFPROP1 = 1 << 3;
export const DISPTRI_FLAG_SURFPROP2 = 1 << 4;
export const DISPTRI_TAG_REMOVE = 1 << 5;

/** dvis_t: per-cluster byte offsets of the compressed PVS / PAS rows (into `data`). */
export interface BspVisibility {
  numClusters: number;
  /** [cluster*2 + 0] = PVS offset, [cluster*2 + 1] = PAS offset (relative to the lump). */
  bitOfs: Int32Array;
  /** The raw lump. */
  data: Uint8Array;
}

export interface BspWorldLight {
  origin: Vec3;
  intensity: Vec3;
  normal: Vec3;
  cluster: number;
  /** emittype_t: 0 surface, 1 point, 2 spotlight, 3 skylight, 4 quakelight, 5 skyambient. */
  type: number;
  style: number;
  stopdot: number;
  stopdot2: number;
  exponent: number;
  radius: number;
  constantAttn: number;
  linearAttn: number;
  quadraticAttn: number;
  flags: number;
  texInfo: number;
  owner: number;
}

export interface BspCubemap {
  origin: Vec3;
  /** 0 = default; otherwise 1 << (size - 1). */
  size: number;
}

export interface BspOverlay {
  id: number;
  texInfo: number;
  faceCount: number;
  renderOrder: number;
  faces: number[];
  u: [number, number];
  v: [number, number];
  uvPoints: [Vec3, Vec3, Vec3, Vec3];
  origin: Vec3;
  basisNormal: Vec3;
}

/** LUMP_LEAF_AMBIENT_LIGHTING(_HDR) + its index lump. */
export interface BspLeafAmbient {
  /** Per leaf: [ambientSampleCount, firstAmbientSample]. */
  index: Uint16Array;
  /** Per sample: 24 bytes CompressedLightCube (6 × RGBE). */
  cubes: Uint8Array;
  /** Per sample: x, y, z fixed-point fractions of the leaf bounds (0–255). */
  positions: Uint8Array;
  sampleCount: number;
}

export interface StaticProp {
  origin: Vec3;
  angles: Vec3;
  /** Index into `StaticPropsLump.models`. */
  propType: number;
  model: string;
  firstLeaf: number;
  leafCount: number;
  /** SOLID_NONE 0, SOLID_BBOX 2, SOLID_VPHYSICS 6. */
  solid: number;
  /** STATIC_PROP_* flags. */
  flags: number;
  skin: number;
  fadeMinDist: number;
  fadeMaxDist: number;
  lightingOrigin: Vec3;
  forcedFadeScale: number;
  minDxLevel: number;
  maxDxLevel: number;
  minCpuLevel: number;
  maxCpuLevel: number;
  minGpuLevel: number;
  maxGpuLevel: number;
  /** RGBA 0–255 (v7+ / v8+ layouts); white otherwise. */
  diffuseModulation: [number, number, number, number];
  lightmapResX: number;
  lightmapResY: number;
  uniformScale: number;
}

export interface StaticPropsLump {
  version: number;
  /** Bytes per prop record as found in the file. */
  recordSize: number;
  models: string[];
  leafs: Uint16Array;
  props: StaticProp[];
}

export interface BspGameLump {
  id: string;
  flags: number;
  version: number;
  data: Uint8Array;
}

export interface BspFile {
  version: number;
  mapRevision: number;
  lumps: BspLumpInfo[];
  entities: BspEntity[];
  /** Raw entity lump text. */
  entityText: string;
  planes: BspPlanes;
  texData: BspTexData[];
  /** LUMP_TEXDATA_STRING_DATA resolved through the table: index = string table id. */
  texDataStrings: string[];
  /** xyz per vertex. */
  vertexes: Float32Array;
  visibility: BspVisibility | null;
  nodes: BspNodes;
  texInfo: BspTexInfo[];
  faces: BspFace[];
  facesHdr: BspFace[];
  originalFaces: BspFace[];
  /** LDR lightmaps (ColorRGBExp32 samples). Decoded lazily on first access. */
  lighting: Uint8Array;
  /** HDR lightmaps (ColorRGBExp32 samples). Decoded lazily on first access. */
  lightingHdr: Uint8Array;
  leafs: BspLeafs;
  /** v0,v1 vertex indices per edge. */
  edges: Uint16Array;
  surfEdges: Int32Array;
  models: BspModel[];
  worldLights: BspWorldLight[];
  worldLightsHdr: BspWorldLight[];
  leafFaces: Uint16Array;
  leafBrushes: Uint16Array;
  brushes: BspBrushes;
  brushSides: BspBrushSides;
  dispInfos: BspDispInfo[];
  dispVerts: BspDispVerts;
  /** CDispTri tags. */
  dispTris: Uint16Array;
  leafAmbientLdr: BspLeafAmbient | null;
  leafAmbientHdr: BspLeafAmbient | null;
  gameLumps: BspGameLump[];
  staticProps: StaticPropsLump | null;
  /** Raw LUMP_PAKFILE bytes (a zip). */
  pakfile: Uint8Array;
  cubemaps: BspCubemap[];
  overlays: BspOverlay[];
  /** u16 per face: string table id of the macro texture, 0xffff = none. Empty if absent. */
  faceMacroTextureInfo: Uint16Array;
  /** LVLFLAGS_* from LUMP_MAP_FLAGS, or 0. */
  mapFlags: number;
}

// --- helpers ----------------------------------------------------------------

function readLumpInfo(view: DataView, i: number): BspLumpInfo {
  const o = 8 + i * 16;
  return {
    offset: view.getInt32(o, true),
    length: view.getInt32(o + 4, true),
    version: view.getInt32(o + 8, true),
    uncompressedSize: view.getInt32(o + 12, true),
  };
}

/** Returns the (decompressed) bytes of a lump. */
export function lumpBytes(bytes: Uint8Array, info: BspLumpInfo): Uint8Array {
  if (info.length <= 0 || info.offset < 0 || info.offset + info.length > bytes.length)
    return new Uint8Array(0);
  const raw = bytes.subarray(info.offset, info.offset + info.length);
  if (info.uncompressedSize !== 0 && isValveLzma(raw)) return decodeValveLzma(raw);
  return raw;
}

const v3 = (r: BinaryReader): Vec3 => r.vec3();

function readPlanes(b: Uint8Array): BspPlanes {
  const count = Math.floor(b.length / 20);
  const view = viewOf(b);
  const normal = new Float32Array(count * 3);
  const dist = new Float32Array(count);
  const type = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 20;
    normal[i * 3] = view.getFloat32(o, true);
    normal[i * 3 + 1] = view.getFloat32(o + 4, true);
    normal[i * 3 + 2] = view.getFloat32(o + 8, true);
    dist[i] = view.getFloat32(o + 12, true);
    type[i] = view.getInt32(o + 16, true);
  }
  return { count, normal, dist, type };
}

function readNodes(b: Uint8Array): BspNodes {
  const count = Math.floor(b.length / 32);
  const view = viewOf(b);
  const n: BspNodes = {
    count,
    planeNum: new Int32Array(count),
    children: new Int32Array(count * 2),
    mins: new Int16Array(count * 3),
    maxs: new Int16Array(count * 3),
    firstFace: new Uint16Array(count),
    numFaces: new Uint16Array(count),
    area: new Int16Array(count),
  };
  for (let i = 0; i < count; i++) {
    const o = i * 32;
    n.planeNum[i] = view.getInt32(o, true);
    n.children[i * 2] = view.getInt32(o + 4, true);
    n.children[i * 2 + 1] = view.getInt32(o + 8, true);
    for (let k = 0; k < 3; k++) {
      n.mins[i * 3 + k] = view.getInt16(o + 12 + k * 2, true);
      n.maxs[i * 3 + k] = view.getInt16(o + 18 + k * 2, true);
    }
    n.firstFace[i] = view.getUint16(o + 24, true);
    n.numFaces[i] = view.getUint16(o + 26, true);
    n.area[i] = view.getInt16(o + 28, true);
  }
  return n;
}

function readLeafs(b: Uint8Array, lumpVersion: number, bspVersion: number): BspLeafs {
  // Version 0 leafs (BSP 19 and some 20) carry a 24-byte ambient cube: 56 bytes; v1 is 32.
  let version = lumpVersion;
  if (version !== 0 && version !== 1) version = bspVersion <= 19 ? 0 : 1;
  if (b.length % 56 === 0 && b.length % 32 !== 0) version = 0;
  if (b.length % 32 === 0 && b.length % 56 !== 0) version = 1;
  const size = version === 0 ? 56 : 32;
  const count = Math.floor(b.length / size);
  const view = viewOf(b);
  const l: BspLeafs = {
    count,
    version,
    contents: new Int32Array(count),
    cluster: new Int16Array(count),
    area: new Int16Array(count),
    flags: new Uint8Array(count),
    mins: new Int16Array(count * 3),
    maxs: new Int16Array(count * 3),
    firstLeafFace: new Uint16Array(count),
    numLeafFaces: new Uint16Array(count),
    firstLeafBrush: new Uint16Array(count),
    numLeafBrushes: new Uint16Array(count),
    leafWaterDataId: new Int16Array(count),
    ambientLighting: version === 0 ? new Uint8Array(count * 24) : null,
  };
  for (let i = 0; i < count; i++) {
    const o = i * size;
    l.contents[i] = view.getInt32(o, true);
    l.cluster[i] = view.getInt16(o + 4, true);
    const af = view.getUint16(o + 6, true);
    l.area[i] = af & 0x1ff;
    l.flags[i] = af >>> 9;
    for (let k = 0; k < 3; k++) {
      l.mins[i * 3 + k] = view.getInt16(o + 8 + k * 2, true);
      l.maxs[i * 3 + k] = view.getInt16(o + 14 + k * 2, true);
    }
    l.firstLeafFace[i] = view.getUint16(o + 20, true);
    l.numLeafFaces[i] = view.getUint16(o + 22, true);
    l.firstLeafBrush[i] = view.getUint16(o + 24, true);
    l.numLeafBrushes[i] = view.getUint16(o + 26, true);
    l.leafWaterDataId[i] = view.getInt16(o + 28, true);
    if (l.ambientLighting) l.ambientLighting.set(b.subarray(o + 30, o + 54), i * 24);
  }
  return l;
}

function readTexInfo(b: Uint8Array): BspTexInfo[] {
  const r = new BinaryReader(b);
  const out: BspTexInfo[] = [];
  const count = Math.floor(b.length / 72);
  for (let i = 0; i < count; i++) {
    const textureVecs = new Float32Array(8);
    const lightmapVecs = new Float32Array(8);
    for (let k = 0; k < 8; k++) textureVecs[k] = r.f32();
    for (let k = 0; k < 8; k++) lightmapVecs[k] = r.f32();
    out.push({ textureVecs, lightmapVecs, flags: r.i32(), texData: r.i32() });
  }
  return out;
}

function readTexDataStrings(dataLump: Uint8Array, tableLump: Uint8Array): string[] {
  const view = viewOf(tableLump);
  const n = Math.floor(tableLump.length / 4);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const ofs = view.getInt32(i * 4, true);
    out.push(ofs >= 0 && ofs < dataLump.length ? readCString(dataLump, ofs) : '');
  }
  return out;
}

function readTexData(b: Uint8Array, strings: string[]): BspTexData[] {
  const r = new BinaryReader(b);
  const out: BspTexData[] = [];
  const count = Math.floor(b.length / 32);
  for (let i = 0; i < count; i++) {
    const reflectivity = v3(r);
    const nameStringTableId = r.i32();
    out.push({
      reflectivity,
      nameStringTableId,
      name: strings[nameStringTableId] ?? '',
      width: r.i32(),
      height: r.i32(),
      viewWidth: r.i32(),
      viewHeight: r.i32(),
    });
  }
  return out;
}

function readFaces(b: Uint8Array): BspFace[] {
  const r = new BinaryReader(b);
  const out: BspFace[] = [];
  const count = Math.floor(b.length / 56);
  for (let i = 0; i < count; i++) {
    const planeNum = r.u16();
    const side = r.u8();
    const onNode = r.u8();
    const firstEdge = r.i32();
    const numEdges = r.i16();
    const texInfo = r.i16();
    const dispInfo = r.i16();
    const surfaceFogVolumeId = r.i16();
    const styles: [number, number, number, number] = [r.u8(), r.u8(), r.u8(), r.u8()];
    const lightOfs = r.i32();
    const area = r.f32();
    const lightmapTextureMinsInLuxels: [number, number] = [r.i32(), r.i32()];
    const lightmapTextureSizeInLuxels: [number, number] = [r.i32(), r.i32()];
    const origFace = r.i32();
    const numPrimsRaw = r.u16();
    const firstPrimId = r.u16();
    const smoothingGroups = r.u32();
    out.push({
      planeNum,
      side,
      onNode,
      firstEdge,
      numEdges,
      texInfo,
      dispInfo,
      surfaceFogVolumeId,
      styles,
      lightOfs,
      area,
      lightmapTextureMinsInLuxels,
      lightmapTextureSizeInLuxels,
      origFace,
      numPrims: numPrimsRaw & 0x7fff,
      firstPrimId,
      smoothingGroups,
      dynamicShadowsEnabled: (numPrimsRaw & 0x8000) === 0,
    });
  }
  return out;
}

function readModels(b: Uint8Array): BspModel[] {
  const r = new BinaryReader(b);
  const out: BspModel[] = [];
  const count = Math.floor(b.length / 48);
  for (let i = 0; i < count; i++) {
    out.push({
      mins: v3(r),
      maxs: v3(r),
      origin: v3(r),
      headNode: r.i32(),
      firstFace: r.i32(),
      numFaces: r.i32(),
    });
  }
  return out;
}

function readWorldLights(b: Uint8Array): BspWorldLight[] {
  const r = new BinaryReader(b);
  const out: BspWorldLight[] = [];
  const count = Math.floor(b.length / 88);
  for (let i = 0; i < count; i++) {
    out.push({
      origin: v3(r),
      intensity: v3(r),
      normal: v3(r),
      cluster: r.i32(),
      type: r.i32(),
      style: r.i32(),
      stopdot: r.f32(),
      stopdot2: r.f32(),
      exponent: r.f32(),
      radius: r.f32(),
      constantAttn: r.f32(),
      linearAttn: r.f32(),
      quadraticAttn: r.f32(),
      flags: r.i32(),
      texInfo: r.i32(),
      owner: r.i32(),
    });
  }
  return out;
}

function readBrushes(b: Uint8Array): BspBrushes {
  const count = Math.floor(b.length / 12);
  const view = viewOf(b);
  const out: BspBrushes = {
    count,
    firstSide: new Int32Array(count),
    numSides: new Int32Array(count),
    contents: new Int32Array(count),
  };
  for (let i = 0; i < count; i++) {
    out.firstSide[i] = view.getInt32(i * 12, true);
    out.numSides[i] = view.getInt32(i * 12 + 4, true);
    out.contents[i] = view.getInt32(i * 12 + 8, true);
  }
  return out;
}

function readBrushSides(b: Uint8Array): BspBrushSides {
  const count = Math.floor(b.length / 8);
  const view = viewOf(b);
  const out: BspBrushSides = {
    count,
    planeNum: new Uint16Array(count),
    texInfo: new Int16Array(count),
    dispInfo: new Int16Array(count),
    bevel: new Int16Array(count),
  };
  for (let i = 0; i < count; i++) {
    out.planeNum[i] = view.getUint16(i * 8, true);
    out.texInfo[i] = view.getInt16(i * 8 + 2, true);
    out.dispInfo[i] = view.getInt16(i * 8 + 4, true);
    out.bevel[i] = view.getInt16(i * 8 + 6, true);
  }
  return out;
}

const DISPINFO_SIZE = 176;

function readDispInfos(b: Uint8Array): BspDispInfo[] {
  const out: BspDispInfo[] = [];
  const count = Math.floor(b.length / DISPINFO_SIZE);
  for (let i = 0; i < count; i++) {
    const r = new BinaryReader(b, i * DISPINFO_SIZE);
    const startPosition = v3(r);
    const dispVertStart = r.i32();
    const dispTriStart = r.i32();
    const power = r.i32();
    const minTessRaw = r.u32();
    const smoothingAngle = r.f32();
    const contents = r.i32();
    const mapFace = r.u16();
    r.skip(2); // alignment
    const lightmapAlphaStart = r.i32();
    const lightmapSamplePositionStart = r.i32();
    const edgeNeighbors: DispSubNeighbor[][] = [];
    for (let e = 0; e < 4; e++) {
      const subs: DispSubNeighbor[] = [];
      for (let s = 0; s < 2; s++) {
        const neighbor = r.u16();
        const orientation = r.u8();
        const span = r.u8();
        const neighborSpan = r.u8();
        r.skip(1);
        subs.push({ neighbor, orientation, span, neighborSpan });
      }
      edgeNeighbors.push(subs);
    }
    const cornerNeighbors: number[][] = [];
    for (let c = 0; c < 4; c++) {
      const ids = [r.u16(), r.u16(), r.u16(), r.u16()];
      const n = r.u8();
      r.skip(1);
      cornerNeighbors.push(ids.slice(0, Math.min(n, 4)));
    }
    const allowedVerts = new Uint32Array(10);
    for (let k = 0; k < 10; k++) allowedVerts[k] = r.u32();
    // SDK: CCoreDispInfo::InitDispInfo — the high bit of minTess marks it as flags.
    const hasFlags = (minTessRaw & 0x80000000) !== 0;
    out.push({
      startPosition,
      dispVertStart,
      dispTriStart,
      power,
      minTess: hasFlags ? 0 : minTessRaw | 0,
      flags: hasFlags ? minTessRaw & 0x7fffffff : 0,
      smoothingAngle,
      contents,
      mapFace,
      lightmapAlphaStart,
      lightmapSamplePositionStart,
      edgeNeighbors,
      cornerNeighbors,
      allowedVerts,
    });
  }
  return out;
}

function readDispVerts(b: Uint8Array): BspDispVerts {
  const count = Math.floor(b.length / 20);
  const view = viewOf(b);
  const out: BspDispVerts = {
    count,
    vector: new Float32Array(count * 3),
    dist: new Float32Array(count),
    alpha: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const o = i * 20;
    out.vector[i * 3] = view.getFloat32(o, true);
    out.vector[i * 3 + 1] = view.getFloat32(o + 4, true);
    out.vector[i * 3 + 2] = view.getFloat32(o + 8, true);
    out.dist[i] = view.getFloat32(o + 12, true);
    out.alpha[i] = view.getFloat32(o + 16, true);
  }
  return out;
}

function readVisibility(b: Uint8Array): BspVisibility | null {
  if (b.length < 4) return null;
  const view = viewOf(b);
  const numClusters = view.getInt32(0, true);
  if (numClusters <= 0 || 4 + numClusters * 8 > b.length) return null;
  const bitOfs = new Int32Array(numClusters * 2);
  for (let i = 0; i < numClusters * 2; i++) bitOfs[i] = view.getInt32(4 + i * 4, true);
  return { numClusters, bitOfs, data: b };
}

/**
 * Decompresses one cluster's PVS (kind 0) or PAS (kind 1) row into a bit array
 * of numClusters bits (SDK: CM_DecompressVis — zero bytes are run-length coded).
 */
export function decompressVis(
  vis: BspVisibility,
  cluster: number,
  kind: 0 | 1 = 0,
  out?: Uint8Array,
): Uint8Array {
  const rowBytes = (vis.numClusters + 7) >> 3;
  const row = out && out.length >= rowBytes ? out : new Uint8Array(rowBytes);
  if (cluster < 0 || cluster >= vis.numClusters) {
    row.fill(0xff, 0, rowBytes); // outside the map: everything visible
    return row;
  }
  let inp = vis.bitOfs[cluster * 2 + kind];
  let o = 0;
  const d = vis.data;
  while (o < rowBytes && inp < d.length) {
    const c = d[inp++];
    if (c !== 0) {
      row[o++] = c;
      continue;
    }
    let run = d[inp++] ?? 0;
    while (run-- > 0 && o < rowBytes) row[o++] = 0;
  }
  while (o < rowBytes) row[o++] = 0;
  return row;
}

/** Whether `other` is in `cluster`'s PVS row (as decompressed by decompressVis). */
export const visTest = (row: Uint8Array, other: number): boolean =>
  other < 0 || (row[other >> 3] & (1 << (other & 7))) !== 0;

function readCubemaps(b: Uint8Array): BspCubemap[] {
  const view = viewOf(b);
  const out: BspCubemap[] = [];
  const count = Math.floor(b.length / 16);
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    out.push({
      origin: {
        x: view.getInt32(o, true),
        y: view.getInt32(o + 4, true),
        z: view.getInt32(o + 8, true),
      },
      size: view.getUint8(o + 12),
    });
  }
  return out;
}

function readOverlays(b: Uint8Array): BspOverlay[] {
  const out: BspOverlay[] = [];
  const size = 352;
  const count = Math.floor(b.length / size);
  for (let i = 0; i < count; i++) {
    const r = new BinaryReader(b, i * size);
    const id = r.i32();
    const texInfo = r.i16();
    const fc = r.u16();
    const faceCount = fc & 0x3fff;
    const faces: number[] = [];
    for (let k = 0; k < 64; k++) {
      const f = r.i32();
      if (k < faceCount) faces.push(f);
    }
    const u: [number, number] = [r.f32(), r.f32()];
    const v: [number, number] = [r.f32(), r.f32()];
    const uvPoints: [Vec3, Vec3, Vec3, Vec3] = [v3(r), v3(r), v3(r), v3(r)];
    out.push({
      id,
      texInfo,
      faceCount,
      renderOrder: fc >>> 14,
      faces,
      u,
      v,
      uvPoints,
      origin: v3(r),
      basisNormal: v3(r),
    });
  }
  return out;
}

function readLeafAmbient(indexLump: Uint8Array, lightingLump: Uint8Array): BspLeafAmbient | null {
  if (indexLump.length === 0 || lightingLump.length === 0) return null;
  const index = new Uint16Array(Math.floor(indexLump.length / 2));
  const iv = viewOf(indexLump);
  for (let i = 0; i < index.length; i++) index[i] = iv.getUint16(i * 2, true);
  const sampleCount = Math.floor(lightingLump.length / 28);
  const cubes = new Uint8Array(sampleCount * 24);
  const positions = new Uint8Array(sampleCount * 3);
  for (let i = 0; i < sampleCount; i++) {
    cubes.set(lightingLump.subarray(i * 28, i * 28 + 24), i * 24);
    positions[i * 3] = lightingLump[i * 28 + 24];
    positions[i * 3 + 1] = lightingLump[i * 28 + 25];
    positions[i * 3 + 2] = lightingLump[i * 28 + 26];
  }
  return { index, cubes, positions, sampleCount };
}

/** ColorRGBExp32 → linear float RGB (SDK: ColorRGBExp32ToVector). */
export function rgbExp32ToLinear(src: Uint8Array, offset: number, out: Vec3): Vec3 {
  const e = (src[offset + 3] << 24) >> 24; // signed
  const scale = Math.pow(2, e) / 255;
  out.x = src[offset] * scale;
  out.y = src[offset + 1] * scale;
  out.z = src[offset + 2] * scale;
  return out;
}

function readGameLumps(bytes: Uint8Array, info: BspLumpInfo): BspGameLump[] {
  if (info.length < 4) return [];
  const head = bytes.subarray(info.offset, info.offset + info.length);
  const view = viewOf(head);
  const count = view.getInt32(0, true);
  const dir: Array<{ id: number; flags: number; version: number; ofs: number; len: number }> = [];
  for (let i = 0; i < count; i++) {
    const o = 4 + i * 16;
    if (o + 16 > head.length) break;
    dir.push({
      id: view.getUint32(o, true),
      flags: view.getUint16(o + 4, true),
      version: view.getUint16(o + 6, true),
      ofs: view.getInt32(o + 8, true),
      len: view.getInt32(o + 12, true),
    });
  }
  const out: BspGameLump[] = [];
  for (let i = 0; i < dir.length; i++) {
    const g = dir[i];
    if (g.id === 0) continue; // terminating dummy entry of compressed maps
    const id = String.fromCharCode(
      (g.id >>> 24) & 0xff,
      (g.id >>> 16) & 0xff,
      (g.id >>> 8) & 0xff,
      g.id & 0xff,
    );
    let data: Uint8Array;
    if (g.flags & 1) {
      // GAMELUMPFLAG_COMPRESSED: filelen is the uncompressed size; the stored size
      // runs to the next entry's offset (the dummy entry marks the end).
      const next = dir.slice(i + 1).find((d) => d.ofs > g.ofs);
      const end = next ? next.ofs : info.offset + info.length;
      const raw = bytes.subarray(g.ofs, end);
      data = g.len > 0 && isValveLzma(raw) ? decodeValveLzma(raw) : new Uint8Array(0);
    } else {
      data = bytes.subarray(g.ofs, g.ofs + g.len);
    }
    out.push({ id, flags: g.flags, version: g.version, data });
  }
  return out;
}

/**
 * GAMELUMP_STATIC_PROPS, versions 4–11. The per-prop record size is derived
 * from the lump (it differs between branches sharing a version number), and
 * fields are read by version with that size as the tie-breaker.
 */
export function parseStaticProps(data: Uint8Array, version: number): StaticPropsLump | null {
  if (data.length < 12) return null;
  const r = new BinaryReader(data);
  const nDict = r.i32();
  const models: string[] = [];
  for (let i = 0; i < nDict; i++) models.push(r.fixedString(128));
  const nLeafs = r.i32();
  const leafs = new Uint16Array(nLeafs);
  for (let i = 0; i < nLeafs; i++) leafs[i] = r.u16();
  const nProps = r.i32();
  const props: StaticProp[] = [];
  if (nProps <= 0) return { version, recordSize: 0, models, leafs, props };
  const recordSize = Math.floor(r.remaining / nProps);
  for (let i = 0; i < nProps; i++) {
    const base = r.offset;
    const origin = v3(r);
    const angles = v3(r);
    const propType = r.u16();
    const firstLeaf = r.u16();
    const leafCount = r.u16();
    const solid = r.u8();
    let flags = r.u8(); // u8 flags in v4–v9 and CS:GO's v10; padding in the SDK 2013 v10 layout
    const skin = r.i32();
    const fadeMinDist = r.f32();
    const fadeMaxDist = r.f32();
    const lightingOrigin = v3(r); // ends at 56
    const p: StaticProp = {
      origin,
      angles,
      propType,
      model: models[propType] ?? '',
      firstLeaf,
      leafCount,
      solid,
      flags,
      skin,
      fadeMinDist,
      fadeMaxDist,
      lightingOrigin,
      forcedFadeScale: 1,
      minDxLevel: 0,
      maxDxLevel: 0,
      minCpuLevel: 0,
      maxCpuLevel: 0,
      minGpuLevel: 0,
      maxGpuLevel: 0,
      diffuseModulation: [255, 255, 255, 255],
      lightmapResX: 0,
      lightmapResY: 0,
      uniformScale: 1,
    };
    if (version >= 5 && recordSize >= 60) p.forcedFadeScale = r.f32();
    if (version === 6 || version === 7 || (version === 10 && recordSize === 72)) {
      if (recordSize >= 64) {
        p.minDxLevel = r.u16();
        p.maxDxLevel = r.u16();
      }
    } else if (version >= 8 && recordSize >= 64) {
      p.minCpuLevel = r.u8();
      p.maxCpuLevel = r.u8();
      p.minGpuLevel = r.u8();
      p.maxGpuLevel = r.u8();
    }
    if (version === 10 && recordSize === 72) {
      // SDK 2013 (TF2) StaticPropLump_t: u32 flags + lightmap resolution.
      flags = r.u32();
      p.lightmapResX = r.u16();
      p.lightmapResY = r.u16();
    } else if (version >= 7 && r.offset - base + 4 <= recordSize) {
      p.diffuseModulation = [r.u8(), r.u8(), r.u8(), r.u8()];
      if (version >= 9 && r.offset - base + 4 <= recordSize) r.skip(4); // bDisableX360 (+pad)
      if (version >= 10 && r.offset - base + 4 <= recordSize) flags |= r.u32() << 8; // FlagsEx
      if (version >= 11 && r.offset - base + 4 <= recordSize) p.uniformScale = r.f32();
    }
    p.flags = flags >>> 0;
    r.seek(base + recordSize);
    props.push(p);
  }
  return { version, recordSize, models, leafs, props };
}

function readU16(b: Uint8Array): Uint16Array {
  const out = new Uint16Array(Math.floor(b.length / 2));
  const view = viewOf(b);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

function readI32(b: Uint8Array): Int32Array {
  const out = new Int32Array(Math.floor(b.length / 4));
  const view = viewOf(b);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt32(i * 4, true);
  return out;
}

function readF32(b: Uint8Array): Float32Array {
  const out = new Float32Array(Math.floor(b.length / 4));
  const view = viewOf(b);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/** Parses a whole BSP. Throws on a bad header or unsupported version. */
export function parseBsp(bytes: Uint8Array): BspFile {
  const view = viewOf(bytes);
  if (bytes.length < 8 + HEADER_LUMPS * 16 + 4 || view.getUint32(0, true) !== BSP_IDENT) {
    throw new Error('bsp: not a VBSP file');
  }
  const version = view.getInt32(4, true);
  if (version < 19 || version > 21) throw new Error(`bsp: unsupported version ${version}`);
  const lumps: BspLumpInfo[] = [];
  for (let i = 0; i < HEADER_LUMPS; i++) lumps.push(readLumpInfo(view, i));
  const mapRevision = view.getInt32(8 + HEADER_LUMPS * 16, true);
  const L = (i: number): Uint8Array => lumpBytes(bytes, lumps[i]);

  const entityText = decodeText(L(LUMP.ENTITIES)).replace(/\0+$/, '');
  const texDataStrings = readTexDataStrings(
    L(LUMP.TEXDATA_STRING_DATA),
    L(LUMP.TEXDATA_STRING_TABLE),
  );

  const gameLumps = readGameLumps(bytes, lumps[LUMP.GAME_LUMP]);
  const sprp = gameLumps.find((g) => g.id === 'sprp');
  const mapFlagsLump = L(LUMP.MAP_FLAGS);

  const bsp: BspFile = {
    version,
    mapRevision,
    lumps,
    entityText,
    entities: parseEntityLump(entityText),
    planes: readPlanes(L(LUMP.PLANES)),
    texData: readTexData(L(LUMP.TEXDATA), texDataStrings),
    texDataStrings,
    vertexes: readF32(L(LUMP.VERTEXES)),
    visibility: readVisibility(L(LUMP.VISIBILITY)),
    nodes: readNodes(L(LUMP.NODES)),
    texInfo: readTexInfo(L(LUMP.TEXINFO)),
    faces: readFaces(L(LUMP.FACES)),
    facesHdr: readFaces(L(LUMP.FACES_HDR)),
    originalFaces: readFaces(L(LUMP.ORIGINALFACES)),
    lighting: EMPTY,
    lightingHdr: EMPTY,
    leafs: readLeafs(L(LUMP.LEAFS), lumps[LUMP.LEAFS].version, version),
    edges: readU16(L(LUMP.EDGES)),
    surfEdges: readI32(L(LUMP.SURFEDGES)),
    models: readModels(L(LUMP.MODELS)),
    worldLights: readWorldLights(L(LUMP.WORLDLIGHTS)),
    worldLightsHdr: readWorldLights(L(LUMP.WORLDLIGHTS_HDR)),
    leafFaces: readU16(L(LUMP.LEAFFACES)),
    leafBrushes: readU16(L(LUMP.LEAFBRUSHES)),
    brushes: readBrushes(L(LUMP.BRUSHES)),
    brushSides: readBrushSides(L(LUMP.BRUSHSIDES)),
    dispInfos: readDispInfos(L(LUMP.DISPINFO)),
    dispVerts: readDispVerts(L(LUMP.DISP_VERTS)),
    dispTris: readU16(L(LUMP.DISP_TRIS)),
    leafAmbientLdr: readLeafAmbient(L(LUMP.LEAF_AMBIENT_INDEX), L(LUMP.LEAF_AMBIENT_LIGHTING)),
    leafAmbientHdr: readLeafAmbient(
      L(LUMP.LEAF_AMBIENT_INDEX_HDR),
      L(LUMP.LEAF_AMBIENT_LIGHTING_HDR),
    ),
    gameLumps,
    staticProps: sprp ? parseStaticProps(sprp.data, sprp.version) : null,
    pakfile: L(LUMP.PAKFILE),
    cubemaps: readCubemaps(L(LUMP.CUBEMAPS)),
    overlays: readOverlays(L(LUMP.OVERLAYS)),
    faceMacroTextureInfo: readU16(L(LUMP.FACE_MACRO_TEXTURE_INFO)),
    mapFlags: mapFlagsLump.length >= 4 ? viewOf(mapFlagsLump).getUint32(0, true) : 0,
  };
  // The lightmap lumps are the bulk of a compressed map (≈2/3 of the LZMA work
  // on ctf_2fort) and only the renderer needs them, so they decode on first use.
  lazyLump(bsp, 'lighting', () => L(LUMP.LIGHTING));
  lazyLump(bsp, 'lightingHdr', () => L(LUMP.LIGHTING_HDR));
  return bsp;
}

const EMPTY = new Uint8Array(0);

function lazyLump(bsp: BspFile, key: 'lighting' | 'lightingHdr', load: () => Uint8Array): void {
  let cached: Uint8Array | null = null;
  Object.defineProperty(bsp, key, {
    enumerable: true,
    configurable: true,
    get: () => (cached ??= load()),
    set: (v: Uint8Array) => {
      cached = v;
    },
  });
}

/** Opens the pakfile lump as a zip. */
export function openPakfile(bsp: BspFile): ZipArchive {
  return parseZip(bsp.pakfile);
}

/** Material name of a texinfo (via texdata → string table), '' if none. */
export function texInfoMaterial(bsp: BspFile, texInfo: number): string {
  if (texInfo < 0 || texInfo >= bsp.texInfo.length) return '';
  const td = bsp.texData[bsp.texInfo[texInfo].texData];
  return td ? td.name : '';
}

/** The polygon of a face as vertex indices, in winding order (SDK: surfedges sign convention). */
export function faceVertexIndices(bsp: BspFile, face: BspFace, out: number[] = []): number[] {
  out.length = 0;
  for (let i = 0; i < face.numEdges; i++) {
    const se = bsp.surfEdges[face.firstEdge + i];
    out.push(se >= 0 ? bsp.edges[se * 2] : bsp.edges[-se * 2 + 1]);
  }
  return out;
}

/** Leaf index containing a point (walks the tree from `headNode`). */
export function findLeaf(bsp: BspFile, p: Vec3, headNode = 0): number {
  const { nodes, planes } = bsp;
  let n = headNode;
  while (n >= 0) {
    const pl = nodes.planeNum[n];
    const d =
      planes.normal[pl * 3] * p.x +
      planes.normal[pl * 3 + 1] * p.y +
      planes.normal[pl * 3 + 2] * p.z -
      planes.dist[pl];
    n = nodes.children[n * 2 + (d >= 0 ? 0 : 1)];
  }
  return -1 - n;
}
