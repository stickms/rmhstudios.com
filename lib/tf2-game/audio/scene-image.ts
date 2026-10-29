/**
 * `scenes/scenes.image` (SDK: public/scenefilecache/SceneImageFile.h, game/shared/sceneimage.cpp)
 * — every compiled choreographed scene of HL2 / Portal in one file:
 *
 *   header   {'VSIF', version 2, numScenes, numStrings, sceneEntryOffset}
 *   strings  numStrings × u32 offsets into the string pool that follows
 *   entries  numScenes × {crc32 of `scenes\…\x.vcd`, dataOffset, dataLength, summaryOffset},
 *            sorted by CRC
 *   summary  {msecs, numSounds, soundStrings[numSounds]}: the scene's duration and the sounds
 *            its speak events play (plus master caption tokens)
 *   data     the compiled scene (`bvcd` v4, LZMA-compressed when that is smaller)
 *
 * The browser does not load the image: the sound exporter reads it (with the speak events'
 * start times) into snd/scenes.json. This reader is for tools and tests.
 */
import { crc32 } from './crc32';

export const SCENE_IMAGE_ID = 0x46495356; // 'VSIF'

export interface SceneSummary {
  /** Seconds. */
  duration: number;
  sounds: string[];
}

/** `snd/scenes.json` — written by scripts/tf2-game/sounds.py for HL2 and Portal. */
export interface SceneSpeakEvent {
  /** The scene's actor name (`Aperture_AI`, `!Target1`, …). */
  actor: string;
  /** Sound script entry played (on the actor, CHAN_VOICE). */
  sound: string;
  /** Seconds from the scene's start. */
  start: number;
  end: number;
  /** Caption token when it differs from `sound`. */
  cc?: string;
  /** CChoreoEvent::CLOSECAPTION: 0 master (default), 1 slave (no caption), 2 disabled. */
  ccType?: number;
}

export interface SceneDocument {
  v: 1;
  /** Lowercase `scenes/…/x.vcd` → its speak events. */
  scenes: Record<string, { duration: number; speak: SceneSpeakEvent[] }>;
}

/** The directory key of a scene file: CRC32 of `scenes\…\x.vcd`, lowercase, backslashes. */
export function sceneCrc(path: string): number {
  let p = path.replace(/\//g, '\\').toLowerCase();
  const i = p.indexOf('scenes\\');
  p = i >= 0 ? p.slice(i) : 'scenes\\' + p;
  if (!p.endsWith('.vcd')) p = p.replace(/\.[^.\\]*$/, '') + '.vcd';
  return crc32(p);
}

/** Lowercase forward-slash key of a scene file, as scenes.json uses. */
export function sceneKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

export class SceneImage {
  readonly version: number;
  readonly sceneCount: number;
  private readonly view: DataView;
  private readonly stringOffsets: Uint32Array;
  private readonly entries = new Map<number, { data: number; length: number; summary: number }>();

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (this.view.getUint32(0, true) !== SCENE_IMAGE_ID) throw new Error('scenes.image: bad id');
    this.version = this.view.getInt32(4, true);
    this.sceneCount = this.view.getInt32(8, true);
    const strings = this.view.getInt32(12, true);
    const entryAt = this.view.getInt32(16, true);
    this.stringOffsets = new Uint32Array(strings);
    for (let i = 0; i < strings; i++) this.stringOffsets[i] = this.view.getUint32(20 + i * 4, true);
    for (let i = 0; i < this.sceneCount; i++) {
      const at = entryAt + i * 16;
      this.entries.set(this.view.getUint32(at, true), {
        data: this.view.getInt32(at + 4, true),
        length: this.view.getInt32(at + 8, true),
        summary: this.view.getUint32(at + 12, true),
      });
    }
  }

  string(index: number): string {
    if (index < 0 || index >= this.stringOffsets.length) return '';
    const start = this.stringOffsets[index];
    let end = start;
    while (end < this.bytes.length && this.bytes[end] !== 0) end++;
    return new TextDecoder('latin1').decode(this.bytes.subarray(start, end));
  }

  has(path: string): boolean {
    return this.entries.has(sceneCrc(path));
  }

  summary(path: string): SceneSummary | null {
    const e = this.entries.get(sceneCrc(path));
    if (!e) return null;
    const msecs = this.view.getUint32(e.summary, true);
    const count = this.view.getInt32(e.summary + 4, true);
    const sounds: string[] = [];
    for (let i = 0; i < count; i++)
      sounds.push(this.string(this.view.getInt32(e.summary + 8 + i * 4, true)));
    return { duration: msecs / 1000, sounds };
  }

  /** The compiled scene's bytes as stored (possibly Valve-LZMA compressed). */
  data(path: string): Uint8Array | null {
    const e = this.entries.get(sceneCrc(path));
    return e ? this.bytes.subarray(e.data, e.data + e.length) : null;
  }
}
