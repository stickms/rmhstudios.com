/**
 * Chords on sampled instruments — pure. A piano plays a block chord (every note at once); a
 * steel-string guitar strums, low string first.
 */

/** Strum humanise bound (ms): each string after the first lands within this of its slot. */
export const STRUM_HUMANISE_MS = 3;

/**
 * Start offsets (seconds) for `n` voices: the first at 0, each next `strumMs` later, nudged by a
 * deterministic +-{@link STRUM_HUMANISE_MS} from `rand` (0..1) — never out of order. `strumMs` 0
 * is a block chord.
 */
export function strumOffsets(n: number, strumMs: number, rand: () => number): number[] {
  if (!(n > 0)) return [];
  const out: number[] = [0];
  for (let i = 1; i < n; i++) {
    if (!(strumMs > 0)) {
      out.push(0);
      continue;
    }
    const jitter = (rand() * 2 - 1) * STRUM_HUMANISE_MS;
    const ms = Math.max(i * strumMs + jitter, out[i - 1] * 1000 + 1);
    out.push(ms / 1000);
  }
  return out;
}

/** Per-voice gain for `n` voices sounding together: a six-string strum is -7.8 dB a string. */
export function chordGain(n: number): number {
  return n > 1 ? 1 / Math.sqrt(n) : 1;
}
