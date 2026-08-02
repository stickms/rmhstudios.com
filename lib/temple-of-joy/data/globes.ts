/**
 * The globes.
 *
 * The temple is not a building any more — it is a liquid globe you turn and
 * strike, with everything you own orbiting it. Buying another one is the
 * headline purchase of the middle game: it is the only thing you can buy that
 * changes what the room *looks* like, and it is priced accordingly.
 *
 * ## Why the prices are so far apart
 *
 * A source is bought hundreds of times and its ladder is gentle (×1.15 a copy).
 * A globe is bought seven times in a whole run, so its ladder has to be the
 * opposite shape: each one costs roughly 300–10,000× the last, which lands them
 * at recognisable *milestones* rather than in the churn. Read against the source
 * table in `sources.ts`, the second globe arrives around the Almshouse, the
 * fourth around the Reliquary, and the eighth is a late-run trophy.
 *
 * The reward is deliberately multiplicative and deliberately modest per globe:
 * ×1.5 to the rate compounds to ×17 across the full set, which is worth chasing
 * without ever being the *only* thing worth chasing — the source ladder still
 * has to be climbed to afford the next one.
 */

/** The globe every temple starts with, plus the seven you can buy. */
export const MAX_GLOBES = 8;

/** Rate multiplier per globe beyond the first. Compounds. */
export const GLOBE_JPS_FACTOR = 1.5;

/** Hand-offering multiplier per globe beyond the first. Compounds. */
export const GLOBE_TOUCH_FACTOR = 1.25;

/**
 * A globe becomes visible once you could plausibly reach it — a quarter of its
 * price. Earlier than the sources' third, because there is only ever one globe
 * on offer at a time and knowing it is coming is most of its pull.
 */
export const GLOBE_REVEAL_SHARE = 1 / 4;

export interface GlobeDef {
  /** 1-based: `GLOBES[0]` is the globe you start with and cannot buy. */
  index: number;
  name: string;
  tagline: string;
  /** Joy to buy it. Zero for the first, which you are given. */
  cost: number;
}

export const GLOBES: GlobeDef[] = [
  {
    index: 1,
    name: 'The Alabaster',
    tagline: 'The first one. Everything you own is turning around it.',
    cost: 0,
  },
  {
    index: 2,
    name: 'The Ember',
    tagline: 'Warm to the touch, and it has not cooled once since.',
    cost: 1_000_000,
  },
  {
    index: 3,
    name: 'The Tide',
    tagline: 'Somewhere inside it, something is still going out and coming back.',
    cost: 500_000_000,
  },
  {
    index: 4,
    name: 'The Lantern',
    tagline: 'Lights the other seven. Nobody has worked out what lights it.',
    cost: 300_000_000_000,
  },
  {
    index: 5,
    name: 'The Hush',
    tagline: 'Turns without a sound. The quietest thing in the room by far.',
    cost: 2_000_000_000_000_000,
  },
  {
    index: 6,
    name: 'The Aurora',
    tagline: 'Nine colours, none of which you can name afterwards.',
    cost: 1e20,
  },
  {
    index: 7,
    name: 'The Gilded',
    tagline: 'Gold all the way through, which rather defeats the point of leaf.',
    cost: 8e25,
  },
  {
    index: 8,
    name: 'The Undimmed',
    tagline: 'It was lit before the temple and it will be lit after.',
    cost: 5e32,
  },
];

export const GLOBE_MAP: Record<number, GlobeDef> = Object.fromEntries(
  GLOBES.map((g) => [g.index, g]),
);

/**
 * What the next globe costs, given how many you already have.
 *
 * `Infinity` once the set is complete, so every caller that compares against
 * joy answers "no" without needing its own bounds check.
 */
export function globeCost(owned: number): number {
  const next = GLOBE_MAP[owned + 1];
  return next ? next.cost : Infinity;
}

/** The globe a purchase would hand over, or `null` if the set is complete. */
export function nextGlobe(owned: number): GlobeDef | null {
  return GLOBE_MAP[owned + 1] ?? null;
}
