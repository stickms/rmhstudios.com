/**
 * How many skinned models a crowd may animate at once. A skinned, mixer-driven model costs real CPU (the mixer, the
 * skeleton) and real draw calls, a procedural figure costs almost nothing, so the people nearest the camera get the
 * model and the rest degrade in steps:
 *
 *   full    the mixer updates every frame
 *   slow    the mixer updates a few times a second (the pose still moves, in small steps, far from the eye)
 *   frozen  holds its last pose (off screen, or too far to read); no mixer work
 *   proc    not a model at all this moment: the procedural figure is drawn
 *
 * `planBudget` is pure; the registry (figure-registry.ts) feeds it positions a few times a second.
 */

export type Tier =
  | 'full'
  | 'slow'
  | 'frozen'
  | 'proc';

export interface BudgetEntry {
  id: number;
  /** Squared distance to the camera focus, in tiles². */
  distSq: number;
  /** The player's own avatar, the wardrobe preview: always a full model. */
  pinned: boolean;
  /** Inside the view frustum right now. */
  visible: boolean;
}

export interface BudgetOptions {
  /** This many (nearest, visible) update every frame. */
  full: number;
  /** The next this many update at a lower rate. */
  slow: number;
  /** At most this many are models at all; the rest are procedural. */
  models: number;
  /** A figure that is already a model keeps being one until it is this many ranks past the cut, so the edge does not flicker. */
  hysteresis: number;
}

export const DEFAULT_BUDGET: BudgetOptions =
  {
    full: 24,
    slow: 16,
    models: 48,
    hysteresis: 4,
  };

/** Seconds between mixer updates of a `slow` figure. */
export const SLOW_STEP_S = 0.1;

export function planBudget(
  entries: readonly BudgetEntry[],
  prev: ReadonlyMap<
    number,
    Tier
  >,
  opts: BudgetOptions = DEFAULT_BUDGET,
): Map<
  number,
  Tier
> {
  const ranked =
    [
      ...entries,
    ].sort(
      (
        a,
        b,
      ) => {
        if (
          a.pinned !==
          b.pinned
        )
          return a.pinned
            ? -1
            : 1;
        if (
          a.visible !==
          b.visible
        )
          return a.visible
            ? -1
            : 1;
        return (
          a.distSq -
            b.distSq ||
          a.id -
            b.id
        );
      },
    );
  const out =
    new Map<
      number,
      Tier
    >();
  ranked.forEach(
    (
      e,
      rank,
    ) => {
      if (
        e.pinned
      ) {
        out.set(
          e.id,
          'full',
        );
        return;
      }
      const was =
        prev.get(
          e.id,
        );
      const wasModel =
        was !==
          undefined &&
        was !==
          'proc';
      const cut =
        wasModel
          ? opts.models +
            opts.hysteresis
          : opts.models -
            opts.hysteresis;
      if (
        rank >=
        Math.max(
          cut,
          0,
        )
      ) {
        out.set(
          e.id,
          'proc',
        );
        return;
      }
      if (
        !e.visible
      )
        out.set(
          e.id,
          'frozen',
        );
      else if (
        rank <
        opts.full
      )
        out.set(
          e.id,
          'full',
        );
      else if (
        rank <
        opts.full +
          opts.slow
      )
        out.set(
          e.id,
          'slow',
        );
      else
        out.set(
          e.id,
          'frozen',
        );
    },
  );
  return out;
}
