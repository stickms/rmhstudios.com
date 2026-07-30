/**
 * The Garden of Eden.
 *
 * Sixteen seeds on a 6×6 bed. Plants grow in real time — minutes to hours —
 * mutate into new species when the right neighbours stand next to each other,
 * and while they stand they change the temple: growth speed, halo frequency,
 * manna ripening, what a Sinner is worth.
 *
 * The important design property is that it *runs while the tab is closed*. A
 * player who plants a bed of nard and shuts the laptop comes back to a mature
 * garden and a discovery they did not have to sit and watch. That is what makes
 * an idle game worth opening on a Tuesday.
 *
 * Structure follows Cookie Clicker's garden: three growth stages, ageing past
 * maturity, adjacency-based crossbreeding, and soils that trade growth speed
 * against mutation rate.
 */
import type { GardenState, Plot, SeedDef, SeedId, SoilDef, SoilId } from '../types';

/* ── Seeds ───────────────────────────────────────────────────────────────── */

export const SEEDS: SeedDef[] = [
  {
    id: 'wheat',
    name: 'Common Wheat',
    icon: '🌾',
    description: 'It grows anywhere and asks nothing. The garden starts here.',
    tickSeconds: 60,
    costSeconds: 60,
    yieldSeconds: 200,
    starter: true,
  },
  {
    id: 'vine',
    name: 'Table Vine',
    icon: '🍇',
    description: 'Sweetens everything it grows beside.',
    tickSeconds: 120,
    costSeconds: 180,
    yieldSeconds: 600,
    effect: { jpsMultiplier: 1.01 },
    starter: true,
  },
  {
    id: 'olive',
    name: 'Olive',
    icon: '🫒',
    description: 'Slow, stubborn, and worth every year of it.',
    tickSeconds: 300,
    costSeconds: 900,
    yieldSeconds: 3_600,
    effect: { jpsMultiplier: 1.02 },
    crossbreed: [{ from: ['wheat', 'vine'], chance: 0.06 }],
  },
  {
    id: 'fig',
    name: 'Fig',
    icon: '🫓',
    description: 'Fruits without flowering. Nobody has ever seen it decide.',
    tickSeconds: 240,
    costSeconds: 600,
    yieldSeconds: 2_400,
    effect: { touchMultiplier: 1.05 },
    crossbreed: [{ from: ['vine', 'vine'], chance: 0.05 }],
  },
  {
    id: 'myrrh',
    name: 'Myrrh Bush',
    icon: '🌿',
    description: 'Bitter, resinous, and it makes providence curious.',
    tickSeconds: 420,
    costSeconds: 1_800,
    yieldSeconds: 5_400,
    effect: { haloFrequency: 1.03 },
    crossbreed: [{ from: ['olive', 'wheat'], chance: 0.04 }],
  },
  {
    id: 'lily',
    name: 'Field Lily',
    icon: '🌷',
    description: 'It neither toils nor spins. It out-earns both.',
    tickSeconds: 180,
    costSeconds: 1_200,
    yieldSeconds: 4_800,
    effect: { jpsMultiplier: 1.03 },
    crossbreed: [{ from: ['wheat', 'fig'], chance: 0.05 }],
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    icon: '🍎',
    description: 'Six hundred and thirteen seeds. Someone counted.',
    tickSeconds: 600,
    costSeconds: 3_600,
    yieldSeconds: 14_400,
    effect: { jpsMultiplier: 1.05 },
    crossbreed: [{ from: ['fig', 'olive'], chance: 0.035 }],
  },
  {
    id: 'cedar',
    name: 'Lebanon Cedar',
    icon: '🌲',
    description: 'They built the first roof out of this. It has not forgotten.',
    tickSeconds: 900,
    costSeconds: 7_200,
    yieldSeconds: 28_800,
    effect: { jpsMultiplier: 1.08 },
    crossbreed: [{ from: ['olive', 'myrrh'], chance: 0.03 }],
  },
  {
    id: 'hyssop',
    name: 'Hyssop',
    icon: '🌱',
    description: 'Used for cleaning. Cleans more than it was asked to.',
    tickSeconds: 150,
    costSeconds: 2_400,
    yieldSeconds: 6_000,
    effect: { mannaSpeed: 1.05 },
    crossbreed: [{ from: ['lily', 'myrrh'], chance: 0.04 }],
  },
  {
    id: 'nard',
    name: 'Spikenard',
    icon: '💐',
    description: 'A year of wages, poured out at once, on purpose.',
    tickSeconds: 1_200,
    costSeconds: 18_000,
    yieldSeconds: 90_000,
    effect: { touchMultiplier: 1.25 },
    crossbreed: [{ from: ['lily', 'pomegranate'], chance: 0.025 }],
  },
  {
    id: 'mandrake',
    name: 'Mandrake',
    icon: '🥕',
    description: 'It screams. It is also worth a great deal.',
    tickSeconds: 1_800,
    costSeconds: 36_000,
    yieldSeconds: 216_000,
    effect: { sinnerYield: 1.15 },
    crossbreed: [
      { from: ['wormwood', 'pomegranate'], chance: 0.02 },
      { from: ['thorn', 'nard'], chance: 0.015 },
    ],
  },
  {
    id: 'goldenBough',
    name: 'Golden Bough',
    icon: '🌟',
    description:
      'Breaks off cleanly and grows straight back. Providence pays attention to gardens with one.',
    tickSeconds: 2_400,
    costSeconds: 72_000,
    yieldSeconds: 360_000,
    effect: { haloFrequency: 1.2, jpsMultiplier: 1.1 },
    crossbreed: [{ from: ['cedar', 'nard'], chance: 0.012 }],
  },
  {
    id: 'thorn',
    name: 'Thornbrake',
    icon: '🌵',
    description: 'Nobody planted it. It is here. It chokes what grows beside it.',
    tickSeconds: 90,
    costSeconds: 0,
    yieldSeconds: 30,
    effect: { jpsMultiplier: 0.97 },
    bane: true,
  },
  {
    id: 'wormwood',
    name: 'Wormwood',
    icon: '🥀',
    description: 'Bitter enough to notice. Useful enough to keep one of.',
    tickSeconds: 300,
    costSeconds: 0,
    yieldSeconds: 600,
    effect: { jpsMultiplier: 0.95, sinnerYield: 1.1 },
    crossbreed: [{ from: ['thorn', 'myrrh'], chance: 0.05 }],
    bane: true,
  },
  {
    id: 'nightbloom',
    name: 'Nightbloom',
    icon: '🌙',
    description: 'Opens only when nobody is watching. Somehow this is provable.',
    tickSeconds: 1_500,
    costSeconds: 24_000,
    yieldSeconds: 120_000,
    effect: { haloFrequency: 1.1, sinnerYield: 1.2 },
    crossbreed: [{ from: ['wormwood', 'hyssop'], chance: 0.02 }],
  },
  {
    id: 'tree',
    name: 'The Tree of Life',
    icon: '🌳',
    description:
      'It was in the garden the whole time. You only had to arrange the rest of it correctly. While it stands, everything is better.',
    tickSeconds: 5_400,
    costSeconds: 360_000,
    yieldSeconds: 1_800_000,
    effect: { jpsMultiplier: 1.5, touchMultiplier: 1.5, mannaSpeed: 1.25, haloFrequency: 1.25 },
    crossbreed: [{ from: ['goldenBough', 'pomegranate'], chance: 0.006 }],
  },
];

export const SEED_MAP: Record<SeedId, SeedDef> = Object.fromEntries(
  SEEDS.map((s) => [s.id, s]),
) as Record<SeedId, SeedDef>;

/* ── Soils ───────────────────────────────────────────────────────────────── */

export const SOILS: SoilDef[] = [
  {
    id: 'dirt',
    name: 'Plain Earth',
    description: 'Ordinary. Reliable. Free.',
    icon: '🟫',
    speed: 1,
    fertility: 1,
    yield: 1,
    requiresLevel: 1,
  },
  {
    id: 'sand',
    name: 'Desert Sand',
    description:
      'Everything grows faster and crosses less. Good for farming what you already have.',
    icon: '🟨',
    speed: 1.4,
    fertility: 0.5,
    yield: 1,
    requiresLevel: 2,
  },
  {
    id: 'clay',
    name: 'River Clay',
    description: 'Slow and generous. Twice the harvest, two thirds the pace.',
    icon: '🟧',
    speed: 0.65,
    fertility: 1.25,
    yield: 2,
    requiresLevel: 3,
  },
  {
    id: 'ash',
    name: 'Ash of the Kind Fire',
    description: 'Mutations everywhere. Nothing lives very long.',
    icon: '⬛',
    speed: 1.15,
    fertility: 3,
    yield: 0.6,
    requiresLevel: 5,
  },
  {
    id: 'glass',
    name: 'Ground Glass',
    description: 'Crops never wither, and never cross. For a garden you have finished designing.',
    icon: '⬜',
    speed: 0.9,
    fertility: 0.15,
    yield: 1.5,
    requiresLevel: 7,
  },
  {
    id: 'grace',
    name: 'Soil of Grace',
    description: 'Nothing has to try very hard here.',
    icon: '🟪',
    speed: 2,
    fertility: 2,
    yield: 2,
    requiresLevel: 10,
  },
];

export const SOIL_MAP: Record<SoilId, SoilDef> = Object.fromEntries(
  SOILS.map((s) => [s.id, s]),
) as Record<SoilId, SoilDef>;

/* ── Bed geometry ────────────────────────────────────────────────────────── */

export const GARDEN_COLS = 6;
export const GARDEN_ROWS = 6;
export const GARDEN_SIZE = GARDEN_COLS * GARDEN_ROWS;

/**
 * How much of the bed is usable at a given Grove level. It opens from the
 * middle out, so a level-1 garden is a workable 2×2 rather than a corner.
 */
export function unlockedPlots(groveLevel: number): Set<number> {
  const open = new Set<number>();
  // Level 1 → 2×2, level 2 → 3×3, … level 5+ → the full 6×6.
  const span = Math.min(6, 1 + Math.max(1, groveLevel));
  const start = Math.floor((6 - span) / 2);
  for (let r = start; r < start + span; r++) {
    for (let c = start; c < start + span; c++) open.add(r * GARDEN_COLS + c);
  }
  return open;
}

export function emptyPlots(): Plot[] {
  return Array.from({ length: GARDEN_SIZE }, () => ({ seed: null, growth: 0, age: 0 }));
}

export function createGarden(): GardenState {
  return {
    unlocked: false,
    plots: emptyPlots(),
    known: ['wheat', 'vine'],
    selected: 'wheat',
    carry: 0,
    soil: 'dirt',
    soilCooldown: 0,
  };
}

/** The eight plots touching `index`, wrapping nowhere. */
export function neighboursOf(index: number): number[] {
  const row = Math.floor(index / GARDEN_COLS);
  const col = index % GARDEN_COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= GARDEN_ROWS || c < 0 || c >= GARDEN_COLS) continue;
      out.push(r * GARDEN_COLS + c);
    }
  }
  return out;
}

/* ── Growth ──────────────────────────────────────────────────────────────── */

/** The garden advances on a 5-second beat, not every frame. */
export const GARDEN_BEAT_MS = 5_000;

/**
 * Seconds a mature plant keeps its full value before it starts to go over.
 *
 * Six hours, deliberately: a plant sown before bed is still worth its full
 * harvest in the morning. Cookie Clicker's garden kills crops that are left,
 * which is a fine rule for a game you sit in front of and a terrible one for
 * a garden whose whole selling point is that it grows while the tab is shut.
 */
export const WITHER_GRACE = 6 * 3600;

/**
 * How long past the grace period a plant takes to reach its floor, and how
 * low that floor is. Nothing ever disappears on its own — the worst an
 * absence can do is halve one harvest, and the plant's standing effect keeps
 * working the whole time.
 */
export const WITHER_SPAN = 24 * 3600;
export const WITHER_FLOOR = 0.5;

/** How fresh a plant's harvest is, 1 down to {@link WITHER_FLOOR}. */
export function freshness(plot: Plot, soil: SoilId): number {
  if (!plot.seed || plot.growth < 100) return 1;
  // Glass never lets anything go over — that is what it is for.
  if (soil === 'glass') return 1;
  const overdue = plot.age - SEED_MAP[plot.seed].tickSeconds - WITHER_GRACE;
  if (overdue <= 0) return 1;
  return Math.max(WITHER_FLOOR, 1 - (overdue / WITHER_SPAN) * (1 - WITHER_FLOOR));
}

export interface GardenAdvance {
  garden: GardenState;
  /** Seeds newly discovered this advance, for the toast rail. */
  discovered: SeedId[];
  /** Plants that matured this advance, for the sound. */
  matured: number;
}

/**
 * Advance the garden by `deltaMs`. Pure, deterministic apart from the
 * crossbreed rolls, and safe to call with a delta of several hours — which is
 * exactly what happens when the player comes back in the morning.
 */
export function advanceGarden(
  garden: GardenState,
  deltaMs: number,
  groveLevel: number,
  random: () => number = Math.random,
): GardenAdvance {
  if (!garden.unlocked) return { garden, discovered: [], matured: 0 };

  const total = garden.carry + deltaMs;
  const beats = Math.floor(total / GARDEN_BEAT_MS);
  const carry = total - beats * GARDEN_BEAT_MS;
  if (beats <= 0) {
    return { garden: { ...garden, carry }, discovered: [], matured: 0 };
  }

  const soil = SOIL_MAP[garden.soil];
  const open = unlockedPlots(groveLevel);
  const plots = garden.plots.map((p) => ({ ...p }));
  const known = new Set(garden.known);
  const discovered: SeedId[] = [];
  let matured = 0;

  // Very long absences are compressed: a plant can only mature once, and only
  // so much can cross, so simulating every 5-second beat of a nine-hour night
  // would be a hundred thousand no-ops. Sixty beats is enough for every plant
  // to reach maturity and for the crossbreed rolls to be fair.
  const simulated = Math.min(beats, 60);
  const scale = beats / simulated;

  for (let beat = 0; beat < simulated; beat++) {
    // 1. Grow.
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i]!;
      if (!plot.seed || !open.has(i)) continue;
      const def = SEED_MAP[plot.seed];
      const perBeat = (GARDEN_BEAT_MS / 1000 / def.tickSeconds) * 100 * soil.speed * scale;
      const before = plot.growth;
      plot.growth = Math.min(100, plot.growth + perBeat);
      // Twelve additions of 8.3333 land on 99.99999999999996, which would
      // leave a plant one beat short of ripe for no reason a player could see.
      if (plot.growth > 99.999) plot.growth = 100;
      plot.age += (GARDEN_BEAT_MS / 1000) * scale;
      if (before < 100 && plot.growth >= 100) matured++;
    }

    // 2. Cross. Only mature plants parent, and only into empty open ground.
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i]!;
      if (plot.seed || !open.has(i)) continue;
      const parents = neighboursOf(i)
        .map((n) => plots[n]!)
        .filter((p) => p.seed && p.growth >= 100)
        .map((p) => p.seed!);
      if (parents.length < 2) continue;

      for (const candidate of SEEDS) {
        if (!candidate.crossbreed) continue;
        for (const rule of candidate.crossbreed) {
          if (!hasPair(parents, rule.from)) continue;
          // Odds are per beat and deliberately small; a rare seed is meant to
          // take a whole evening of a well-arranged bed.
          const chance = rule.chance * soil.fertility * 0.05 * scale;
          if (random() < chance) {
            plot.seed = candidate.id;
            plot.growth = 0;
            plot.age = 0;
            if (!known.has(candidate.id)) {
              known.add(candidate.id);
              discovered.push(candidate.id);
            }
            break;
          }
        }
        if (plot.seed) break;
      }
    }

    // 3. Weeds. An unattended garden does not stay tidy.
    if (random() < 0.004 * soil.fertility * scale) {
      const empties: number[] = [];
      for (let i = 0; i < plots.length; i++) {
        if (open.has(i) && !plots[i]!.seed) empties.push(i);
      }
      const target = empties[Math.floor(random() * empties.length)];
      if (target !== undefined) {
        plots[target] = { seed: 'thorn', growth: 0, age: 0 };
      }
    }
  }

  // Note: nothing is removed here. A plant left standing loses value (see
  // `freshness`) but never vanishes, so an absence can cost you a fraction of
  // one harvest and never the garden itself.

  return {
    garden: {
      ...garden,
      plots,
      carry,
      known: [...known],
      soilCooldown: Math.max(0, garden.soilCooldown - (deltaMs - carry)),
    },
    discovered,
    matured,
  };
}

/** Whether `parents` contains the (possibly identical) pair in `pair`. */
function hasPair(parents: SeedId[], pair: SeedId[]): boolean {
  const [a, b] = pair as [SeedId, SeedId];
  if (a === b) return parents.filter((p) => p === a).length >= 2;
  return parents.includes(a) && parents.includes(b);
}

/* ── What the garden does to the temple ──────────────────────────────────── */

export interface GardenEffects {
  jpsMultiplier: number;
  touchMultiplier: number;
  haloFrequency: number;
  mannaSpeed: number;
  sinnerYield: number;
}

export const NO_GARDEN_EFFECTS: GardenEffects = {
  jpsMultiplier: 1,
  touchMultiplier: 1,
  haloFrequency: 1,
  mannaSpeed: 1,
  sinnerYield: 1,
};

/**
 * Standing plants change the temple — but only once they are grown, so a bed
 * of seedlings is a promise rather than a bonus.
 */
export function gardenEffects(garden: GardenState): GardenEffects {
  if (!garden.unlocked) return NO_GARDEN_EFFECTS;
  const out: GardenEffects = { ...NO_GARDEN_EFFECTS };
  for (const plot of garden.plots) {
    if (!plot.seed || plot.growth < 100) continue;
    const effect = SEED_MAP[plot.seed].effect;
    if (!effect) continue;
    if (effect.jpsMultiplier) out.jpsMultiplier *= effect.jpsMultiplier;
    if (effect.touchMultiplier) out.touchMultiplier *= effect.touchMultiplier;
    if (effect.haloFrequency) out.haloFrequency *= effect.haloFrequency;
    if (effect.mannaSpeed) out.mannaSpeed *= effect.mannaSpeed;
    if (effect.sinnerYield) out.sinnerYield *= effect.sinnerYield;
  }
  return out;
}

/**
 * Joy returned by harvesting `plot`, given the temple's current rate.
 *
 * Squared ripeness, so pulling a plant early is a real loss rather than a
 * rounding error — waiting is the whole skill the garden asks for.
 */
export function harvestValue(plot: Plot, jps: number, soil: SoilId): number {
  if (!plot.seed) return 0;
  const def = SEED_MAP[plot.seed];
  const ripeness = Math.min(1, plot.growth / 100);
  return (
    def.yieldSeconds * jps * ripeness * ripeness * SOIL_MAP[soil].yield * freshness(plot, soil)
  );
}

/** Joy it costs to sow `seed`, given the temple's current rate. */
export function sowCost(seed: SeedId, jps: number): number {
  return SEED_MAP[seed].costSeconds * jps;
}
