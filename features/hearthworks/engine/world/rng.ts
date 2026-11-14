/** mulberry32: a tiny seeded generator. State is one 32-bit integer so it can live in the world. */
export function nextRandom(
  state: number,
): {
  value: number;
  state: number;
} {
  const s =
    (state +
      0x6d2b79f5) >>>
    0;
  let t =
    s;
  t =
    Math.imul(
      t ^
        (t >>>
          15),
      t |
        1,
    );
  t ^=
    t +
    Math.imul(
      t ^
        (t >>>
          7),
      t |
        61,
    );
  return {
    value:
      ((t ^
        (t >>>
          14)) >>>
        0) /
      4294967296,
    state:
      s,
  };
}

/** Draw one value in [0, 1) from the world's own generator and advance it, so every replica gets the same one. */
export function draw(w: {
  rng: number;
}): number {
  const r =
    nextRandom(
      w.rng,
    );
  w.rng =
    r.state;
  return r.value;
}
