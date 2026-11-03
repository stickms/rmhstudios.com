// =============================================================================
// ALTAIR ENGINE -- Simulation random source
// =============================================================================
// Every random roll the simulation makes goes through rand(), never
// Math.random(). By default rand() IS Math.random() (looked up on each call, so
// the golden-master harness' Math.random spy still drives single-player). The
// co-op HostSim installs a seeded mulberry32 stream for the duration of each of
// its calls (withRng), which makes a run a pure function of
// (seed, players, per-step inputs, level-up picks): the server can replay it and
// get the identical result. See lib/altair/verify/.
// =============================================================================

export type RandomSource = () => number;

let source: RandomSource | null = null;

/** The simulation's random number in [0, 1). */
export function rand(): number {
  return source ? source() : Math.random();
}

/** mulberry32: tiny, well known, fully deterministic. */
export function createSeededRng(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run fn with `src` as the simulation's random source, restoring the previous one after. */
export function withRng<T>(src: RandomSource, fn: () => T): T {
  const prev = source;
  source = src;
  try {
    return fn();
  } finally {
    source = prev;
  }
}
