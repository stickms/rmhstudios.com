/**
 * Where the destinations sit on the sphere. Its own module, with no import, because two things read it: the engine
 * (an idle chunk) and the globe's static first paint (components/shell/GlobeFirstPaint.tsx), which is server-rendered
 * and must not pull the physics into the shell.
 */

const DEG =
  Math.PI /
  180;
const GOLDEN_DEG =
  180 *
  (3 -
    Math.sqrt(
      5,
    ));

/** A destination fixed on the sphere, as direction cosines. */
export interface GlobePoint {
  bx: number;
  by: number;
  bz: number;
}

/**
 * Fibonacci-sphere placement over the whole globe. Deterministic from the count, so the same list always puts the same
 * destination on the same face: this is navigation, and muscle memory is the point.
 */
export function placePoints(
  n: number,
): GlobePoint[] {
  const out: GlobePoint[] =
    [];
  for (
    let i = 0;
    i <
    n;
    i++
  ) {
    const sinLat =
      n <=
      1
        ? 0
        : 1 -
          (2 *
            (i +
              0.5)) /
            n;
    const lat =
      Math.asin(
        sinLat,
      );
    const lon =
      (((i *
        GOLDEN_DEG) %
        360) -
        180) *
      DEG;
    const cl =
      Math.cos(
        lat,
      );
    out.push(
      {
        bx:
          cl *
          Math.sin(
            lon,
          ),
        by: -Math.sin(
          lat,
        ),
        bz:
          cl *
          Math.cos(
            lon,
          ),
      },
    );
  }
  return out;
}
