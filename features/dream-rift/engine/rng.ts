/**
 * Deterministic pseudo-random number generators for Dream Rift.
 *
 * The whole point of the netcode is that every client reproduces an identical
 * danmaku field from a shared seed + frame counter, so bullets never have to be
 * streamed over the wire. That requires a fast, fully deterministic RNG with no
 * reliance on `Math.random`. `Rng` is a small stateful xorshift wrapper used by
 * the simulation; one-off layouts use the shared stateless `mulberry32`
 * (`@/lib/core/rng`).
 */

/** Hash two integers into a 32-bit seed (frame + salt → deterministic stream). */
export function hash2(
  a: number,
  b: number,
): number {
  let h =
    (a >>>
      0) ^
    Math.imul(
      b >>>
        0,
      0x9e3779b1,
    );
  h =
    Math.imul(
      h ^
        (h >>>
          16),
      0x85ebca6b,
    );
  h =
    Math.imul(
      h ^
        (h >>>
          13),
      0xc2b2ae35,
    );
  return (
    (h ^
      (h >>>
        16)) >>>
    0
  );
}

/** Stateful deterministic RNG (xorshift32). */
export class Rng {
  private s: number;

  constructor(
    seed: number,
  ) {
    this.s =
      seed >>>
        0 ||
      0x1a2b3c4d;
  }

  /** Reseed in place (used to re-derive a stream from a known frame). */
  reseed(
    seed: number,
  ): void {
    this.s =
      seed >>>
        0 ||
      0x1a2b3c4d;
  }

  /** Next 32-bit unsigned integer. */
  nextU32(): number {
    let x =
      this
        .s;
    x ^=
      x <<
      13;
    x ^=
      x >>>
      17;
    x ^=
      x <<
      5;
    this.s =
      x >>>
      0;
    return this
      .s;
  }

  /** Float in [0, 1). */
  next(): number {
    return (
      this.nextU32() /
      4294967296
    );
  }

  /** Float in [min, max). */
  range(
    min: number,
    max: number,
  ): number {
    return (
      min +
      this.next() *
        (max -
          min)
    );
  }

  /** Integer in [min, max]. */
  int(
    min: number,
    max: number,
  ): number {
    return (
      min +
      Math.floor(
        this.next() *
          (max -
            min +
            1),
      )
    );
  }

  /** ±spread around 0. */
  spread(
    spread: number,
  ): number {
    return (
      (this.next() *
        2 -
        1) *
      spread
    );
  }

  pick<
    T,
  >(
    arr: readonly T[],
  ): T {
    return arr[
      Math.floor(
        this.next() *
          arr.length,
      ) %
        arr.length
    ];
  }
}
