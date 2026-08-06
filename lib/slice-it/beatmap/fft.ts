/**
 * A radix-2 Cooley–Tukey FFT.
 *
 * Written out rather than pulled from a dependency because this file is
 * compiled into the API route *and* the browser bundle, and the whole beatmap
 * pipeline is deliberately dependency-free: it has to run identically in a
 * Nitro request handler at upload time and (as a fallback) in a tab.
 *
 * Twiddle factors and the bit-reversal permutation are precomputed once per
 * size, because the analyser runs this tens of thousands of times over one
 * song — a 4-minute track at a 10 ms hop is ~24 000 transforms.
 */

export class FFT {
  readonly size: number;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly reverse: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;

    const half = size >> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }

    let bits = 0;
    while (1 << bits < size) bits++;
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | ((i >>> b) & 1);
      }
      this.reverse[i] = r;
    }
  }

  /**
   * In-place complex transform. `re`/`im` must both be {@link size} long.
   *
   * The real-input specialisation (packing N real samples into an N/2 complex
   * transform) would halve this, and is deliberately not used: the saving is a
   * fraction of a second on the one code path where correctness is hardest to
   * eyeball, and a subtly wrong spectrum produces a chart that is merely
   * *slightly* wrong — the worst kind of bug to notice.
   */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;

    for (let i = 0; i < n; i++) {
      const j = this.reverse[i];
      if (j > i) {
        let tmp = re[i];
        re[i] = re[j];
        re[j] = tmp;
        tmp = im[i];
        im[i] = im[j];
        im[j] = tmp;
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cosTable[k];
          const wi = this.sinTable[k];
          const a = i + j;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }
}

/** A Hann (raised-cosine) window — the standard choice for onset STFTs. */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}
