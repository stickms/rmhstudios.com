/**
 * Nightrail — the five courses.
 *
 * A level is geometry plus furniture. The geometry is a list of
 * {@link TrackSegment}s laid end to end, so a course's length is implied by its
 * shape and can never drift out of sync with it (see `track.ts#trackLength`).
 * The furniture is a flat list of {@link TrackFeature}s pinned to arc lengths
 * along that shape.
 *
 * ## Reading a course
 *
 * Each level's feature list carries a beat map in its comments — the running
 * `s` coordinate of every segment boundary — because features are authored in
 * absolute metres and there is no other way to tell, from the data alone, that
 * a kicker at 1060 sits on a straight rather than halfway through a hairpin.
 * If you change a segment length you must re-walk that map; nothing downstream
 * will catch a feature that has quietly slid into a bend.
 *
 * ## The fairness rules the data obeys
 *
 * 1. A `gap` or `barrier` never blocks every rail. There is always a line
 *    through it that needs no jump, so a player who has spent their air still
 *    has an out.
 * 2. `ceiling` is the deliberate exception: it spans the whole track, and it is
 *    cleared by staying *down*. It is the only hazard that punishes jumping,
 *    which is why level 4 is built around it — by then the player's reflex is
 *    "when in doubt, jump", and Undercity is where that reflex has to be
 *    unlearned.
 * 3. Nothing that must be *jumped* is placed where its landing arc lands under
 *    a roof, and every hazard gets ~40 m of clear track behind it so it can be
 *    read at speed.
 * 4. Charms come in runs, never sprinkles. A run is a line the player commits a
 *    corner to, so it has to be visible as one from far enough back to switch.
 */

import type {
  FeatureKind,
  LevelConfig,
  LevelId,
  LevelVisuals,
  TrackFeature,
  TrackSegment,
} from './types';

// ── Authoring helpers ───────────────────────────────────────────────────────

/**
 * A feature before it is given an id.
 *
 * Ids are assigned by {@link place} rather than typed out, because the one
 * thing that must be true of them — uniqueness within a level — is exactly the
 * thing a human hand-numbering a hundred entries gets wrong after the third
 * insertion.
 */
interface FeatureSpec {
  kind: FeatureKind;
  s: number;
  /** Defaults to {@link DEFAULT_LENGTH} for the kind. */
  length?: number;
  /** Omit for `ceiling` and `checkpoint` only — an empty list means all rails. */
  rails?: number[];
  clearance?: number;
  closingSpeed?: number;
}

/**
 * Length used when a spec leaves it out.
 *
 * These are the "one of the usual" sizes: a charm is a point, a checkpoint is a
 * gantry, a barrier is a signal mast. The kinds whose size *is* the difficulty
 * — gaps, roofs, grind rails, freight — are always written out at the call site
 * instead, so no hazard's severity is hidden behind a default.
 */
const DEFAULT_LENGTH: Record<FeatureKind, number> = {
  barrier: 12,
  gap: 18,
  freight: 44,
  ceiling: 80,
  grindrail: 60,
  kicker: 14,
  charm: 2,
  boostpad: 8,
  checkpoint: 4,
};

/** Every freight in the game is the same rolling stock, so it is one number. */
const FREIGHT_CLEARANCE = 3.5;

/**
 * Turn specs into features: fill the defaults, sort by distance, number them.
 *
 * Sorting matters beyond tidiness — charm runs are authored as one call and
 * therefore land interleaved with the hazards around them, and a list that is
 * monotonic in `s` lets the runtime sweep it with a forward cursor instead of
 * re-scanning.
 */
function place(specs: FeatureSpec[]): TrackFeature[] {
  return [...specs]
    .sort((a, b) => a.s - b.s)
    .map((spec, i) => ({
      id: i + 1,
      kind: spec.kind,
      s: spec.s,
      length: spec.length ?? DEFAULT_LENGTH[spec.kind],
      rails: spec.rails ?? [],
      clearance: spec.clearance ?? (spec.kind === 'freight' ? FREIGHT_CLEARANCE : 0),
      closingSpeed: spec.closingSpeed ?? 0,
      consumed: false,
    }));
}

/**
 * A line of charms on one rail.
 *
 * 12 m spacing is the default because at every level's target speed that reads
 * as a steady tick rather than a smear, and it keeps the boost a full run pays
 * out (`CHARM_BOOST` × count) proportional to how long you held the line.
 */
function charms(start: number, count: number, rail: number, spacing = 12): FeatureSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'charm' as const,
    s: start + i * spacing,
    rails: [rail],
  }));
}

/** A straight. Written out because most of the track is one. */
function straight(length: number, grade = 0): TrackSegment {
  return { length, curvature: 0, grade, bank: 0 };
}

/**
 * A bend, banked into itself.
 *
 * Bank is derived from curvature rather than authored, at the ratio the
 * renderer was tuned against (≈12 rad of lean per rad/m of turn, capped at the
 * point where the railbed starts to read as a wall). Deriving it means no level
 * can ship a corner that leans the wrong way.
 */
function bend(length: number, curvature: number, grade = 0): TrackSegment {
  const bank = Math.max(-0.35, Math.min(0.35, curvature * 12));
  return { length, curvature, grade, bank };
}

// ── 1 · Harbor Line ─────────────────────────────────────────────────────────

/**
 * Dusk over the container docks. The teaching course.
 *
 * Three rails, wide sweepers and long straights: everything here is introduced
 * alone and then immediately rewarded. The two gaps at 800/862 are the first
 * thing that can kill you and they are staggered onto opposite edges, so the
 * lesson is "read the open rail", not "react". Every hazard is followed by a
 * straight with a kicker and a grind rail on it — the shape of a scoring run
 * (launch → trick → land on the grind) is taught by repetition before the game
 * ever asks for it under pressure.
 */
const HARBOR_SEGMENTS: TrackSegment[] = [
  straight(180), //            0 →  180  start straight
  bend(220, 0.005), //       180 →  400  long right sweeper
  straight(140), //          400 →  540  kicker + grind
  bend(200, -0.005), //      540 →  740  long left sweeper
  straight(160, 0.03), //    740 →  900  gentle climb, the gaps
  bend(180, 0.006), //       900 → 1080  right sweeper
  straight(120, -0.035), // 1080 → 1200  descent
  straight(200), //         1200 → 1400  the barrier straight
  bend(220, -0.007), //     1400 → 1620  the level's tightest bend
  straight(150), //         1620 → 1770  kicker + grind
  bend(180, 0.006), //      1770 → 1950  final sweeper
  straight(250), //         1950 → 2200  run to the finish
];

/** Beats — total 2200 m. Boundaries: 180 400 540 740 900 1080 1200 1400 1620 1770 1950. */
const HARBOR_FEATURES: TrackFeature[] = place([
  // Opening straight: a centre line of charms, purely to teach that charms come
  // in lines and that following one is worth a rail switch.
  ...charms(60, 8, 1),

  // First sweeper: the charm line moves to the inside rail, so holding the
  // drift and holding the line are the same input.
  ...charms(200, 10, 2),

  { kind: 'kicker', s: 425, rails: [0, 1, 2] },
  { kind: 'grindrail', s: 470, length: 60, rails: [1] },
  { kind: 'checkpoint', s: 545 },

  ...charms(570, 10, 0),

  // The climb: two staggered gaps, opposite edges, 44 m apart. Neither can be
  // taken on the rail that cleared the other.
  { kind: 'gap', s: 800, length: 18, rails: [0] },
  { kind: 'gap', s: 862, length: 18, rails: [2] },

  { kind: 'boostpad', s: 930, rails: [1] },
  ...charms(960, 9, 2),
  { kind: 'checkpoint', s: 1070 },

  // Downhill kicker — the grade adds to the launch, so this is the first jump
  // that feels big without needing a full charge.
  { kind: 'kicker', s: 1105, rails: [0, 1, 2] },
  { kind: 'grindrail', s: 1150, length: 60, rails: [1] },

  // First barrier. Blocks two of three rails and the survivor rail is the one
  // the charm run then pays out on.
  { kind: 'barrier', s: 1258, rails: [0, 1], clearance: 1.6 },
  ...charms(1290, 8, 2),
  { kind: 'boostpad', s: 1385, rails: [2] },

  ...charms(1430, 11, 0),
  { kind: 'checkpoint', s: 1585 },

  { kind: 'kicker', s: 1640, rails: [0, 1, 2] },
  { kind: 'grindrail', s: 1682, length: 65, rails: [1] },

  ...charms(1800, 10, 2),

  // Finish straight: one last gap, then a clean launch-and-grind to bank a
  // combo before the line.
  { kind: 'gap', s: 1970, length: 16, rails: [1] },
  { kind: 'checkpoint', s: 2010 },
  { kind: 'kicker', s: 2040, rails: [0, 1, 2] },
  { kind: 'grindrail', s: 2080, length: 70, rails: [1] },
  ...charms(2160, 3, 1),
]);

const HARBOR_VISUALS: LevelVisuals = {
  skyTop: '#243a5e',
  skyBottom: '#f2915c',
  horizon: '#ffb27a',
  fogColor: '#d98a5e',
  fogNear: 60,
  fogFar: 700,
  railColor: '#c8d6dd',
  sleeperColor: '#4a3a30',
  structureColor: '#2f4552',
  accent: '#ffb457',
  accent2: '#38d6c0',
  neon: 1.2,
  ambient: 0.75,
  keyLight: 0.9,
  keyColor: '#ffd2a1',
  stars: false,
  rain: 0,
  wetness: 0.15,
  scenery: 'harbor',
};

// ── 2 · Neon Ward ───────────────────────────────────────────────────────────

/**
 * The night city. Four rails, and the first things that move.
 *
 * The fourth rail is the point: with three rails a hazard leaves an obvious
 * survivor, with four the player has to pick. Freight arrives here — it closes
 * from ahead, so for the first time the reaction distance is shorter than the
 * gap on the map, and the two hairpins are short enough that they read as drift
 * exercises rather than obstacles.
 */
const CITY_SEGMENTS: TrackSegment[] = [
  straight(140), //            0 →  140
  bend(180, 0.007), //       140 →  320  right sweeper
  straight(120), //          320 →  440  kicker + grind
  bend(160, -0.008), //      440 →  600  left sweeper
  straight(100, 0.05), //    600 →  700  climb — first freight
  bend(200, 0.006, 0.02), // 700 →  900  climbing right sweeper
  straight(120, -0.06), //   900 → 1020  descent
  bend(90, -0.016), //      1020 → 1110  left hairpin
  straight(150), //         1110 → 1260  freight + gap
  bend(200, 0.008), //      1260 → 1460  right sweeper
  straight(140), //         1460 → 1600
  bend(110, -0.012), //     1600 → 1710  tight left
  straight(180), //         1710 → 1890  the busy straight
  bend(220, 0.007), //      1890 → 2110  long right sweeper
  straight(130), //         2110 → 2240
  bend(100, -0.018), //     2240 → 2340  left hairpin
  straight(160), //         2340 → 2500
  bend(200, 0.003), //      2500 → 2700  finish, drifted flat out
];

/** Beats — total 2700 m. Boundaries: 140 320 440 600 700 900 1020 1110 1260 1460 1600 1710 1890 2110 2240 2340 2500. */
const CITY_FEATURES: TrackFeature[] = place([
  ...charms(50, 8, 1),
  ...charms(170, 10, 3),

  { kind: 'kicker', s: 340, rails: [0, 1, 2, 3] },
  { kind: 'grindrail', s: 380, length: 55, rails: [2] },
  { kind: 'checkpoint', s: 455 },

  ...charms(470, 10, 0),

  // First freight, on the climb, on the centre-left rail with three rails free
  // and 44 m of empty track behind it. Deliberately the easiest one in the game.
  { kind: 'freight', s: 622, length: 40, rails: [1], closingSpeed: 22 },

  { kind: 'barrier', s: 742, rails: [0, 1], clearance: 1.8 },
  ...charms(786, 9, 3),

  { kind: 'kicker', s: 918, rails: [1, 2] },
  { kind: 'grindrail', s: 958, length: 55, rails: [2] },

  // Hairpin left with nothing in it but a pad on the inside rail: a bend this
  // tight is already a full-charge drift, and stacking a hazard on it would
  // make the drift the wrong play.
  { kind: 'boostpad', s: 1040, rails: [0] },

  { kind: 'freight', s: 1130, length: 40, rails: [2], closingSpeed: 24 },
  { kind: 'gap', s: 1212, length: 16, rails: [0, 3] },
  { kind: 'checkpoint', s: 1250 },

  ...charms(1290, 11, 3),

  { kind: 'kicker', s: 1478, rails: [1, 2] },
  { kind: 'grindrail', s: 1520, length: 60, rails: [1] },

  ...charms(1620, 7, 0),

  // The busy straight: barrier down the middle, charms on the far rail, then
  // freight on the rail the charms left you sitting on. Taking the whole line
  // means paying attention to what comes after the payout.
  { kind: 'barrier', s: 1742, rails: [1, 2], clearance: 2.0 },
  ...charms(1776, 6, 3),
  { kind: 'freight', s: 1862, length: 40, rails: [0], closingSpeed: 26 },
  { kind: 'checkpoint', s: 1925 },

  ...charms(1950, 11, 3),
  { kind: 'boostpad', s: 2085, rails: [3] },

  { kind: 'kicker', s: 2128, rails: [1, 2] },
  { kind: 'grindrail', s: 2170, length: 60, rails: [2] },

  { kind: 'gap', s: 2380, length: 18, rails: [2, 3] },
  ...charms(2424, 7, 1),
  { kind: 'checkpoint', s: 2510 },

  // Finish: the longest grind on the level, on a sweeper, so the multiplier is
  // still climbing as the line arrives.
  { kind: 'kicker', s: 2530, rails: [0, 1, 2, 3] },
  { kind: 'grindrail', s: 2572, length: 88, rails: [1] },
]);

const CITY_VISUALS: LevelVisuals = {
  skyTop: '#120a2e',
  skyBottom: '#33115c',
  horizon: '#7a1f8c',
  fogColor: '#220f42',
  fogNear: 50,
  fogFar: 560,
  railColor: '#b9c3e6',
  sleeperColor: '#241a33',
  structureColor: '#2a1f45',
  accent: '#ff3fa4',
  accent2: '#3fe8ff',
  neon: 2.6,
  ambient: 0.55,
  keyLight: 0.35,
  keyColor: '#9a6bff',
  stars: false,
  rain: 0.15,
  wetness: 0.5,
  scenery: 'city',
};

// ── 3 · Monsoon Viaduct ─────────────────────────────────────────────────────

/**
 * Elevated, in a downpour. The airtime course.
 *
 * Everything is bigger here: the gaps are 22–30 m and always sit downstream of
 * a kicker, so the level is a sequence of committed launches rather than
 * flinches. That is also where the difficulty lives — a long jump is a long
 * window with nothing to do in it, and this is the first level whose par time
 * assumes you spent that window on tricks instead of waiting to land.
 */
const VIADUCT_SEGMENTS: TrackSegment[] = [
  straight(160), //             0 →  160
  bend(200, 0.008), //        160 →  360  right sweeper
  straight(140, 0.04), //     360 →  500  climb: kicker → gap → grind
  bend(120, -0.014), //       500 →  620  tight left
  straight(180, -0.05), //    620 →  800  descent, freight + barrier
  bend(240, 0.006), //        800 → 1040  the long sweeper
  straight(160), //          1040 → 1200
  bend(100, -0.019), //      1200 → 1300  left hairpin
  straight(200, 0.06), //    1300 → 1500  the climb chain
  bend(180, 0.009, -0.03), //1500 → 1680  right sweeper, dropping away
  straight(150), //          1680 → 1830  kicker → gap → grind
  bend(130, -0.013), //      1830 → 1960  tight left
  straight(190), //          1960 → 2150  the freight pair
  bend(220, 0.007), //       2150 → 2370  right sweeper
  straight(120, -0.07), //   2370 → 2490  steep descent into the big gap
  bend(110, -0.02), //       2490 → 2600  left hairpin
  straight(170), //          2600 → 2770
  bend(200, 0.008), //       2770 → 2970  final sweeper
  straight(230), //          2970 → 3200  finish
];

/** Beats — total 3200 m. Boundaries: 160 360 500 620 800 1040 1200 1300 1500 1680 1830 1960 2150 2370 2490 2600 2770 2970. */
const VIADUCT_FEATURES: TrackFeature[] = place([
  ...charms(60, 8, 2),
  ...charms(190, 11, 3),

  // The signature shape of this level, stated once up front: kicker, gap, grind
  // rail on the far side. The gap is unmissable from the kicker, so the player
  // learns to aim the landing rather than survive it.
  { kind: 'kicker', s: 372, rails: [0, 1, 2, 3] },
  { kind: 'gap', s: 416, length: 24, rails: [0, 1] },
  { kind: 'grindrail', s: 456, length: 40, rails: [2] },

  { kind: 'checkpoint', s: 505 },
  { kind: 'boostpad', s: 520, rails: [0] },
  ...charms(540, 6, 0),

  { kind: 'freight', s: 650, length: 44, rails: [2], closingSpeed: 26 },
  // Split barrier: the two open rails are the middle pair, so the escape from
  // the freight and the escape from the barrier are the same rail.
  { kind: 'barrier', s: 742, rails: [0, 3], clearance: 1.9 },

  ...charms(830, 12, 3),
  { kind: 'checkpoint', s: 1010 },

  { kind: 'kicker', s: 1060, rails: [1, 2] },
  { kind: 'grindrail', s: 1102, length: 60, rails: [1] },
  { kind: 'boostpad', s: 1180, rails: [2] },

  // The climb chain: gap, freight, barrier in 160 m, each with a different open
  // rail. This is the level's endurance test and it is uphill, so the speed
  // lost to a mistake here is the slowest to earn back.
  { kind: 'gap', s: 1330, length: 22, rails: [3] },
  { kind: 'freight', s: 1392, length: 44, rails: [1], closingSpeed: 28 },
  { kind: 'barrier', s: 1478, rails: [2, 3], clearance: 2.1 },

  ...charms(1530, 11, 3),
  { kind: 'checkpoint', s: 1665 },

  // 26 m of missing railbed across three rails. Rail 3 stays open for anyone
  // who has already spent their jump, but the fast line is over the top.
  { kind: 'kicker', s: 1700, rails: [0, 1, 2, 3] },
  { kind: 'gap', s: 1744, length: 26, rails: [0, 1, 2] },
  { kind: 'grindrail', s: 1782, length: 44, rails: [3] },

  ...charms(1855, 8, 0),

  { kind: 'freight', s: 1990, length: 44, rails: [0], closingSpeed: 24 },
  { kind: 'freight', s: 2078, length: 44, rails: [3], closingSpeed: 28 },

  { kind: 'checkpoint', s: 2170 },
  ...charms(2200, 12, 3),

  // Downhill kicker into the widest gap on the level — the grade means you are
  // already faster than you planned to be when it arrives.
  { kind: 'kicker', s: 2390, rails: [1, 2] },
  { kind: 'gap', s: 2436, length: 26, rails: [1, 2] },

  { kind: 'boostpad', s: 2560, rails: [0] },

  { kind: 'kicker', s: 2620, rails: [1, 2] },
  { kind: 'grindrail', s: 2662, length: 70, rails: [2] },

  { kind: 'checkpoint', s: 2790 },
  ...charms(2800, 12, 3),

  { kind: 'barrier', s: 3000, rails: [0, 1], clearance: 2.3 },
  { kind: 'kicker', s: 3050, rails: [0, 1, 2, 3] },
  { kind: 'grindrail', s: 3092, length: 70, rails: [1] },
  ...charms(3170, 3, 1),
]);

const VIADUCT_VISUALS: LevelVisuals = {
  skyTop: '#08131f',
  skyBottom: '#16324a',
  horizon: '#2d5f7d',
  fogColor: '#132b3e',
  fogNear: 45,
  fogFar: 420,
  railColor: '#9fb6c4',
  sleeperColor: '#1b2b33',
  structureColor: '#22333d',
  accent: '#5fd0ff',
  accent2: '#ffd75f',
  neon: 2.2,
  ambient: 0.5,
  keyLight: 0.3,
  keyColor: '#7fa8c9',
  stars: false,
  rain: 0.85,
  wetness: 0.9,
  scenery: 'viaduct',
};

// ── 4 · Undercity ───────────────────────────────────────────────────────────

/**
 * Service tunnels under the city. The level that takes the jump away.
 *
 * Three levels of training have made "jump when unsure" free. Every roof here
 * charges for it. The teaching order is strict: the first roof at 350 has
 * nothing under it, the second hides a freight so you must stay down *and*
 * switch, the third pays a charm run for staying down, and only then does the
 * 120 m roof at 2180 with two freights inside it show up.
 *
 * Nothing that has to be jumped is ever placed where a full-charge landing arc
 * comes down inside a roof — the barrier at 2940 is cleared by switching, and
 * the roof after it starts far enough on that even the greediest jump lands
 * first.
 */
const TUNNEL_SEGMENTS: TrackSegment[] = [
  straight(150), //             0 →  150
  bend(170, 0.009), //        150 →  320  right sweeper
  straight(130), //           320 →  450  first roof
  bend(140, -0.012), //       450 →  590  left sweeper
  straight(160), //           590 →  750  kicker + grind
  bend(110, 0.018), //        750 →  860  right hairpin
  straight(190), //           860 → 1050  roof with freight under it
  bend(200, -0.008, 0.05), // 1050 → 1250  climbing left sweeper
  straight(150, -0.06), //   1250 → 1400  descent, the gap pair
  bend(120, 0.015), //       1400 → 1520  tight right
  straight(180), //          1520 → 1700  the charm roof
  bend(210, -0.007), //      1700 → 1910  long left sweeper
  straight(140), //          1910 → 2050  kicker + grind
  bend(100, 0.021), //       2050 → 2150  right hairpin
  straight(200), //          2150 → 2350  the long roof
  bend(160, -0.014), //      2350 → 2510  tight left
  straight(170, 0.055), //   2510 → 2680  climb
  bend(230, 0.008), //       2680 → 2910  long right sweeper
  straight(150, -0.065), //  2910 → 3060  barrier then roof
  bend(120, -0.022), //      3060 → 3180  left hairpin
  straight(180), //          3180 → 3360
  bend(150, 0.005), //       3360 → 3510  final sweeper
  straight(190), //          3510 → 3700  last roof, then the line
];

/** Beats — total 3700 m. Boundaries: 150 320 450 590 750 860 1050 1250 1400 1520 1700 1910 2050 2150 2350 2510 2680 2910 3060 3180 3360 3510. */
const TUNNEL_FEATURES: TrackFeature[] = place([
  ...charms(50, 8, 2),
  ...charms(180, 10, 3),

  // Roof one: empty underneath, generous clearance. The only thing it can teach
  // is that the ceiling exists, so nothing else competes for attention.
  { kind: 'ceiling', s: 350, length: 70, clearance: 2.6 },

  ...charms(470, 9, 0),

  { kind: 'kicker', s: 610, rails: [1, 2] },
  { kind: 'grindrail', s: 652, length: 60, rails: [1] },
  { kind: 'checkpoint', s: 730 },

  // Roof two: freight inside it. Grounded is mandatory, so the only answer left
  // is the rail switch — the two mechanics have to be used together.
  { kind: 'ceiling', s: 900, length: 90, clearance: 2.4 },
  { kind: 'freight', s: 916, length: 44, rails: [1], closingSpeed: 20 },
  ...charms(1000, 4, 2),

  ...charms(1080, 12, 0),
  { kind: 'checkpoint', s: 1245 },

  // Open sky again, and the jump is immediately worth having back: two wide
  // gaps on opposite halves of the track, 48 m apart.
  { kind: 'gap', s: 1280, length: 20, rails: [2, 3] },
  { kind: 'gap', s: 1348, length: 20, rails: [0, 1] },

  { kind: 'boostpad', s: 1420, rails: [3] },

  // Roof three pays for obedience: the charm run only exists under it.
  { kind: 'ceiling', s: 1550, length: 100, clearance: 2.2 },
  ...charms(1560, 8, 2),
  { kind: 'checkpoint', s: 1670 },

  ...charms(1730, 12, 0),

  { kind: 'kicker', s: 1930, rails: [1, 2] },
  { kind: 'grindrail', s: 1972, length: 60, rails: [2] },

  // The long one: 120 m at 1.9 m of headroom with freight on both outside
  // rails, the second of which outlives the roof by 34 m so the exit is not the
  // relief it looks like.
  { kind: 'ceiling', s: 2180, length: 120, clearance: 1.9 },
  { kind: 'freight', s: 2200, length: 44, rails: [0], closingSpeed: 22 },
  { kind: 'freight', s: 2290, length: 44, rails: [3], closingSpeed: 22 },
  { kind: 'checkpoint', s: 2345 },

  ...charms(2380, 10, 0),

  { kind: 'kicker', s: 2530, rails: [1, 2] },
  { kind: 'grindrail', s: 2572, length: 60, rails: [1] },

  ...charms(2710, 12, 3),

  // Barrier, barrier, roof. Both barriers are cleared by switching rather than
  // by jumping, which is the whole point of putting a roof 44 m behind them.
  { kind: 'barrier', s: 2866, rails: [0, 1], clearance: 2.0 },
  { kind: 'barrier', s: 2940, rails: [2, 3], clearance: 1.8 },
  { kind: 'ceiling', s: 3010, length: 46, clearance: 2.0 },

  { kind: 'boostpad', s: 3080, rails: [0] },
  { kind: 'checkpoint', s: 3090 },

  { kind: 'kicker', s: 3200, rails: [1, 2] },
  { kind: 'grindrail', s: 3242, length: 70, rails: [2] },

  ...charms(3390, 10, 3),

  // Last roof, then 80 m of open track and a kicker on the line — the level
  // gives the jump back exactly once, for the finish.
  { kind: 'ceiling', s: 3540, length: 80, clearance: 2.5 },
  ...charms(3550, 5, 1),
  { kind: 'kicker', s: 3640, rails: [0, 1, 2, 3] },
]);

const TUNNEL_VISUALS: LevelVisuals = {
  skyTop: '#05050a',
  skyBottom: '#0b0806',
  horizon: '#1a1008',
  fogColor: '#080604',
  fogNear: 25,
  fogFar: 220,
  railColor: '#8f8378',
  sleeperColor: '#17120e',
  structureColor: '#241a12',
  accent: '#ffa42b',
  accent2: '#5cff9d',
  neon: 3.0,
  ambient: 0.3,
  keyLight: 0.12,
  keyColor: '#ffb35c',
  stars: false,
  rain: 0.05,
  wetness: 0.35,
  scenery: 'tunnel',
};

// ── 5 · Skybridge ───────────────────────────────────────────────────────────

/**
 * Above the cloud deck, five rails wide. The exam.
 *
 * Nothing new is introduced — every hazard type has already been taught — so
 * the difficulty is entirely density and speed. Five rails make the reads
 * genuinely ambiguous (a gap can now block four and still be legal), the
 * hairpins are the tightest the format allows, and the grind rails are the
 * longest in the game because at 62 m/s a 60 m grind is barely a second and
 * would not pay for the risk of reaching it.
 */
const SKYBRIDGE_SEGMENTS: TrackSegment[] = [
  straight(180), //             0 →  180
  bend(200, 0.008), //        180 →  380  right sweeper
  straight(140), //           380 →  520  kicker + long grind
  bend(120, -0.02), //        520 →  640  left hairpin
  straight(180), //           640 →  820  the gap pair
  bend(240, 0.007), //        820 → 1060  long right sweeper
  straight(160, -0.07), //   1060 → 1220  descent: freight + barrier
  bend(110, -0.023), //      1220 → 1330  left hairpin
  straight(190), //          1330 → 1520  the signature jump
  bend(200, 0.011), //       1520 → 1720  right sweeper
  straight(150, 0.06), //    1720 → 1870  climb under a roof
  bend(130, -0.016), //      1870 → 2000  tight left
  straight(210), //          2000 → 2210  the freight pair
  bend(240, 0.006), //       2210 → 2450  long right sweeper
  straight(160), //          2450 → 2610  kicker + long grind
  bend(120, -0.024), //      2610 → 2730  the tightest hairpin
  straight(200, -0.06), //   2730 → 2930  descent
  bend(140, 0.022), //       2930 → 3070  right hairpin
  straight(180), //          3070 → 3250  kicker + long grind
  bend(220, -0.009), //      3250 → 3470  long left sweeper
  straight(150), //          3470 → 3620  roof, then a barrier
  bend(130, 0.021), //       3620 → 3750  right hairpin
  straight(190), //          3750 → 3940  the last big jump
  bend(100, -0.005), //      3940 → 4040  finish sweep
  straight(160), //          4040 → 4200  the line
];

/** Beats — total 4200 m. Boundaries: 180 380 520 640 820 1060 1220 1330 1520 1720 1870 2000 2210 2450 2610 2730 2930 3070 3250 3470 3620 3750 3940 4040. */
const SKYBRIDGE_FEATURES: TrackFeature[] = place([
  ...charms(70, 9, 2),
  ...charms(210, 12, 4),

  { kind: 'kicker', s: 392, rails: [2, 3] },
  { kind: 'grindrail', s: 430, length: 85, rails: [2] },

  { kind: 'boostpad', s: 540, rails: [0] },

  // Two three-rail gaps whose survivors are on opposite edges, 46 m apart. On
  // five rails that is a full-width traverse at speed, or a jump.
  { kind: 'gap', s: 670, length: 26, rails: [0, 1, 2] },
  { kind: 'gap', s: 742, length: 26, rails: [2, 3, 4] },
  { kind: 'checkpoint', s: 800 },

  ...charms(850, 14, 4),

  { kind: 'freight', s: 1090, length: 46, rails: [2], closingSpeed: 28 },
  { kind: 'barrier', s: 1180, rails: [0, 1], clearance: 2.2 },

  // The signature jump: 30 m of nothing across four of five rails, off a kicker
  // on the rails you would be on coming out of the hairpin, onto a grind rail
  // that only rewards landing wide.
  { kind: 'kicker', s: 1350, rails: [2, 3] },
  { kind: 'gap', s: 1398, length: 30, rails: [0, 1, 2, 3] },
  { kind: 'grindrail', s: 1450, length: 60, rails: [3] },

  ...charms(1550, 13, 4),
  { kind: 'checkpoint', s: 1710 },

  // A roof on a climb, with the charm line under it — the Undercity callback,
  // at a speed where the reaction window is half what it was there.
  { kind: 'ceiling', s: 1750, length: 90, clearance: 2.2 },
  ...charms(1762, 6, 2),

  ...charms(1895, 8, 0),

  { kind: 'freight', s: 2030, length: 46, rails: [1], closingSpeed: 30 },
  { kind: 'freight', s: 2120, length: 46, rails: [3], closingSpeed: 30 },

  ...charms(2240, 14, 4),
  { kind: 'checkpoint', s: 2420 },

  { kind: 'kicker', s: 2470, rails: [1, 2] },
  { kind: 'grindrail', s: 2512, length: 80, rails: [2] },

  { kind: 'gap', s: 2760, length: 28, rails: [1, 2, 3] },
  { kind: 'freight', s: 2840, length: 46, rails: [4], closingSpeed: 30 },

  { kind: 'boostpad', s: 2950, rails: [4] },

  { kind: 'kicker', s: 3090, rails: [1, 2] },
  { kind: 'grindrail', s: 3132, length: 80, rails: [1] },
  { kind: 'checkpoint', s: 3230 },

  ...charms(3280, 14, 0),

  { kind: 'ceiling', s: 3490, length: 80, clearance: 1.9 },
  { kind: 'barrier', s: 3614, rails: [2, 3], clearance: 2.1 },

  // Last chance to bank a combo: kicker, 30 m gap, and the run-out grind on the
  // one rail the gap left open.
  { kind: 'kicker', s: 3770, rails: [0, 1] },
  { kind: 'gap', s: 3818, length: 30, rails: [1, 2, 3, 4] },
  { kind: 'grindrail', s: 3868, length: 66, rails: [0] },

  { kind: 'checkpoint', s: 3960 },
  ...charms(3990, 12, 2),
  { kind: 'boostpad', s: 4140, rails: [2] },
]);

const SKYBRIDGE_VISUALS: LevelVisuals = {
  skyTop: '#050318',
  skyBottom: '#1b1a5c',
  horizon: '#4b3fa8',
  fogColor: '#171445',
  fogNear: 70,
  fogFar: 900,
  railColor: '#dfe4ff',
  sleeperColor: '#1d1b3d',
  structureColor: '#282552',
  accent: '#a07bff',
  accent2: '#4ef0ff',
  neon: 2.8,
  ambient: 0.6,
  keyLight: 0.45,
  keyColor: '#b9a8ff',
  stars: true,
  rain: 0,
  wetness: 0.2,
  scenery: 'skybridge',
};

// ── The table ───────────────────────────────────────────────────────────────

/**
 * The five courses.
 *
 * `parTime` is length ÷ (target speed × 0.82) — the 0.82 is what a run that
 * drifts most bends but does not chain them holds on average, so par is a
 * "played it properly once" time rather than a record. `rankThresholds` are
 * pinned to the same reference run: A sits roughly where a clean, unspectacular
 * lap lands, so S has to come from combos rather than from finishing.
 */
export const LEVELS: Record<LevelId, LevelConfig> = {
  1: {
    id: 1,
    name: 'Harbor Line',
    subtitle: 'Dusk over the container docks',
    rails: 3,
    targetSpeed: 42,
    maxSpeed: 61,
    cargo: 5,
    parTime: 64,
    rankThresholds: [18000, 28000, 40000, 56000],
    segments: HARBOR_SEGMENTS,
    features: HARBOR_FEATURES,
    visuals: HARBOR_VISUALS,
  },
  2: {
    id: 2,
    name: 'Neon Ward',
    subtitle: 'Four rails through the signage',
    rails: 4,
    targetSpeed: 48,
    maxSpeed: 70,
    cargo: 4,
    parTime: 69,
    rankThresholds: [30000, 45000, 65000, 88000],
    segments: CITY_SEGMENTS,
    features: CITY_FEATURES,
    visuals: CITY_VISUALS,
  },
  3: {
    id: 3,
    name: 'Monsoon Viaduct',
    subtitle: 'Elevated, and it will not stop raining',
    rails: 4,
    targetSpeed: 53,
    maxSpeed: 77,
    cargo: 4,
    parTime: 74,
    rankThresholds: [42000, 63000, 90000, 120000],
    segments: VIADUCT_SEGMENTS,
    features: VIADUCT_FEATURES,
    visuals: VIADUCT_VISUALS,
  },
  4: {
    id: 4,
    name: 'Undercity',
    subtitle: 'Low roofs, hot sparks, stay down',
    rails: 4,
    targetSpeed: 57,
    maxSpeed: 83,
    cargo: 3,
    parTime: 79,
    rankThresholds: [55000, 80000, 115000, 150000],
    segments: TUNNEL_SEGMENTS,
    features: TUNNEL_FEATURES,
    visuals: TUNNEL_VISUALS,
  },
  5: {
    id: 5,
    name: 'Skybridge',
    subtitle: 'Five rails above the cloud deck',
    rails: 5,
    targetSpeed: 62,
    maxSpeed: 90,
    cargo: 3,
    parTime: 83,
    rankThresholds: [68000, 100000, 140000, 185000],
    segments: SKYBRIDGE_SEGMENTS,
    features: SKYBRIDGE_FEATURES,
    visuals: SKYBRIDGE_VISUALS,
  },
};

/** Play order, which is also unlock order. */
export const LEVEL_ORDER: LevelId[] = [1, 2, 3, 4, 5];

export function getLevel(id: LevelId): LevelConfig {
  return LEVELS[id];
}
