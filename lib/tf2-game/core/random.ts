/**
 * Seeded random streams for the simulation. The server and a predicting client
 * must roll the same spread and crits for the same command, so the simulation
 * never touches Math.random: it seeds a stream from the command's random seed
 * (the SDK seeds its shared random stream from CUserCmd::random_seed).
 *
 * The generator is the minimal-standard Park–Miller LCG with a Bays–Durham
 * shuffle (the "ran1" family the Source engine's uniform stream belongs to).
 */

const IA = 16807;
const IM = 2147483647;
const IQ = 127773;
const IR = 2836;
const NTAB = 32;
const NDIV = 1 + Math.floor((IM - 1) / NTAB);
const AM = 1 / IM;
const RNMX = 1 - 1.2e-7;

export class UniformRandomStream {
  private idum = 0;
  private iy = 0;
  private readonly iv = new Int32Array(NTAB);

  constructor(seed = 0) {
    this.setSeed(seed);
  }

  setSeed(seed: number): void {
    this.idum = seed < 0 ? seed | 0 : -(seed | 0);
    this.iy = 0;
  }

  private generate(): number {
    let k: number;
    if (this.idum <= 0 || this.iy === 0) {
      this.idum = -this.idum < 1 ? 1 : -this.idum;
      for (let j = NTAB + 7; j >= 0; j--) {
        k = Math.floor(this.idum / IQ);
        this.idum = IA * (this.idum - k * IQ) - IR * k;
        if (this.idum < 0) this.idum += IM;
        if (j < NTAB) this.iv[j] = this.idum;
      }
      this.iy = this.iv[0];
    }
    k = Math.floor(this.idum / IQ);
    this.idum = IA * (this.idum - k * IQ) - IR * k;
    if (this.idum < 0) this.idum += IM;
    const j = Math.floor(this.iy / NDIV);
    this.iy = this.iv[j];
    this.iv[j] = this.idum;
    return this.iy;
  }

  /** Uniform float in [lo, hi). */
  randomFloat(lo = 0, hi = 1): number {
    const fl = Math.min(AM * this.generate(), RNMX);
    return fl * (hi - lo) + lo;
  }

  /** Uniform integer in [lo, hi] inclusive. */
  randomInt(lo: number, hi: number): number {
    const span = hi - lo + 1;
    if (span <= 1) return lo;
    return lo + (this.generate() % span);
  }
}

/** A cheap 32-bit hash for deriving per-command seeds (MD5_PseudoRandom's role). */
export function hashSeed(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x & 0x7fffffff;
}
