/**
 * Choreographed scenes (.vcd) as the games ship them: every scene compiled to
 * binary and packed into `scenes/scenes.image`.
 *
 * - The image (SDK: public/scenefilecache/SceneImageFile.h): a header
 *   ('VSIF', version 2, scene count, string count, entry offset), a string
 *   pool shared by every scene, and one entry per scene keyed by the CRC-32 of
 *   its normalized name (`scenes\dir\name.vcd`, lower case, backslashes —
 *   SDK: CSceneImage::CreateSceneImageFile). Scene data may be Valve-LZMA.
 * - A compiled scene (SDK: CChoreoScene::RestoreFromBinaryBuffer and the
 *   RestoreFromBuffer of its events, actors and channels): 'bvcd', version 4,
 *   a CRC, the scene-level events, the actors with their channels and
 *   events, the scene ramp and the ignore-phonemes flag.
 *
 * Only what the simulation plays is kept: event type, name, times, the three
 * parameter strings, flags, the close caption token, and loop counts. Flex
 * tracks and ramps are read past. Pure and environment-agnostic.
 */

import { decodeValveLzma, isValveLzma } from '../../tf2-game/formats/lzma';

/** CChoreoEvent::EVENTTYPE (choreoevent.h). */
export const VCD_EVENT = {
  UNSPECIFIED: 0,
  SECTION: 1,
  EXPRESSION: 2,
  LOOKAT: 3,
  MOVETO: 4,
  SPEAK: 5,
  GESTURE: 6,
  SEQUENCE: 7,
  FACE: 8,
  FIRETRIGGER: 9,
  FLEXANIMATION: 10,
  SUBSCENE: 11,
  LOOP: 12,
  INTERRUPT: 13,
  STOPPOINT: 14,
  PERMIT_RESPONSES: 15,
  GENERIC: 16,
} as const;

export const VCD_EVENT_NAMES = [
  'unspecified',
  'section',
  'expression',
  'lookat',
  'moveto',
  'speak',
  'gesture',
  'sequence',
  'face',
  'firetrigger',
  'flexanimation',
  'subscene',
  'loop',
  'interrupt',
  'stoppoint',
  'permit_responses',
  'generic',
] as const;

export interface VcdEvent {
  type: number;
  name: string;
  start: number;
  /** −1 for events with no duration. */
  end: number;
  param1: string;
  param2: string;
  param3: string;
  /** Actor name ('' for scene-level events). */
  actor: string;
  channel: string;
  /** Close caption token of a speak event ('' = use the sound name). */
  ccToken: string;
  /** CLOSECAPTION type of a speak event (0 master, 1 slave, 2 disabled). */
  ccType: number;
  /** Loop count of a LOOP event (−1 forever). */
  loopCount: number;
  active: boolean;
  resumeCondition: boolean;
}

export interface VcdScene {
  events: VcdEvent[];
  actors: string[];
  /** The last event end (CChoreoScene::FindStopTime). */
  duration: number;
}

const SCENE_IMAGE_ID = 0x46495356; // 'VSIF'
const BVCD_TAG = 0x64637662; // 'bvcd'

// --- CRC-32 (IEEE, CRC32_ProcessSingleBuffer) -------------------------------------

let crcTable: Uint32Array | null = null;
function crc32(text: string): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) crc = crcTable[(crc ^ text.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The image's key for a scene path ("scenes/test_chamber/ai_00_a_entry.vcd"). */
export function sceneImageKey(path: string): number {
  let p = path.toLowerCase().replace(/\//g, '\\');
  const i = p.indexOf('scenes\\');
  if (i > 0) p = p.slice(i);
  else if (i < 0) p = `scenes\\${p}`;
  return crc32(p);
}

/** A parsed scenes.image: look scenes up by path, decoded lazily and cached. */
export class SceneImage {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly strings: string[] = [];
  private readonly entries = new Map<number, { offset: number; length: number }>();
  private readonly cache = new Map<number, VcdScene | null>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const v = this.view;
    if (bytes.length < 20 || v.getUint32(0, true) !== SCENE_IMAGE_ID) throw new Error('scenes.image: bad id');
    const numScenes = v.getInt32(8, true);
    const numStrings = v.getInt32(12, true);
    const entryOffset = v.getInt32(16, true);
    const dec = new TextDecoder('latin1');
    for (let i = 0; i < numStrings; i++) {
      const off = v.getUint32(20 + i * 4, true);
      let end = off;
      while (end < bytes.length && bytes[end] !== 0) end++;
      this.strings.push(dec.decode(bytes.subarray(off, end)));
    }
    for (let i = 0; i < numScenes; i++) {
      const o = entryOffset + i * 16;
      if (o + 16 > bytes.length) break;
      this.entries.set(v.getUint32(o, true), { offset: v.getInt32(o + 4, true), length: v.getInt32(o + 8, true) });
    }
  }

  get sceneCount(): number {
    return this.entries.size;
  }

  has(path: string): boolean {
    return this.entries.has(sceneImageKey(path));
  }

  /** The scene at `path`, or null when the image does not hold it or it cannot be read. */
  scene(path: string): VcdScene | null {
    const key = sceneImageKey(path);
    if (this.cache.has(key)) return this.cache.get(key)!;
    const e = this.entries.get(key);
    let out: VcdScene | null = null;
    if (e && e.offset >= 0 && e.offset + e.length <= this.bytes.length) {
      let data = this.bytes.subarray(e.offset, e.offset + e.length);
      try {
        if (isValveLzma(data)) data = decodeValveLzma(data);
        out = parseBinaryVcd(data, (i) => this.strings[i] ?? '');
      } catch {
        out = null;
      }
    }
    this.cache.set(key, out);
    return out;
  }
}

/** SDK: CChoreoScene::RestoreFromBinaryBuffer (version 4). */
export function parseBinaryVcd(data: Uint8Array, str: (index: number) => string): VcdScene {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  const need = (n: number): void => {
    if (p + n > data.length) throw new Error('vcd: truncated');
  };
  const u8 = (): number => {
    need(1);
    return data[p++];
  };
  const i8 = (): number => {
    need(1);
    return v.getInt8(p++);
  };
  const i16 = (): number => {
    need(2);
    const x = v.getInt16(p, true);
    p += 2;
    return x;
  };
  const u16 = (): number => {
    need(2);
    const x = v.getUint16(p, true);
    p += 2;
    return x;
  };
  const i32 = (): number => {
    need(4);
    const x = v.getInt32(p, true);
    p += 4;
    return x;
  };
  const f32 = (): number => {
    need(4);
    const x = v.getFloat32(p, true);
    p += 4;
    return x;
  };
  const s = (): string => str(i16());

  if (i32() !== BVCD_TAG) throw new Error('vcd: not bvcd');
  if (u8() !== 4) throw new Error('vcd: unsupported version');
  i32(); // crc

  const curve = (): void => {
    const c = u8();
    p += c * 5;
    need(0);
  };

  const readEvent = (actor: string, channel: string): VcdEvent => {
    const type = i8();
    const name = s();
    const start = f32();
    const end = f32();
    const param1 = s();
    const param2 = s();
    const param3 = s();
    curve(); // ramp
    const flags = u8();
    f32(); // distance to target
    const rel = u8();
    for (let i = 0; i < rel; i++) {
      i16();
      u8();
    }
    const timing = u8();
    for (let i = 0; i < timing; i++) {
      i16();
      u8();
    }
    for (let t = 0; t < 2; t++) {
      const n = u8();
      for (let i = 0; i < n; i++) {
        i16();
        u16();
      }
    }
    if (type === VCD_EVENT.GESTURE) f32();
    if (i8() === 1) {
      i16();
      i16();
    }
    // Flex animation tracks.
    const tracks = u8();
    for (let i = 0; i < tracks; i++) {
      i16();
      const tf = u8();
      f32();
      f32();
      const n = i16();
      p += n * 7;
      need(0);
      if (tf & 2) {
        const m = u16();
        p += m * 7;
        need(0);
      }
    }
    let loopCount = 0;
    if (type === VCD_EVENT.LOOP) loopCount = i8();
    let ccType = 0;
    let ccToken = '';
    if (type === VCD_EVENT.SPEAK) {
      ccType = i8();
      ccToken = s();
      i8();
    }
    return {
      type,
      name,
      start,
      end,
      param1,
      param2,
      param3,
      actor,
      channel,
      ccToken,
      ccType,
      loopCount,
      active: (flags & 8) !== 0,
      resumeCondition: (flags & 1) !== 0,
    };
  };

  const events: VcdEvent[] = [];
  const actors: string[] = [];
  const sceneEvents = u8();
  for (let i = 0; i < sceneEvents; i++) events.push(readEvent('', ''));
  const actorCount = u8();
  for (let a = 0; a < actorCount; a++) {
    const actor = s();
    actors.push(actor);
    const channels = u8();
    for (let c = 0; c < channels; c++) {
      const channel = s();
      const n = u8();
      for (let i = 0; i < n; i++) events.push(readEvent(actor, channel));
      i8(); // channel active
    }
    i8(); // actor active
  }
  let duration = 0;
  for (const e of events) duration = Math.max(duration, e.end >= 0 ? e.end : e.start);
  events.sort((a, b) => a.start - b.start);
  return { events, actors, duration };
}
