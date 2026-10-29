/**
 * The parts of a studio model the simulation needs to play animations by
 * name: each sequence's name, activity, flags (looping), frame count and rate
 * (from its first animation) and its animation events, plus the attachment
 * names and the included models whose sequences it shares.
 *
 * SDK: studio.h — studiohdr_t (localanimindex 184, localseqindex 192,
 * localattachmentindex 244, includemodelindex 340), mstudioseqdesc_t (212
 * bytes), mstudioanimdesc_t (100 bytes), mstudioevent_t (80 bytes),
 * mstudioattachment_t (92 bytes), mstudiomodelgroup_t (8 bytes).
 * Pure and environment-agnostic.
 */

import { readCString, viewOf } from '../../tf2-game/formats/binary';
import { MDL_IDENT } from '../../tf2-game/formats/mdl-header';

/** STUDIO_LOOPING (studio.h). */
export const STUDIO_LOOPING = 0x0001;

export interface MdlEvent {
  /** 0…1 of the sequence. */
  cycle: number;
  event: number;
  /** The event's name when stored by name (newer compilers), else ''. */
  name: string;
  options: string;
}

export interface MdlSequence {
  name: string;
  activity: string;
  flags: number;
  looping: boolean;
  fps: number;
  frames: number;
  /** Seconds for one cycle (frames − 1) / fps, at least one tick. */
  duration: number;
  events: MdlEvent[];
  /** Ground speed from the first animation's movement, units/s (0 when stationary). */
  groundSpeed: number;
}

export interface MdlInfo {
  sequences: MdlSequence[];
  attachments: string[];
  /** Included models ($includemodel), whose sequences the model also plays. */
  includes: string[];
}

/** Reads sequences, attachments and includes. Throws on a non-MDL. */
export function parseMdlSequences(bytes: Uint8Array): MdlInfo {
  const view = viewOf(bytes);
  if (bytes.length < 408 || view.getUint32(0, true) !== MDL_IDENT) throw new Error('mdl: bad signature');
  const i32 = (o: number): number => (o + 4 <= bytes.length ? view.getInt32(o, true) : 0);
  const f32 = (o: number): number => (o + 4 <= bytes.length ? view.getFloat32(o, true) : 0);
  const str = (o: number): string => (o > 0 && o < bytes.length ? readCString(bytes, o) : '');

  const numAnims = i32(180);
  const animIndex = i32(184);
  const numSeq = i32(188);
  const seqIndex = i32(192);
  const numAttach = i32(240);
  const attachIndex = i32(244);
  const numIncludes = i32(336);
  const includeIndex = i32(340);

  const animFps = (a: number): { fps: number; frames: number; speed: number } => {
    if (a < 0 || a >= numAnims) return { fps: 30, frames: 1, speed: 0 };
    const base = animIndex + a * 100;
    const fps = f32(base + 8) || 30;
    const frames = Math.max(1, i32(base + 16));
    // mstudiomovement_t: endframe, motionflags, v0, v1, angle, vector, position (44 bytes)
    let speed = 0;
    const numMovements = i32(base + 20);
    const movementIndex = i32(base + 24);
    if (numMovements > 0 && movementIndex) {
      const m = base + movementIndex;
      const endFrame = i32(m);
      const px = f32(m + 32);
      const py = f32(m + 36);
      const dist = Math.hypot(px, py);
      if (endFrame > 0) speed = (dist * fps) / endFrame;
    }
    return { fps, frames, speed };
  };

  const sequences: MdlSequence[] = [];
  for (let i = 0; i < numSeq && i < 4096; i++) {
    const s = seqIndex + i * 212;
    if (s + 212 > bytes.length) break;
    const name = str(s + i32(s + 4));
    const activity = str(s + i32(s + 8));
    const flags = i32(s + 12);
    const numEvents = i32(s + 24);
    const eventIndex = i32(s + 28);
    const animIndexIndex = i32(s + 60);
    const firstAnim = s + animIndexIndex + 2 <= bytes.length ? view.getInt16(s + animIndexIndex, true) : 0;
    const { fps, frames, speed } = animFps(firstAnim);
    const events: MdlEvent[] = [];
    for (let e = 0; e < numEvents && e < 256; e++) {
      const eo = s + eventIndex + e * 80;
      if (eo + 80 > bytes.length) break;
      const nameIdx = i32(eo + 76);
      events.push({
        cycle: f32(eo),
        event: i32(eo + 4),
        name: nameIdx ? str(eo + nameIdx) : '',
        options: readCString(bytes, eo + 12, 64),
      });
    }
    const looping = (flags & STUDIO_LOOPING) !== 0;
    sequences.push({
      name,
      activity,
      flags,
      looping,
      fps,
      frames,
      duration: Math.max(0.015, frames > 1 ? (frames - 1) / fps : 0.015),
      events,
      groundSpeed: speed,
    });
  }

  const attachments: string[] = [];
  for (let i = 0; i < numAttach && i < 512; i++) {
    const a = attachIndex + i * 92;
    if (a + 92 > bytes.length) break;
    attachments.push(str(a + i32(a)));
  }

  const includes: string[] = [];
  for (let i = 0; i < numIncludes && i < 64; i++) {
    const g = includeIndex + i * 8;
    if (g + 8 > bytes.length) break;
    const n = str(g + i32(g + 4));
    if (n) includes.push(n.replace(/\\/g, '/').toLowerCase());
  }
  return { sequences, attachments, includes };
}
