/**
 * The boil — why the lines look drawn instead of computed.
 *
 * Hand-drawn animation "boils": every frame was drawn again, so every line
 * disagrees slightly with the one before it. We fake that by offsetting each
 * vertex by a small amount sampled from a seeded field, and re-sampling the
 * field only every `RENDER.BOIL_FRAME_DIVISOR` frames — a 20fps wobble under a
 * 60fps simulation. Three rules from design doc §2.3, all of them load-bearing:
 *
 * 1. **The offset is a pure function of `(vertexId, phase)`,** never
 *    `Math.random()` per frame. A random offset per frame makes the line
 *    *hiss* — every vertex jumps independently every frame and the shape
 *    dissolves. A hashed one makes it *boil* — the whole line steps to a new,
 *    coherent, still-recognisable version of itself three times a second.
 * 2. **Amplitude is small** (1.4 px on world ink, 0.8 px on actors, at design
 *    scale). More reads as an earthquake, not a drawing.
 * 3. **Reduced motion zeroes the amplitude and freezes the phase.** The
 *    drawing still looks drawn — the strokes are tapered and imperfect — it
 *    just stops moving. `perf-lite` devices and the degradation ladder's first
 *    rung get the same treatment (§17).
 *
 * There is no allocation here on purpose: `dx`/`dy` return numbers rather than
 * a vector, and are called a few thousand times a frame.
 */

import { RENDER } from '../constants';

/**
 * Hash three 32-bit integers into one. Two rounds of the fmix32 finaliser —
 * enough avalanche that adjacent vertex ids on the same phase look unrelated,
 * which is the whole point (neighbouring vertices must not wobble together, or
 * the line translates instead of boiling).
 */
function hash3(a: number, b: number, c: number): number {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1) ^ Math.imul(c >>> 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Map a 32-bit hash to the closed-ish interval [-1, 1). */
function unit(h: number): number {
  return h / 2147483648 - 1;
}

export interface BoilField {
  /** Current phase — `floor(frame / BOIL_FRAME_DIVISOR)`, or 0 when frozen. */
  readonly phase: number;
  /** False when reduced motion or the degradation ladder has switched it off. */
  readonly active: boolean;
  /** Advance to the phase implied by a simulation frame number. */
  advance(frame: number): void;
  /** Horizontal offset for a vertex, in the caller's units. */
  dx(vertexId: number, amplitude: number): number;
  /** Vertical offset for a vertex, in the caller's units. */
  dy(vertexId: number, amplitude: number): number;
  /** The world-ink amplitude to pass to `dx`/`dy`; 0 when the boil is off. */
  readonly world: number;
  /** The actor amplitude; 0 when the boil is off. */
  readonly actor: number;
  setReducedMotion(reduced: boolean): void;
  /** The degradation ladder's first rung (§17): drop the boil entirely. */
  setEnabled(enabled: boolean): void;
}

class SeededBoil implements BoilField {
  private currentPhase = 0;
  private reduced: boolean;
  private enabled = true;

  constructor(
    private readonly seed: number,
    reducedMotion: boolean,
  ) {
    this.reduced = reducedMotion;
  }

  get phase(): number {
    return this.frozen ? 0 : this.currentPhase;
  }

  get active(): boolean {
    return !this.frozen;
  }

  get world(): number {
    return this.frozen ? 0 : RENDER.BOIL_AMPLITUDE_WORLD;
  }

  get actor(): number {
    return this.frozen ? 0 : RENDER.BOIL_AMPLITUDE_ACTOR;
  }

  private get frozen(): boolean {
    return this.reduced || !this.enabled;
  }

  advance(frame: number): void {
    // Frozen means frozen at phase 0, not "stopped wherever it happened to be"
    // — otherwise toggling reduced motion mid-run leaves the sheet stuck in a
    // random wobble that never matches a fresh load of the same level.
    if (this.frozen) {
      this.currentPhase = 0;
      return;
    }
    const f = Number.isFinite(frame) ? frame : 0;
    this.currentPhase = Math.floor(f / RENDER.BOIL_FRAME_DIVISOR);
  }

  dx(vertexId: number, amplitude: number): number {
    if (amplitude === 0 || this.frozen) return 0;
    return unit(hash3(this.seed, vertexId, this.currentPhase)) * amplitude;
  }

  dy(vertexId: number, amplitude: number): number {
    if (amplitude === 0 || this.frozen) return 0;
    // A different salt on the id, not a different seed: one hash per axis keeps
    // x and y independent without doubling the field's state.
    return unit(hash3(this.seed, vertexId ^ 0x5bf03635, this.currentPhase)) * amplitude;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (this.frozen) this.currentPhase = 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.frozen) this.currentPhase = 0;
  }
}

export function createBoil(seed: number, reducedMotion = false): BoilField {
  return new SeededBoil(seed >>> 0 || 0x9e3779b1, reducedMotion);
}

/**
 * A stable vertex id from a shape id and a point index.
 *
 * Ids must be stable across frames (or the vertex boils to a different value
 * every frame — the hiss again) and distinct between shapes (or two crates
 * wobble in lockstep). Callers pass a per-shape base and add the point index.
 */
export function vertexId(shapeSalt: number, index: number): number {
  return (Math.imul(shapeSalt >>> 0, 0x2545f491) + index) >>> 0;
}

/** Hash a string id (prop id, level id) into the salt `vertexId` wants. */
export function saltFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
