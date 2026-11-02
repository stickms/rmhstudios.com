/**
 * Ambient beds and the generative music layer — the pure half. `player.ts` drives the Web Audio
 * graph from these decisions; nothing here touches the DOM, so the crossfade and the note planner
 * are unit-tested under Node.
 */
import { AREAS, MUSIC_PARTIALS, type AreaId, type BedName } from './recipes';

export { AREAS };
export type { AreaId };

/** Crossfade length between beds, seconds. */
export const BED_FADE_SECONDS = 4;

export const bedName = (area: AreaId): BedName => `bed.${area}`;

/** Per-area character: the bed's level, the music's fundamental transposition, one-shot weather. */
export interface AreaProfile {
  bedGain: number;
  /** Semitones above the 55 Hz fundamental the drone and tones sit at. */
  musicSemitones: number;
  /** Occasional one-shots on this bed: [sound, mean seconds between, gain]. */
  occasional: readonly { sound: 'wind.gust' | 'ship.groan'; every: number; gain: number }[];
}

export const AREA_PROFILES: Readonly<Record<AreaId, AreaProfile>> = {
  ice_open: {
    bedGain: 0.8,
    musicSemitones: 0,
    occasional: [{ sound: 'wind.gust', every: 14, gain: 0.7 }],
  },
  camp_interior: {
    bedGain: 0.55,
    musicSemitones: -2,
    occasional: [{ sound: 'wind.gust', every: 40, gain: 0.25 }],
  },
  ship_1971: {
    bedGain: 0.75,
    musicSemitones: -5,
    occasional: [{ sound: 'ship.groan', every: 16, gain: 0.8 }],
  },
  ship_2030: {
    bedGain: 0.7,
    musicSemitones: 2,
    occasional: [{ sound: 'ship.groan', every: 30, gain: 0.45 }],
  },
};

/** The area a level starts in (a level's scripts switch with an `area` event or an env_soundscape). */
export const LEVEL_AREAS: Readonly<Record<string, AreaId>> = {
  dev_box: 'camp_interior',
  h1_whiteout: 'ice_open',
  h2_listening: 'ice_open',
  h3_still_point: 'ice_open',
  h4_below_decks: 'ship_1971',
  h5_long_corridor: 'ship_1971',
  h6_drive_room: 'ship_2030',
  h7_harmonic: 'ship_2030',
};

export function areaForLevel(level: string): AreaId {
  return LEVEL_AREAS[level] ?? 'ice_open';
}

/**
 * The area an env_soundscape name selects: the name contains an area id
 * (`harmonic.camp_interior`, `ice_open_gale`), or null when it names none.
 */
export function areaForSoundscape(name: string): AreaId | null {
  const n = name.toLowerCase();
  for (const a of AREAS) if (n.includes(a)) return a;
  return null;
}

const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Crossfades between area beds. Levels (0..1) move from where they are to the target over
 * `fade` seconds with a smoothstep, so a switch made mid-fade carries on from the current mix
 * instead of jumping. `gains()` applies a square root: with two beds that are both mid-fade the
 * summed power stays near constant (equal-power crossfade).
 */
export class BedCrossfader {
  private from: Record<AreaId, number>;
  private target: AreaId | null = null;
  private startedAt = 0;
  private readonly fadeSeconds: number;

  constructor(fadeSeconds = BED_FADE_SECONDS) {
    this.fadeSeconds = fadeSeconds;
    this.from = { ice_open: 0, camp_interior: 0, ship_1971: 0, ship_2030: 0 };
  }

  get current(): AreaId | null {
    return this.target;
  }

  /** Linear levels at `now` (seconds, any monotonic clock). */
  levels(now: number): Record<AreaId, number> {
    const p = this.target === null ? 1 : smoothstep((now - this.startedAt) / this.fadeSeconds);
    const out = { ice_open: 0, camp_interior: 0, ship_1971: 0, ship_2030: 0 } as Record<
      AreaId,
      number
    >;
    for (const a of AREAS) {
      const to = a === this.target ? 1 : 0;
      out[a] = this.from[a] + (to - this.from[a]) * p;
    }
    return out;
  }

  /** Move to `area`; `instant` skips the fade (level start). Returns whether anything changed. */
  setArea(area: AreaId, now: number, instant = false): boolean {
    if (this.target === area) return false;
    this.from = this.levels(now);
    this.target = area;
    this.startedAt = instant ? now - this.fadeSeconds : now;
    return true;
  }

  /** Equal-power gains at `now`. */
  gains(now: number): Record<AreaId, number> {
    const l = this.levels(now);
    const g = {} as Record<AreaId, number>;
    for (const a of AREAS) g[a] = Math.sqrt(Math.max(0, l[a]));
    return g;
  }

  /** Beds that are audible at `now` (so the player can stop the silent ones). */
  audible(now: number): AreaId[] {
    const l = this.levels(now);
    return AREAS.filter((a) => l[a] > 0.0005);
  }
}

// ─── Generative music ────────────────────────────────────────────────────

export interface MusicTone {
  /** Seconds from the planner's clock when the note starts. */
  at: number;
  /** Index into `MUSIC_PARTIALS` (a variant of `music.tone`). */
  variant: number;
  /** Linear gain 0..1. */
  gain: number;
  /** -1..1 */
  pan: number;
}

export interface MusicMix {
  /** Drone level 0..1. */
  drone: number;
  /** Combat pulse level 0..1. */
  pulse: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Levels for an intensity 0..1: the drone thickens a little, the pulse only fades in past 0.35. */
export function musicMix(intensity: number): MusicMix {
  const i = clamp01(intensity);
  return { drone: 0.45 + 0.4 * i, pulse: smoothstep((i - 0.35) / 0.55) };
}

/** Mean seconds between notes: sparse at rest (~11 s), busier in combat (~3 s). */
export function noteInterval(intensity: number): number {
  const i = clamp01(intensity);
  return 11 - 8 * i;
}

/**
 * A sparse planner of slow tones from the harmonic series. Low partials are likelier, notes never
 * overlap closer than 1.5 s, and the same partial never plays twice in a row. Deterministic for a
 * given RNG.
 */
export class MusicPlanner {
  private next = 0;
  private last = -1;

  constructor(
    private readonly rng: () => number,
    startDelay = 4,
  ) {
    this.next = startDelay;
  }

  /** Notes that start before `now + horizon`. */
  plan(now: number, horizon: number, intensity: number): MusicTone[] {
    const out: MusicTone[] = [];
    while (this.next < now + horizon) {
      const at = Math.max(this.next, now);
      // Weight by 1/(index+1): the lowest partials most often; in combat the high ones come up.
      const high = clamp01(intensity) * 0.6;
      let total = 0;
      const w = MUSIC_PARTIALS.map((_, i) => {
        const x = (i === this.last ? 0 : 1 / (i + 1)) * (1 + high * i);
        total += x;
        return x;
      });
      let pick = this.rng() * total;
      let variant = 0;
      for (let i = 0; i < w.length; i++) {
        pick -= w[i];
        if (pick <= 0) {
          variant = i;
          break;
        }
        variant = i;
      }
      this.last = variant;
      out.push({ at, variant, gain: 0.25 + 0.35 * this.rng(), pan: (this.rng() * 2 - 1) * 0.7 });
      const mean = noteInterval(intensity);
      this.next = at + Math.max(1.5, mean * (0.6 + 0.8 * this.rng()));
    }
    return out;
  }
}

/** Playback rate for a transposition in semitones. */
export const semitoneRate = (semis: number): number => Math.pow(2, semis / 12);
