/**
 * Working on the animation data of a model channel GLB without keeping all of it.
 *
 * A model's anim pack holds every Source sequence of the model as a glTF animation (HL2 humans ~1500, TF2 classes
 * ~720; up to ~14 MB decoded). Hearthworks plays ten of them. So the pack is cut BEFORE it is parsed
 * (`filterGlbAnimations` rewrites the GLB's JSON chunk to list only the wanted animations; the binary chunk is
 * untouched and the unlisted accessors are simply never read), which bounds both the parse time and the memory
 * the parser holds. What is left is then adapted to the game: trimmed to a frame window, rebased from a delta layer
 * onto the idle pose, kept in place, and limited to the bones the mesh actually has.
 *
 * Three.js only (no renderer): everything here is unit-tested in node.
 */

import {
  AnimationClip,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from 'three';

// --- the GLB container ----------------------------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export interface GlbAnimationMeta {
  name: string;
  /** The animation's glTF `extras`: fps, frames, looping, delta, source, movement[], groundSpeed. */
  extras: Record<string, unknown>;
}

interface GltfJson {
  animations?: Array<{
    name?: string;
    extras?: Record<string, unknown>;
    samplers?: Array<{ input: number; output: number }>;
  }>;
  scenes?: Array<{ extras?: unknown }>;
  accessors?: Array<{ bufferView?: number; sparse?: { indices: { bufferView: number }; values: { bufferView: number } } }>;
  bufferViews?: unknown[];
  skins?: Array<{ inverseBindMatrices?: number }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number; targets?: Array<Record<string, number>> }> }>;
  images?: Array<{ bufferView?: number }>;
  [k: string]: unknown;
}

/**
 * Drop the accessors (and the buffer views only they use) that nothing left in the file reads. A model's anim pack
 * lists ~50 000 accessors for its ~1500 sequences: with the sequences gone they are most of the JSON, which the loader
 * would otherwise parse and hold for nothing. The binary chunk keeps its bytes (they are simply never read).
 * Anything unfamiliar (extensions that could point at accessors) leaves the file alone.
 */
function pruneUnusedAccessors(json: GltfJson): void {
  const accessors = json.accessors;
  if (!accessors || json.extensions || json.extensionsRequired) return;
  const used = new Set<number>();
  for (const a of json.animations ?? []) for (const sm of a.samplers ?? []) used.add(sm.input).add(sm.output);
  for (const sk of json.skins ?? []) if (typeof sk.inverseBindMatrices === 'number') used.add(sk.inverseBindMatrices);
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      for (const i of Object.values(p.attributes ?? {})) used.add(i);
      if (typeof p.indices === 'number') used.add(p.indices);
      for (const t of p.targets ?? []) for (const i of Object.values(t)) used.add(i);
    }
  }
  const remap = new Map<number, number>();
  const kept: typeof accessors = [];
  [...used].sort((x, y) => x - y).forEach((old) => {
    if (accessors[old]) {
      remap.set(old, kept.length);
      kept.push(accessors[old]);
    }
  });

  const views = json.bufferViews ?? [];
  const viewsUsed = new Set<number>();
  for (const a of kept) {
    if (typeof a.bufferView === 'number') viewsUsed.add(a.bufferView);
    if (a.sparse) viewsUsed.add(a.sparse.indices.bufferView).add(a.sparse.values.bufferView);
  }
  for (const im of json.images ?? []) if (typeof im.bufferView === 'number') viewsUsed.add(im.bufferView);
  const viewMap = new Map<number, number>();
  const keptViews: unknown[] = [];
  [...viewsUsed].sort((x, y) => x - y).forEach((old) => {
    if (views[old] !== undefined) {
      viewMap.set(old, keptViews.length);
      keptViews.push(views[old]);
    }
  });

  const to = (i: number) => remap.get(i) ?? i;
  for (const a of json.animations ?? []) {
    for (const sm of a.samplers ?? []) {
      sm.input = to(sm.input);
      sm.output = to(sm.output);
    }
  }
  for (const sk of json.skins ?? []) if (typeof sk.inverseBindMatrices === 'number') sk.inverseBindMatrices = to(sk.inverseBindMatrices);
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      for (const [k, i] of Object.entries(p.attributes ?? {})) p.attributes![k] = to(i);
      if (typeof p.indices === 'number') p.indices = to(p.indices);
      for (const t of p.targets ?? []) for (const [k, i] of Object.entries(t)) t[k] = to(i);
    }
  }
  const vto = (i: number) => viewMap.get(i) ?? i;
  for (const a of kept) {
    if (typeof a.bufferView === 'number') a.bufferView = vto(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = vto(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = vto(a.sparse.values.bufferView);
    }
  }
  for (const im of json.images ?? []) if (typeof im.bufferView === 'number') im.bufferView = vto(im.bufferView);
  json.accessors = kept;
  json.bufferViews = keptViews;
}

/**
 * Rewrite a GLB so its JSON lists only the animations named in `keep`. Returns the new buffer and the extras of the
 * animations that were kept (in file order), or null when `buf` is not a GLB. Names not in the file are just absent
 * from the result. The scene extras (sequence tables, hitboxes: hundreds of KB) are dropped too.
 */
export function filterGlbAnimations(
  buf: ArrayBuffer,
  keep: ReadonlySet<string>,
): { buffer: ArrayBuffer; kept: GlbAnimationMeta[] } | null {
  if (buf.byteLength < 28) return null;
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) return null;
  const total = Math.min(view.getUint32(8, true), buf.byteLength);
  const jsonLen = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLen > total) return null;

  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson;
  } catch {
    return null;
  }

  // The BIN chunk, if any, follows the JSON chunk.
  let binStart = 0;
  let binLen = 0;
  const next = 20 + jsonLen;
  if (next + 8 <= total && view.getUint32(next + 4, true) === CHUNK_BIN) {
    binLen = Math.min(view.getUint32(next, true), total - next - 8);
    binStart = next + 8;
  }

  const kept: GlbAnimationMeta[] = [];
  const animations = (json.animations ?? []).filter((a) => {
    if (!a.name || !keep.has(a.name)) return false;
    kept.push({ name: a.name, extras: (a.extras ?? {}) as Record<string, unknown> });
    return true;
  });
  json.animations = animations;
  for (const s of json.scenes ?? []) delete s.extras;
  pruneUnusedAccessors(json);

  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (enc.length % 4)) % 4;
  const jsonChunkLen = enc.length + jsonPad;
  const out = new Uint8Array(12 + 8 + jsonChunkLen + (binLen ? 8 + binLen : 0));
  const ov = new DataView(out.buffer);
  ov.setUint32(0, GLB_MAGIC, true);
  ov.setUint32(4, 2, true);
  ov.setUint32(8, out.length, true);
  ov.setUint32(12, jsonChunkLen, true);
  ov.setUint32(16, CHUNK_JSON, true);
  out.set(enc, 20);
  out.fill(0x20, 20 + enc.length, 20 + jsonChunkLen);
  if (binLen) {
    const at = 20 + jsonChunkLen;
    ov.setUint32(at, binLen, true);
    ov.setUint32(at + 4, CHUNK_BIN, true);
    out.set(new Uint8Array(buf, binStart, binLen), at + 8);
  }
  return { buffer: out.buffer, kept };
}

// --- clips ------------------------------------------------------------------------------------------------------------

const SPLIT = (trackName: string): [string, string] => {
  const dot = trackName.lastIndexOf('.');
  return [trackName.slice(0, dot), trackName.slice(dot + 1)];
};

type Evaluate = { evaluate(t: number): ArrayLike<number> };

/** A sampler of a track (typed here: three's own types do not declare `createInterpolant`, which every track has). */
function sampler(track: KeyframeTrack): Evaluate {
  const t = track as KeyframeTrack & { createInterpolant(result?: ArrayLike<number>): Evaluate };
  return t.createInterpolant(new (track.ValueBufferType as new (n: number) => Float32Array)(track.getValueSize()));
}

const copyTrack = (t: KeyframeTrack, name = t.name): KeyframeTrack =>
  new (t.constructor as new (n: string, ti: ArrayLike<number>, v: ArrayLike<number>) => KeyframeTrack)(
    name,
    Array.from(t.times),
    Array.from(t.values),
  );

/** Bytes of keyframe data in a clip (what keeping it costs). */
export function clipBytes(clip: AnimationClip): number {
  let n = 0;
  for (const t of clip.tracks) n += t.times.byteLength + t.values.byteLength;
  return n;
}

/**
 * A copy of `clip` named `name` that holds only `[from, to]` seconds, starting at 0. Every track is sampled at both
 * ends (a bone whose keys all fall outside the window still gets its pose), so a window cut from the middle of a
 * longer sequence keeps its first and last poses.
 */
export function trimClip(clip: AnimationClip, name: string, from: number, to: number): AnimationClip {
  const start = Math.max(0, from);
  const end = Math.max(start + 1 / 120, to);
  const tracks: KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const size = track.getValueSize();
    const interp = sampler(track);
    const times: number[] = [0];
    const values: number[] = Array.from(interp.evaluate(start));
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (t <= start + 1e-6 || t >= end - 1e-6) continue;
      times.push(t - start);
      for (let k = 0; k < size; k++) values.push(track.values[i * size + k]);
    }
    times.push(end - start);
    values.push(...Array.from(interp.evaluate(end)));
    tracks.push(
      new (track.constructor as new (n: string, ti: ArrayLike<number>, v: ArrayLike<number>) => KeyframeTrack)(
        track.name,
        times,
        values,
      ),
    );
  }
  return new AnimationClip(name, end - start, tracks);
}

/** Only the tracks whose node is in `nodes` (names as three sanitises them): a track for a bone the mesh lacks would warn at bind time. */
export function onlyNodes(clip: AnimationClip, nodes: ReadonlySet<string>, name = clip.name): AnimationClip {
  const tracks = clip.tracks.filter((t) => nodes.has(SPLIT(t.name)[0])).map((t) => copyTrack(t));
  const out = new AnimationClip(name, clip.duration, tracks);
  out.userData = clip.userData;
  return out;
}

/**
 * Keep the root bone from travelling along the ground: the figure's position moves, the pelvis must not walk away from
 * it. Each root `.position` track loses the straight line from its first to its last key in the horizontal plane (x, z;
 * the posed frame is Y-up), which keeps the sway and bounce of the gait. Drift under 1 cm is left alone. Mutates `clip`.
 */
export function keepInPlace(clip: AnimationClip, rootNames: ReadonlySet<string>): number {
  let removed = 0;
  for (const t of clip.tracks) {
    const [node, prop] = SPLIT(t.name);
    if (prop !== 'position' || !rootNames.has(node) || t.times.length < 2) continue;
    const n = t.times.length;
    const v = t.values;
    const dx = v[(n - 1) * 3] - v[0];
    const dz = v[(n - 1) * 3 + 2] - v[2];
    const drift = Math.hypot(dx, dz);
    if (!(drift > 0.01)) continue;
    const t0 = t.times[0];
    const span = t.times[n - 1] - t0 || 1;
    for (let i = 0; i < n; i++) {
      const f = (t.times[i] - t0) / span;
      v[i * 3] -= dx * f;
      v[i * 3 + 2] -= dz * f;
    }
    removed = Math.max(removed, drift);
  }
  return removed;
}

/** One bone's local transform. */
export interface BonePose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

/** The local transforms of all bones under `root`, by node name. */
export function capturePose(bones: Iterable<Object3D>): Map<string, BonePose> {
  const out = new Map<string, BonePose>();
  for (const b of bones) {
    out.set(b.name, {
      position: [b.position.x, b.position.y, b.position.z],
      quaternion: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
    });
  }
  return out;
}

/**
 * Put `nodes` into the pose a clip has at time `t` (no mixer, so nothing to undo): the model's standing pose is the
 * idle at t=0, the pose clones start in and the one a held prop is aligned to. Nodes the clip does not animate keep
 * their transform.
 */
export function applyClipPose(nodes: ReadonlyMap<string, Object3D>, clip: AnimationClip, t: number): void {
  for (const track of clip.tracks) {
    const [name, prop] = SPLIT(track.name);
    const node = nodes.get(name);
    if (!node) continue;
    const v = sampler(track).evaluate(t);
    if (prop === 'position') node.position.fromArray(v);
    else if (prop === 'quaternion') node.quaternion.fromArray(v);
    else if (prop === 'scale') node.scale.fromArray(v);
  }
}

/** Put `nodes` back into a pose captured with `capturePose`. */
export function restorePose(nodes: ReadonlyMap<string, Object3D>, pose: ReadonlyMap<string, BonePose>): void {
  for (const [name, p] of pose) {
    const node = nodes.get(name);
    if (!node) continue;
    node.position.fromArray(p.position);
    node.quaternion.fromArray(p.quaternion);
  }
}

const qa = new Quaternion();
const qb = new Quaternion();

/**
 * Turn a delta layer (Source's additive sequences: aim matrices, flinches, recoil: offsets from the identity) into an
 * absolute clip over a standing pose, which is what the animator blends. Source composes a layer's rotation as
 * `delta * base` and adds its translation; every bone the layer does not touch is held at the base pose, so the clip
 * is a full-body pose like any other and the animator's weights keep summing to a whole body.
 */
export function rebaseDelta(
  delta: AnimationClip,
  name: string,
  base: ReadonlyMap<string, BonePose>,
  rootNames: ReadonlySet<string>,
): AnimationClip {
  const byNode = new Map<string, { q?: KeyframeTrack; p?: KeyframeTrack }>();
  for (const t of delta.tracks) {
    const [node, prop] = SPLIT(t.name);
    const slot = byNode.get(node) ?? {};
    if (prop === 'quaternion') slot.q = t;
    else if (prop === 'position') slot.p = t;
    byNode.set(node, slot);
  }
  const tracks: KeyframeTrack[] = [];
  for (const [node, pose] of base) {
    const d = byNode.get(node);
    if (d?.q) {
      const times = Array.from(d.q.times);
      const values: number[] = [];
      qb.fromArray(pose.quaternion);
      for (let i = 0; i < times.length; i++) {
        qa.fromArray(d.q.values, i * 4);
        qa.multiply(qb).normalize();
        values.push(qa.x, qa.y, qa.z, qa.w);
      }
      tracks.push(new QuaternionKeyframeTrack(`${node}.quaternion`, times, values));
    } else {
      tracks.push(new QuaternionKeyframeTrack(`${node}.quaternion`, [0], [...pose.quaternion]));
    }
    if (d?.p) {
      const times = Array.from(d.p.times);
      const values: number[] = [];
      for (let i = 0; i < times.length; i++) {
        values.push(pose.position[0] + d.p.values[i * 3], pose.position[1] + d.p.values[i * 3 + 1], pose.position[2] + d.p.values[i * 3 + 2]);
      }
      tracks.push(new VectorKeyframeTrack(`${node}.position`, times, values));
    } else if (rootNames.has(node)) {
      tracks.push(new VectorKeyframeTrack(`${node}.position`, [0], [...pose.position]));
    }
  }
  return new AnimationClip(name, delta.duration, tracks);
}

/** The node name three.js gives a node called `name` (the dots and spaces of Source bone names are dropped). */
export const nodeName = (name: string): string => PropertyBinding.sanitizeNodeName(name);

/** Duration of a clip whose tracks are all single keys (a static pose): the sequence's own length, never zero. */
export function poseDuration(extras: Record<string, unknown>): number {
  const fps = typeof extras.fps === 'number' && extras.fps > 0 ? extras.fps : 30;
  const frames = typeof extras.frames === 'number' && extras.frames > 1 ? extras.frames : 1;
  return Math.max(1 / 30, (frames - 1) / fps);
}
