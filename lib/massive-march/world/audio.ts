/**
 * Massive March — who can hear whom.
 *
 * This is the single most load-bearing rule in the game, so it is written once
 * and both halves read it:
 *
 *  - the **socket hub** calls `audibility()` to decide which sockets a line of
 *    text is delivered to, and how mangled it arrives;
 *  - the **browser** calls the same function every couple of hundred
 *    milliseconds to set each peer's voice gain and low-pass cutoff.
 *
 * That is not a tidiness preference. §8.2 of the design says a player typing and
 * a player speaking must be under identical constraints — someone without a
 * microphone plays the whole campaign at neither an advantage nor a
 * disadvantage. Two implementations of "can they hear you" would be two
 * different games, and the difference would land precisely on the players least
 * able to argue about it.
 *
 * What the model knows about:
 *
 *  - **Distance.** Clear up close, gone past the range, smooth in between.
 *  - **Booths.** A sealed booth is sealed. In or out, not both, and the
 *    workaround is supposed to be gestures or a radio.
 *  - **Terrain.** A ridge between two people muffles them, because otherwise
 *    the whole northern half of the island would be one open room.
 *  - **Radios.** Ignore distance and walls, sound like radios, and only reach
 *    other radios. Range is finite until the Red Antenna gets its repeater.
 *  - **Megaphones.** Reach much further, muffle nothing, and are audible to
 *    everyone in that radius whether they wanted it or not.
 */

import {
  MEGAPHONE_RANGE,
  VOICE_CLEAR_RANGE,
  VOICE_RANGE,
} from '../constants';
import { COLLIDERS } from './regions';
import { RADIO_LOCAL_RANGE } from './sites';
import { groundY } from './terrain';

export type ChatChannel = 'near' | 'radio' | 'megaphone';

/** Everything about a participant that changes whether they are heard. */
export interface AudioActor {
  x: number;
  z: number;
  /** Ear/mouth height above ground. Crouching genuinely helps you hide. */
  y: number;
  hasRadio: boolean;
  hasMegaphone: boolean;
  /** Booth key (`site:booth`) this actor is standing inside, or null. */
  booth: string | null;
}

export interface Audibility {
  audible: boolean;
  /** Linear 0…1. */
  gain: number;
  /** 0 = perfectly clear, 1 = only the shape of the words survives. */
  muffle: number;
  channel: ChatChannel;
  /** Why nothing got through — used by the UI to say something useful. */
  blockedBy?: 'range' | 'booth' | 'no-radio';
}

const INAUDIBLE: Audibility = { audible: false, gain: 0, muffle: 1, channel: 'near' };

/**
 * Which booth enclosure a point is inside, if any.
 *
 * Booth walls are ring colliders with a door; "inside" is simply within the
 * inner face. The door arc does not create a partial state — you are in the
 * room or you are not, and the moment you step through the doorway everything
 * changes, which is exactly the moment these puzzles are built around.
 */
export function boothAt(x: number, z: number): string | null {
  for (const c of COLLIDERS) {
    if (c.kind !== 'ring') continue;
    if (Math.hypot(x - c.x, z - c.z) < c.r - c.half) {
      return `${c.x.toFixed(1)}:${c.z.toFixed(1)}`;
    }
  }
  return null;
}

/**
 * How much of the line between two points is buried in the hill.
 *
 * Returns 0 for clear line of sight and climbs toward 1 as the ground rises
 * through the sightline. Sixteen samples: enough to catch a boulder field, cheap
 * enough to run per peer per frame if it ever had to.
 */
export function terrainOcclusion(a: AudioActor, b: AudioActor): number {
  const ax = a.x;
  const az = a.z;
  const ay = groundY(ax, az) + a.y;
  const bx = b.x;
  const bz = b.z;
  const by = groundY(bx, bz) + b.y;

  let worst = 0;
  const steps = 16;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const lineY = ay + (by - ay) * t;
    const rise = groundY(x, z) - lineY;
    if (rise > worst) worst = rise;
  }
  // Four metres of hill through the sightline is a total block; less is partial.
  return Math.min(1, Math.max(0, worst / 4));
}

/** How much built structure sits between two points, 0…1. */
export function structureOcclusion(a: AudioActor, b: AudioActor): number {
  let hits = 0;
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    for (const c of COLLIDERS) {
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r) {
          hits++;
          break;
        }
      } else if (c.kind === 'box') {
        const cos = Math.cos(-c.rot);
        const sin = Math.sin(-c.rot);
        const dx = x - c.x;
        const dz = z - c.z;
        if (Math.abs(dx * cos - dz * sin) < c.hx && Math.abs(dx * sin + dz * cos) < c.hz) {
          hits++;
          break;
        }
      } else {
        const d = Math.hypot(x - c.x, z - c.z);
        if (Math.abs(d - c.r) < c.half) {
          hits++;
          break;
        }
      }
    }
  }
  return Math.min(1, hits / 4);
}

export interface AudibilityOptions {
  /** The Red Antenna's repeater is live — radios reach the whole island. */
  repeater: boolean;
  /** Which channel the speaker is transmitting on. */
  channel: ChatChannel;
  /**
   * Skip the line-of-sight sampling. The client passes this on low render tiers
   * and for peers well outside any plausible range; the server never does.
   */
  skipOcclusion?: boolean;
}

export function audibility(
  speaker: AudioActor,
  listener: AudioActor,
  options: AudibilityOptions,
): Audibility {
  const { repeater, channel, skipOcclusion } = options;
  const distance = Math.hypot(speaker.x - listener.x, speaker.z - listener.z);

  // ── Radio ────────────────────────────────────────────────────────────────
  // Distance and walls are exactly what a radio is for, so it ignores both. What
  // it does not ignore is that the other person has to be holding one.
  if (channel === 'radio') {
    if (!speaker.hasRadio) return { ...INAUDIBLE, channel, blockedBy: 'no-radio' };
    if (!listener.hasRadio) return { ...INAUDIBLE, channel, blockedBy: 'no-radio' };
    const range = repeater ? Infinity : RADIO_LOCAL_RANGE;
    if (distance > range) return { ...INAUDIBLE, channel, blockedBy: 'range' };
    // Falls off gently near the edge of range so you get warning before silence.
    const fade = range === Infinity ? 1 : 1 - Math.max(0, (distance - range * 0.75) / (range * 0.25)) * 0.5;
    return { audible: true, gain: 0.85 * fade, muffle: 0.62, channel };
  }

  // ── Megaphone ────────────────────────────────────────────────────────────
  if (channel === 'megaphone') {
    if (!speaker.hasMegaphone) return { ...INAUDIBLE, channel, blockedBy: 'no-radio' };
    if (speaker.booth !== listener.booth) return { ...INAUDIBLE, channel, blockedBy: 'booth' };
    if (distance > MEGAPHONE_RANGE) return { ...INAUDIBLE, channel, blockedBy: 'range' };
    const fade = 1 - Math.pow(distance / MEGAPHONE_RANGE, 1.6) * 0.75;
    return { audible: true, gain: Math.max(0.18, fade), muffle: 0.2, channel };
  }

  // ── Ordinary speech ──────────────────────────────────────────────────────
  if (speaker.booth !== listener.booth) return { ...INAUDIBLE, channel, blockedBy: 'booth' };
  if (distance > VOICE_RANGE) return { ...INAUDIBLE, channel, blockedBy: 'range' };

  let gain = 1;
  if (distance > VOICE_CLEAR_RANGE) {
    const t = (distance - VOICE_CLEAR_RANGE) / (VOICE_RANGE - VOICE_CLEAR_RANGE);
    // Squared falloff: the last third of the range is where you start losing
    // words, which is where somebody decides to walk back rather than shout.
    gain = Math.max(0, 1 - t * t);
  }

  let muffle = distance / VOICE_RANGE * 0.35;

  if (!skipOcclusion && distance > 4) {
    const blocked = Math.max(terrainOcclusion(speaker, listener), structureOcclusion(speaker, listener));
    gain *= 1 - blocked * 0.8;
    muffle = Math.min(1, muffle + blocked * 0.6);
  }

  if (gain < 0.035) return { ...INAUDIBLE, channel, blockedBy: 'range' };
  return { audible: true, gain, muffle, channel };
}

/**
 * Degrade a line of text the way distance and walls degrade speech.
 *
 * The alternative — deliver it perfectly or not at all — would make text chat
 * strictly better than a microphone at the exact ranges where the game wants
 * shouting to be unreliable, and the design is explicit that neither input may
 * be mechanically privileged (§8.2). So a half-heard sentence arrives half
 * heard, in writing.
 *
 * Deterministic in the message id, so every recipient at the same distance sees
 * the same holes and can compare notes about them.
 */
export function garble(text: string, muffle: number, seed: number): string {
  if (muffle < 0.28) return text;
  // Above this you are hearing that somebody said something, and nothing else.
  const dropChance = Math.min(0.72, (muffle - 0.28) * 1.5);
  let state = seed >>> 0 || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };
  return text
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (rand() >= dropChance) return word;
      // Keep the first letter: "s—" is a different kind of frustrating from
      // "—", and the more useful kind.
      return word[0] + '—'.repeat(Math.min(3, Math.max(1, Math.round(word.length / 3))));
    })
    .join(' ');
}
