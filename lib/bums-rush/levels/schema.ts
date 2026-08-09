/**
 * Bum's Rush — zod schemas for the `Level` contract (`../types.ts`).
 *
 * Levels are hand-written JSON (design doc §6.1), not code, so the same
 * argument that justifies `lib/catalog/types.ts` applies here even more
 * strongly: eight worlds' worth of levels are authored by hand across many
 * agents and sessions, and a typo'd key or a wrong field name must fail loudly
 * at parse time rather than silently render a blank or broken level in
 * production. Every object schema below is a `z.strictObject` for exactly
 * that reason — an unknown key is a parse error, not ignored data.
 *
 * `types.ts` owns the canonical shape (every other module codes against it);
 * this file owns validating untrusted JSON against that shape. The bottom of
 * the file asserts, at compile time, that `z.infer<typeof levelSchema>` is
 * assignable to `Level` — and the same for every union it is built from — so
 * the hand-written interface and the schema cannot silently drift apart. If
 * `types.ts` grows a field this file doesn't know about, or a variant here
 * stops matching its interface, `tsc` fails on the assertions at the bottom,
 * not on some downstream consumer three files away.
 */

import { z } from 'zod';
import type {
  Checkpoint,
  Decoration,
  GeometryPiece,
  Hazard,
  Level,
  LevelPalette,
  Objective,
  Prop,
  Shape,
  SnapshotPredicate,
} from '../types';

// ─── Geometry ───────────────────────────────────────────────────────────────

export const vec2Schema = z.strictObject({
  x: z.number(),
  y: z.number(),
});

/**
 * A `Vec2` used as a `size` field. Sizes are the extent of a rect measured
 * from its `at`/`x,y` anchor (top-left convention — see the note on
 * `rectShapeSchema` below); zero or negative would mean invisible or
 * inside-out geometry, which is always an authoring mistake, not a valid
 * degenerate case.
 */
const sizeSchema = z.strictObject({
  x: z.number().positive(),
  y: z.number().positive(),
});

/**
 * A direction vector (fans, wind). `{x:0, y:0}` type-checks but is always a
 * mistake — a directionless force is either a missing value or the wrong
 * prop kind — so it is rejected here rather than left for a confusing runtime
 * no-op.
 */
const dirSchema = vec2Schema.refine((v) => v.x !== 0 || v.y !== 0, {
  message: 'direction vector must be non-zero',
});

/**
 * `Rect`/`Shape` (`kind: 'rect'`) both use **top-left + extent**, the same
 * convention `lib/house-always-wins/types.ts`'s `Rect` uses (confirmed by its
 * `rectIntersect`/`rectCenter` helpers) — not the matter.js center
 * convention. `types.ts` does not say which, so this is a deliberate,
 * documented choice made once here so every level author and every consumer
 * (the loader's overlap/bounds checks, the eventual engine code) works from
 * the same anchor. A `platformMoving`/`crate`/etc. `at` is likewise top-left
 * of its `size` box, for the same consistency reason.
 */
export const rectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const shapeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    angle: z.number().optional(),
  }),
  z.strictObject({
    kind: z.literal('circle'),
    x: z.number(),
    y: z.number(),
    r: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal('poly'),
    x: z.number(),
    y: z.number(),
    // A polygon needs at least 3 vertices to enclose any area; points are
    // local offsets from (x, y) (matter.js `Bodies.fromVertices` convention).
    points: z.array(vec2Schema).min(3),
    angle: z.number().optional(),
  }),
  z.strictObject({
    kind: z.literal('chain'),
    // A rope/chain-like path — points are absolute world coordinates (there
    // is no separate x/y anchor to offset from, unlike `poly`).
    points: z.array(vec2Schema).min(2),
    thickness: z.number().positive(),
  }),
]);

// ─── Materials & render styles (§6.2, §2.6) ─────────────────────────────────

export const materialIdSchema = z.enum(['paper', 'rubber', 'ice', 'grease', 'crumbly', 'nogrip']);

export const renderStyleSchema = z.enum(['drawn', 'cutout', 'taped', 'pinned', 'torn']);

// ─── Signals (§6.2 `signalRelay`) ───────────────────────────────────────────

export const signalIdSchema = z.string().min(1);
export const signalOpSchema = z.enum(['and', 'or', 'not', 'delay']);

// ─── Props (§6.2) ───────────────────────────────────────────────────────────

/** Shared by every prop variant — spread first so `kind` stays discriminant-first below. */
const propBase = {
  id: z.string().min(1),
  at: vec2Schema,
  angle: z.number().optional(),
};

export const propSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...propBase,
    kind: z.literal('crate'),
    size: sizeSchema,
    mass: z.number().positive().optional(),
    material: materialIdSchema.optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('swing'),
    length: z.number().positive(),
    damping: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('rope'),
    // §6.2: "chain of 8-20 linked segments" is the typical range; the schema
    // allows a little either side rather than hard-locking authors to it.
    segments: z.number().int().min(2).max(40),
    stiffness: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('platformMoving'),
    size: sizeSchema,
    path: z.array(vec2Schema).min(2),
    speed: z.number().positive(),
    loop: z.boolean().optional(),
    material: materialIdSchema.optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('platformFalling'),
    size: sizeSchema,
    delayMs: z.number().nonnegative(),
    material: materialIdSchema.optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('lever'),
    length: z.number().positive(),
    threshold: z.number(),
    signal: signalIdSchema,
    latching: z.boolean().optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('button'),
    size: sizeSchema,
    minMass: z.number().positive(),
    signal: signalIdSchema,
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('door'),
    size: sizeSchema,
    signal: signalIdSchema,
    openOffset: vec2Schema,
    speed: z.number().positive(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('key'),
    lockId: z.string().min(1),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('popCannon'),
    power: z.number().positive(),
    cooldownMs: z.number().nonnegative(),
    arc: z.number(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('fan'),
    size: sizeSchema,
    dir: dirSchema,
    force: z.number().positive(),
    pulseMs: z.number().positive().optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('conveyor'),
    size: sizeSchema,
    speed: z.number(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('skiLift'),
    path: z.array(vec2Schema).min(2),
    speed: z.number().positive(),
    chairs: z.number().int().min(1).max(12),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('trampoline'),
    size: sizeSchema,
    bounce: z.number().positive(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('magnet'),
    radius: z.number().positive(),
    force: z.number(),
    polarity: z.union([z.literal(1), z.literal(-1)]),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('zeroG'),
    size: sizeSchema,
    g: z.number().min(0).max(1),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('thruster'),
    impulse: z.number().positive(),
    charges: z.number().int().positive(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('relic'),
    relicId: z.string().min(1),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('parcel'),
    parcelId: z.string().min(1),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('poseOutline'),
    poseId: z.string().min(1),
    tolerance: z.number().positive(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('camera'),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('paperweight'),
    durationMs: z.number().positive().optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('stretchInk'),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('rescueDrone'),
    cooldownMs: z.number().positive().optional(),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('plate'),
    recipeId: z.string().min(1),
    slots: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    ...propBase,
    kind: z.literal('signalRelay'),
    op: signalOpSchema,
    inputs: z.array(signalIdSchema).min(1),
    out: signalIdSchema,
    delayMs: z.number().nonnegative().optional(),
  }),
]);

// ─── Hazards (§6.3) ─────────────────────────────────────────────────────────

const hazardBase = { id: z.string().min(1) };

export const hazardSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...hazardBase, kind: z.literal('spikes'), shape: shapeSchema }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('laser'),
    from: vec2Schema,
    to: vec2Schema,
    onMs: z.number().positive(),
    offMs: z.number().positive(),
    phaseMs: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('saw'),
    at: vec2Schema,
    r: z.number().positive(),
    path: z.array(vec2Schema).min(2).optional(),
    speed: z.number().optional(),
  }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('crusher'),
    shape: shapeSchema,
    path: z.array(vec2Schema).min(2),
    speed: z.number().positive(),
  }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('heat'),
    shape: shapeSchema,
    graceMs: z.number().positive(),
  }),
  z.strictObject({ ...hazardBase, kind: z.literal('void'), shape: shapeSchema }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('wind'),
    shape: shapeSchema,
    dir: dirSchema,
    force: z.number().positive(),
    periodMs: z.number().positive().optional(),
  }),
  z.strictObject({
    ...hazardBase,
    kind: z.literal('crumble'),
    shape: shapeSchema,
    delayMs: z.number().nonnegative(),
  }),
]);

// ─── Objectives (§7) ────────────────────────────────────────────────────────

/** Every field optional and ANDed together — a predicate over sim state, never image analysis. */
export const snapshotPredicateSchema = z.strictObject({
  minSeats: z.number().int().min(1).max(4).optional(),
  allSeatsInFrame: z.boolean().optional(),
  allAirborne: z.boolean().optional(),
  anyInverted: z.boolean().optional(),
  nearPropId: z.string().min(1).optional(),
  chainedSeats: z.number().int().min(2).max(4).optional(),
});

export const objectiveSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('clock'), id: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('haul'),
    id: z.string().min(1),
    relicIds: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    kind: z.literal('pose'),
    id: z.string().min(1),
    poseId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('snapshot'),
    id: z.string().min(1),
    predicate: snapshotPredicateSchema,
  }),
  z.strictObject({
    kind: z.literal('recipe'),
    id: z.string().min(1),
    recipeId: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('flawless'), id: z.string().min(1) }),
]);

// ─── Levels (§6.1) ──────────────────────────────────────────────────────────

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'expected a 6-digit hex color, e.g. "#f4ead6"');

export const levelPaletteSchema = z.strictObject({
  paper: hexColorSchema,
  ink: hexColorSchema,
  accent: hexColorSchema,
  // §2.8: a literal `true` so an author cannot quietly opt out of flash safety.
  flashSafe: z.literal(true),
  // Asserted against the *actual* computed ink/paper ratio by
  // `levels/validate.ts` — a level that declares a number it didn't measure
  // is exactly the bug this field exists to catch.
  contrastRatio: z.number().min(7),
});

export const checkpointSchema = z.strictObject({
  at: vec2Schema,
  // Only active under the Extra Checkpoints assist (§4.7).
  optional: z.boolean().default(false),
});

export const geometryPieceSchema = z.strictObject({
  shape: shapeSchema,
  material: materialIdSchema,
  render: renderStyleSchema,
  grabbable: z.boolean().default(true),
});

export const decorationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('note'),
    at: vec2Schema,
    textKey: z.string().min(1),
    width: z.number().positive().optional(),
  }),
  z.strictObject({
    kind: z.literal('doodle'),
    at: vec2Schema,
    sprite: z.string().min(1),
    angle: z.number().optional(),
    scale: z.number().positive().optional(),
  }),
  z.strictObject({ kind: z.literal('arrow'), from: vec2Schema, to: vec2Schema }),
  z.strictObject({ kind: z.literal('stain'), at: vec2Schema, r: z.number().positive() }),
]);

/**
 * `name` is an i18n KEY (design doc §15), never display text — e.g.
 * `bums.level.w1-01.name` or `bums.showdown.w1-a.name`. This regex is a cheap
 * net for the single most likely authoring mistake (typing the English name
 * where the key belongs), which is exactly the kind of silent, permanent i18n
 * bug §15 calls out — it does not, and cannot, guarantee the key actually
 * exists in `locales/en/`.
 */
const levelNameKeySchema = z
  .string()
  .regex(
    /^bums\.(level|showdown)\.[a-z0-9-]+\.name$/,
    'name must be an i18n key of the form "bums.level.<id>.name" or "bums.showdown.<id>.name", not display text',
  );

/**
 * `id` covers both campaign levels (`w<world>-<two-digit index>`, e.g.
 * `w3-07`) and Showdown arenas (`w<world>-<letter>`, e.g. `w1-a`) — arenas
 * are `Level` objects loaded through this same schema (§18's file map: they
 * live under `data/bums-rush/levels/showdown/`), and §8.1 caps arenas at 7 per
 * world, hence `a`-`g`. The design doc's abridged example
 * (`/^w[1-8]-\d{2}$/`) covers campaign levels only; this is the deliberate
 * widening that also accepts the arena form.
 */
const levelIdSchema = z
  .string()
  .regex(/^w[1-8]-(\d{2}|[a-g])$/, 'id must look like "w3-07" (campaign) or "w1-a" (showdown)');

export const levelSchema = z.strictObject({
  version: z.literal(1),
  id: levelIdSchema,
  world: z.number().int().min(1).max(8),
  index: z.number().int().min(1),
  name: levelNameKeySchema,
  minPlayers: z.number().int().min(1).max(4),
  maxPlayers: z.number().int().min(1).max(4).default(4),
  parSeconds: z.number().positive(),
  minPlausibleSeconds: z.number().positive().optional(),
  bounds: rectSchema,
  palette: levelPaletteSchema,
  spawn: z.array(vec2Schema).min(1).max(4),
  goal: z.strictObject({ shape: shapeSchema, requires: z.enum(['any', 'all']) }),
  checkpoints: z.array(checkpointSchema),
  geometry: z.array(geometryPieceSchema),
  props: z.array(propSchema),
  hazards: z.array(hazardSchema),
  // §7: every level carries exactly three objectives.
  objectives: z.array(objectiveSchema).length(3),
  decorations: z.array(decorationSchema),
  assistBeams: z.array(shapeSchema),
  music: z.string().min(1),
  bpm: z.number().positive().optional(),
  beatOffsetMs: z.number().nonnegative().optional(),
  authorNotes: z.string().optional(),
})
  // `maxPlayers` must be able to seat `minPlayers` — a level that requires 2
  // but caps at 1 could never start, and nothing in the field-level schema
  // above can express a cross-field constraint like that.
  .refine((level) => level.maxPlayers >= level.minPlayers, {
    message: 'maxPlayers must be >= minPlayers',
    path: ['maxPlayers'],
  });

export type ParsedLevel = z.infer<typeof levelSchema>;

// ─── Compile-time drift guards ──────────────────────────────────────────────
//
// Each line below is erased by the compiler and has no runtime effect. Its
// only job is to fail `tsc` the moment a schema's inferred output stops being
// assignable to its hand-written counterpart in `types.ts` — checked per
// union (not just once at `Level`) so a mismatch is pinned to the exact
// schema that caused it rather than surfacing as one large, hard-to-read
// error on `levelSchema` alone.

const _shapeShapeCheck: Shape = {} as z.infer<typeof shapeSchema>;
const _propShapeCheck: Prop = {} as z.infer<typeof propSchema>;
const _hazardShapeCheck: Hazard = {} as z.infer<typeof hazardSchema>;
const _predicateShapeCheck: SnapshotPredicate = {} as z.infer<typeof snapshotPredicateSchema>;
const _objectiveShapeCheck: Objective = {} as z.infer<typeof objectiveSchema>;
const _paletteShapeCheck: LevelPalette = {} as z.infer<typeof levelPaletteSchema>;
const _checkpointShapeCheck: Checkpoint = {} as z.infer<typeof checkpointSchema>;
const _geometryShapeCheck: GeometryPiece = {} as z.infer<typeof geometryPieceSchema>;
const _decorationShapeCheck: Decoration = {} as z.infer<typeof decorationSchema>;
const _levelShapeCheck: Level = {} as ParsedLevel;

void _shapeShapeCheck;
void _propShapeCheck;
void _hazardShapeCheck;
void _predicateShapeCheck;
void _objectiveShapeCheck;
void _paletteShapeCheck;
void _checkpointShapeCheck;
void _geometryShapeCheck;
void _decorationShapeCheck;
void _levelShapeCheck;
