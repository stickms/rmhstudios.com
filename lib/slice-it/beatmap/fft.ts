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

  /** In-place complex transform. `re`/`im` must both be {@link size} long. */
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

/**
 * A real-input FFT: the spectrum of `size` real samples, computed with a
 * complex transform of half that length.
 *
 * The STFT feeds `im[] = 0` into every one of the ~78 000 transforms a
 * 15-minute track needs, and a complex FFT spends half its work carrying those
 * zeros around. The standard packing avoids that: interleave the real input as
 * `z[n] = x[2n] + i·x[2n+1]`, transform at N/2, then untangle the even and odd
 * halves with one twiddle per bin. Measured on the real pipeline it takes the
 * spectrogram — 90% of total analysis time — down by about half.
 *
 * This was left undone once on the grounds that a subtly wrong spectrum makes a
 * chart that is merely *slightly* wrong, which is the worst kind of bug to
 * notice, and that the packing is the hardest thing here to eyeball. Both are
 * true. The answer is not to eyeball it: `fft.test.ts` runs this against the
 * complex transform above on random and pathological inputs and requires the
 * magnitudes to agree to 1e-9. The complex path is the oracle and stays.
 */
export class RealFFT {
  readonly size: number;
  private readonly half: number;
  private readonly inner: FFT;
  private readonly zr: Float64Array;
  private readonly zi: Float64Array;
  /** e^(-2πik/N) for k in 0..N/2, the untangling twiddles. */
  private readonly wr: Float64Array;
  private readonly wi: Float64Array;

  constructor(size: number) {
    if (size < 4 || (size & (size - 1)) !== 0) {
      throw new Error(`RealFFT size must be a power of two >= 4, got ${size}`);
    }
    this.size = size;
    this.half = size >> 1;
    this.inner = new FFT(this.half);
    this.zr = new Float64Array(this.half);
    this.zi = new Float64Array(this.half);
    this.wr = new Float64Array(this.half);
    this.wi = new Float64Array(this.half);
    for (let k = 0; k < this.half; k++) {
      this.wr[k] = Math.cos((-2 * Math.PI * k) / size);
      this.wi[k] = Math.sin((-2 * Math.PI * k) / size);
    }
  }

  /**
   * Magnitudes of bins `0 .. size/2 - 1`, written into `out`.
   *
   * `input` is `size` samples and `window` — when given — is applied on the way
   * in, so the caller needs no separate windowing pass and no scratch buffer.
   */
  magnitudes(input: Float32Array, out: Float64Array, offset = 0, window?: Float64Array): void {
    const { half, zr, zi, wr, wi } = this;

    for (let n = 0; n < half; n++) {
      const i = n << 1;
      if (window) {
        zr[n] = input[offset + i] * window[i];
        zi[n] = input[offset + i + 1] * window[i + 1];
      } else {
        zr[n] = input[offset + i];
        zi[n] = input[offset + i + 1];
      }
    }

    this.inner.transform(zr, zi);

    // k = 0 is its own conjugate pair: X[0] = Re Z[0] + Im Z[0], and it is real.
    out[0] = Math.abs(zr[0] + zi[0]);

    for (let k = 1; k < half; k++) {
      const k2 = half - k;
      // Even-indexed samples' transform, from the conjugate-symmetric part.
      const er = (zr[k] + zr[k2]) * 0.5;
      const ei = (zi[k] - zi[k2]) * 0.5;
      // Odd-indexed samples', from the anti-symmetric part rotated by -i.
      const or = (zi[k] + zi[k2]) * 0.5;
      const oi = (zr[k2] - zr[k]) * 0.5;
      const xr = er + or * wr[k] - oi * wi[k];
      const xi = ei + or * wi[k] + oi * wr[k];
      out[k] = Math.sqrt(xr * xr + xi * xi);
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
