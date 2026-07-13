/**
 * Yoga (WASM flexbox) loader for canvas layout.
 *
 * Layout runs only on the client (scenes never SSR), so yoga is loaded
 * asynchronously via `yoga-layout/load` — this keeps top-level await out of
 * the server bundle, which Nitro's externalizer can't digest. `StageHost`
 * awaits `ensureYoga()` before mounting any scene; everything downstream
 * uses the synchronous `getYoga()` accessor.
 */

import {
  loadYoga,
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
  Wrap,
} from "yoga-layout/load";

export { Align, Direction, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap };

export type Yoga = Awaited<ReturnType<typeof loadYoga>>;
export type YogaNode = ReturnType<Yoga["Node"]["create"]>;

let yoga: Yoga | null = null;
let loading: Promise<Yoga> | null = null;

export function ensureYoga(): Promise<Yoga> {
  if (yoga) return Promise.resolve(yoga);
  loading ??= loadYoga().then((y) => {
    yoga = y;
    return y;
  });
  return loading;
}

export function getYoga(): Yoga {
  if (!yoga) {
    throw new Error("canvas-ui: yoga-layout not loaded yet — StageHost must await ensureYoga() before scenes mount.");
  }
  return yoga;
}

export function isYogaLoaded(): boolean {
  return yoga !== null;
}
