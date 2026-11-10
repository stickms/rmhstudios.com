/** Seeded 2-D value noise in [0,1): integer-lattice hashes smoothly interpolated. Pure and deterministic. */

function lattice(seed: number, ix: number, iz: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);
  const a = lattice(seed, x0, z0);
  const b = lattice(seed, x0 + 1, z0);
  const c = lattice(seed, x0, z0 + 1);
  const d = lattice(seed, x0 + 1, z0 + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal noise: `octaves` layers, each twice the frequency and half the weight; result in [0,1). */
export function fbm(seed: number, x: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(seed + o * 101, x * f, z * f) * amp;
    norm += amp;
    amp /= 2;
    f *= 2;
  }
  return sum / norm;
}
