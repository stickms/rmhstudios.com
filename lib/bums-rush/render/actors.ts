/**
 * Layer 3 — the cast. The only layer that is redrawn every frame.
 *
 * A character is a head and two arms (§2.4). No body, no legs, because the head
 * is where the personality is and the arms have to read as "that is a grabbing
 * arm" from across a four-player scramble. Everything here is therefore drawn
 * in service of three readability jobs, in priority order:
 *
 * 1. **Which hand is doing what.** Open / reaching / fist is the single most
 *    important affordance in the game — worth more than any HUD indicator — so
 *    the three poses are drawn as three genuinely different silhouettes, not as
 *    the same mitten in three tints.
 * 2. **Which one is me.** Seat identity is colour *and* a forehead mark
 *    (`● ▲ ■ ✚`) *and* an optional name tag (§2.8). The mark is the channel the
 *    colourblind-safe claim actually rests on, so it is drawn at a size that
 *    survives a 6" screen, and the head silhouette is distinct at 32px.
 * 3. **How fast am I going.** Squash and stretch come in on `RenderSeat` as
 *    `scaleX`/`scaleY` (§2.7) and are applied as a plain context scale, so the
 *    whole head — face, mark, hat — deforms together the way a drawn one would.
 *
 * The heads are schematic on purpose. Sixteen bespoke draw routines would be
 * sixteen things to keep consistent; instead each head is a radius function plus
 * a couple of appendages drawn from the same primitives, which is what makes
 * them look like one person drew all of them.
 */

import { PHYSICS, RENDER, SEAT_MARKS } from '../constants';
import {
  isGlovesId,
  isHatId,
  isHeadId,
  type GlovesId,
  type HatId,
  type HeadId,
} from '../cosmetics';
import type { RenderSeat, Vec2 } from '../types';
import type { BoilField } from './boil';
import { saltFromId, vertexId } from './boil';
import {
  inkArc,
  inkCircle,
  inkLine,
  inkPolygon,
  inkStroke,
  smoothPolyline,
  smoothedX,
  smoothedY,
  type StrokeOptions,
} from './ink';
import { seatInk, withAlpha, type BumPalette } from './theme';

const HEAD_R = PHYSICS.HEAD_RADIUS;
const HAND_R = PHYSICS.HAND_RADIUS;
/** Head outline resolution. 22 points is enough for the boil to read as a wobble. */
const HEAD_SEGMENTS = 22;
/** Root and wrist widths of an arm stroke, design px (§2.4). */
const ARM_WIDTH_ROOT = 7;
const ARM_WIDTH_WRIST = 3;

/**
 * One reused options object for the fine details (face, fingers, knuckles).
 * They are drawn eight to twenty times a seat, and each of them would otherwise
 * cost an object literal AND a second graphite fill for a line too thin to show
 * one.
 */
const FINE: StrokeOptions = { width: 2, color: '', graphite: false };

function fine(from: StrokeOptions, width: number): StrokeOptions {
  FINE.width = width;
  FINE.color = from.color;
  FINE.alpha = from.alpha;
  FINE.boil = from.boil;
  FINE.salt = from.salt;
  FINE.amplitude = from.amplitude;
  return FINE;
}

const HEAD_X = new Float64Array(HEAD_SEGMENTS);
const HEAD_Y = new Float64Array(HEAD_SEGMENTS);
const SCRATCH_X = new Float64Array(16);
const SCRATCH_Y = new Float64Array(16);

export interface ActorContext {
  palette: BumPalette;
  boil: BoilField;
  /** Display name per seat index; null hides the tag for that seat. */
  names: readonly (string | null)[];
  /** Settings → "Always show name tags" (§2.8). */
  showTags: boolean;
  /** Design px the character is squeezed into at the current zoom — tags hide when tiny. */
  zoom: number;
}

// ─── Heads (§2.4) ───────────────────────────────────────────────────────────

/** Multiplier on `HEAD_RADIUS` at a given angle (0 = right, clockwise in canvas space). */
type RadiusFn = (angle: number) => number;
/** Appendages and face furniture, drawn in head-local space after the outline. */
type ExtrasFn = (ctx: CanvasRenderingContext2D, stroke: StrokeOptions, palette: BumPalette) => void;

interface HeadProfile {
  radius: RadiusFn;
  extras?: ExtrasFn;
}

/** A rounded block — the superellipse the eraser and the speaker are built on. */
function block(power: number, squash = 1): RadiusFn {
  return (a) => {
    const c = Math.abs(Math.cos(a)) ** power;
    const s = (Math.abs(Math.sin(a)) / squash) ** power;
    return (c + s) ** (-1 / power);
  };
}

/** A regular star with `points` spikes — shuriken, whisk dome. */
function star(points: number, depth: number): RadiusFn {
  return (a) => 1 - depth * 0.5 * (1 - Math.cos(a * points));
}

const ROUND: RadiusFn = () => 1;

function drawEllipseHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stroke: StrokeOptions,
): void {
  inkArc(ctx, x, y, r, 0, Math.PI * 2, { ...stroke, width: 2 }, 10);
}

/**
 * The sixteen launch heads. Unknown ids fall back to `biro`, which matters:
 * cosmetics arrive over the wire from other players and a peer on a newer
 * build must not be able to make this throw.
 */
const HEADS: Readonly<Record<HeadId, HeadProfile>> = {
  biro: { radius: ROUND },
  eraser: {
    radius: block(4, 0.82),
    extras: (ctx, stroke) => {
      // The worn corner: a chunk taken out of the top-right.
      inkLine(ctx, HEAD_R * 0.55, -HEAD_R * 0.72, HEAD_R * 0.95, -HEAD_R * 0.3, {
        ...stroke,
        width: 2,
      });
    },
  },
  sharpener: {
    radius: (a) => 0.72 + 0.34 * Math.max(0, Math.cos(a - Math.PI / 2)),
    extras: (ctx, stroke) => drawEllipseHole(ctx, 0, HEAD_R * 0.18, HEAD_R * 0.3, stroke),
  },
  staple: {
    radius: block(6, 0.55),
    extras: (ctx, stroke) => {
      inkLine(ctx, -HEAD_R * 0.9, HEAD_R * 0.45, -HEAD_R * 0.9, HEAD_R * 1.15, {
        ...stroke,
        width: 3,
      });
      inkLine(ctx, HEAD_R * 0.9, HEAD_R * 0.45, HEAD_R * 0.9, HEAD_R * 1.15, {
        ...stroke,
        width: 3,
      });
    },
  },
  'paper-plane': {
    radius: (a) => {
      // A folded triangle: three flat sides with a nose to the right.
      const k = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return 0.78 + 0.4 * Math.cos(((k - 0.4) * 3) / 2) ** 2;
    },
    extras: (ctx, stroke) =>
      inkLine(ctx, -HEAD_R * 0.7, 0, HEAD_R * 0.9, 0, { ...stroke, width: 2 }),
  },
  teacup: {
    radius: block(3, 1.1),
    extras: (ctx, stroke) =>
      inkArc(ctx, HEAD_R, 0, HEAD_R * 0.45, -1.4, 1.4, { ...stroke, width: 3 }),
  },
  whisk: {
    radius: star(6, 0.16),
    extras: (ctx, stroke) => {
      for (let i = -1; i <= 1; i++) {
        inkArc(ctx, 0, -HEAD_R * 0.1, HEAD_R * (0.92 + i * 0.06), 0.4, Math.PI - 0.4, {
          ...stroke,
          width: 1.6,
        });
      }
    },
  },
  balloon: {
    radius: (a) => 1 - 0.12 * Math.max(0, Math.sin(a)),
    extras: (ctx, stroke) => {
      SCRATCH_X[0] = 0;
      SCRATCH_Y[0] = HEAD_R;
      SCRATCH_X[1] = HEAD_R * 0.25;
      SCRATCH_Y[1] = HEAD_R * 1.5;
      SCRATCH_X[2] = -HEAD_R * 0.15;
      SCRATCH_Y[2] = HEAD_R * 2;
      inkStroke(ctx, SCRATCH_X, SCRATCH_Y, 3, { ...stroke, width: 1.8 });
    },
  },
  lightbulb: {
    radius: (a) => 1 - 0.22 * Math.max(0, Math.sin(a)) ** 2,
    extras: (ctx, stroke) => {
      inkLine(ctx, -HEAD_R * 0.4, HEAD_R * 0.85, HEAD_R * 0.4, HEAD_R * 0.85, {
        ...stroke,
        width: 3,
      });
      inkArc(ctx, 0, -HEAD_R * 0.1, HEAD_R * 0.3, Math.PI, Math.PI * 2, { ...stroke, width: 1.6 });
    },
  },
  helm: {
    radius: block(3),
    extras: (ctx, stroke, palette) => {
      ctx.fillStyle = withAlpha(palette.ink, 0.75);
      ctx.fillRect(-HEAD_R * 0.75, -HEAD_R * 0.2, HEAD_R * 1.5, HEAD_R * 0.28);
    },
  },
  inkpot: {
    radius: (a) => 0.78 + 0.3 * Math.max(0, Math.sin(a)),
    extras: (ctx, stroke) => {
      inkArc(
        ctx,
        HEAD_R * 0.55,
        HEAD_R * 0.7,
        HEAD_R * 0.2,
        0,
        Math.PI * 2,
        { ...stroke, width: 2 },
        8,
      );
    },
  },
  shuriken: { radius: star(4, 0.5) },
  snowball: {
    radius: (a) => 1 + 0.07 * Math.cos(a * 5) + 0.04 * Math.sin(a * 3),
    extras: (ctx, stroke) => {
      SCRATCH_X[0] = HEAD_R * 0.2;
      SCRATCH_Y[0] = 0;
      SCRATCH_X[1] = HEAD_R * 1.4;
      SCRATCH_Y[1] = HEAD_R * 0.12;
      SCRATCH_X[2] = HEAD_R * 0.2;
      SCRATCH_Y[2] = HEAD_R * 0.24;
      inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 3, { ...stroke, width: 2 });
    },
  },
  helmet: {
    radius: block(2.4, 0.95),
    extras: (ctx, stroke) => {
      inkLine(ctx, HEAD_R * 0.6, -HEAD_R * 0.7, HEAD_R * 1.1, -HEAD_R * 1.3, {
        ...stroke,
        width: 2,
      });
      inkArc(
        ctx,
        HEAD_R * 1.15,
        -HEAD_R * 1.4,
        HEAD_R * 0.14,
        0,
        Math.PI * 2,
        { ...stroke, width: 2 },
        8,
      );
    },
  },
  speaker: {
    radius: block(5, 0.9),
    extras: (ctx, stroke) => {
      for (let i = -1; i <= 1; i++) {
        inkArc(ctx, 0, 0, HEAD_R * (0.4 + i * 0.22 + 0.22), -1, 1, { ...stroke, width: 1.6 });
      }
    },
  },
  inkblot: {
    radius: (a) => 1 + 0.1 * Math.cos(a * 4 + 0.6),
    extras: (ctx, stroke) => {
      // The studio cat's ears.
      for (const side of [-1, 1]) {
        SCRATCH_X[0] = side * HEAD_R * 0.75;
        SCRATCH_Y[0] = -HEAD_R * 0.6;
        SCRATCH_X[1] = side * HEAD_R * 0.85;
        SCRATCH_Y[1] = -HEAD_R * 1.4;
        SCRATCH_X[2] = side * HEAD_R * 0.3;
        SCRATCH_Y[2] = -HEAD_R * 0.95;
        inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 3, { ...stroke, width: 2 });
      }
    },
  },
};

/**
 * Cosmetic ids arrive over the wire from other players, so an unrecognised one
 * must not be able to throw four other browsers. `cosmetics.ts` owns the legal
 * set; this only owns what each id looks like.
 */
function headProfile(id: string): HeadProfile {
  return isHeadId(id) ? HEADS[id] : HEADS.biro;
}

// ─── Hats (§2.5) ────────────────────────────────────────────────────────────
//
// Twenty-four ids, eight shapes. A hat is a silhouette on top of a silhouette,
// so what matters is the outline: cone, dome, brim, box, ring, tube, zigzag,
// horns. Unknown ids draw nothing rather than guessing — a peer on a newer
// build should look hatless, not wrong.

type HatShape = 'cone' | 'dome' | 'brim' | 'box' | 'ring' | 'tube' | 'zigzag' | 'horns';

/**
 * All twenty-four hat ids from `cosmetics.ts`, each mapped to one of eight
 * silhouettes. A `Record<HatId, …>` on purpose: a hat added to the catalog
 * without a silhouette here should fail to compile, not render bare-headed.
 */
const HATS: Readonly<Record<HatId, HatShape>> = {
  'party-hat': 'cone',
  'chefs-toque': 'dome',
  colander: 'dome',
  'traffic-cone': 'cone',
  snorkel: 'tube',
  'sticky-note': 'box',
  halo: 'ring',
  'paperclip-crown': 'zigzag',
  'pencil-topper': 'tube',
  'envelope-fold': 'box',
  'binder-clip': 'box',
  'thumbtack-crown': 'zigzag',
  'bandana-doodle': 'ring',
  'propeller-cap': 'tube',
  'graduation-cap': 'brim',
  'pirate-fold': 'brim',
  'crown-of-tape': 'zigzag',
  'rubber-band-tangle': 'ring',
  'push-pin-halo': 'ring',
  'folder-tab': 'box',
  'stamp-hat': 'box',
  'ribbon-bow': 'horns',
  'eraser-topper': 'box',
  'crown-bent': 'zigzag',
};

function drawHat(
  ctx: CanvasRenderingContext2D,
  hat: string | null,
  stroke: StrokeOptions,
  palette: BumPalette,
): void {
  if (!hat || !isHatId(hat)) return;
  const shape = HATS[hat];
  const top = -HEAD_R * 0.85;
  switch (shape) {
    case 'cone':
      SCRATCH_X[0] = -HEAD_R * 0.7;
      SCRATCH_Y[0] = top;
      SCRATCH_X[1] = 0;
      SCRATCH_Y[1] = top - HEAD_R * 1.3;
      SCRATCH_X[2] = HEAD_R * 0.7;
      SCRATCH_Y[2] = top;
      inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 3, stroke);
      break;
    case 'dome':
      inkArc(ctx, 0, top, HEAD_R * 0.85, Math.PI, Math.PI * 2, stroke, 10);
      inkLine(ctx, -HEAD_R * 0.85, top, HEAD_R * 0.85, top, stroke);
      break;
    case 'brim':
      inkLine(ctx, -HEAD_R * 1.2, top, HEAD_R * 1.2, top, { ...stroke, width: 4 });
      inkArc(ctx, 0, top, HEAD_R * 0.6, Math.PI, Math.PI * 2, stroke, 8);
      break;
    case 'box':
      SCRATCH_X[0] = -HEAD_R * 0.65;
      SCRATCH_Y[0] = top;
      SCRATCH_X[1] = -HEAD_R * 0.65;
      SCRATCH_Y[1] = top - HEAD_R * 0.9;
      SCRATCH_X[2] = HEAD_R * 0.65;
      SCRATCH_Y[2] = top - HEAD_R * 0.9;
      SCRATCH_X[3] = HEAD_R * 0.65;
      SCRATCH_Y[3] = top;
      inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 4, stroke);
      break;
    case 'ring':
      inkArc(
        ctx,
        0,
        top - HEAD_R * 0.55,
        HEAD_R * 0.6,
        0,
        Math.PI * 2,
        {
          ...stroke,
          width: 3,
          color: palette.highlight,
        },
        12,
      );
      break;
    case 'tube':
      inkLine(ctx, HEAD_R * 0.3, top, HEAD_R * 0.5, top - HEAD_R * 1.2, { ...stroke, width: 4 });
      break;
    case 'zigzag':
      for (let i = 0; i < 5; i++) {
        SCRATCH_X[i] = -HEAD_R * 0.8 + (i * HEAD_R * 1.6) / 4;
        SCRATCH_Y[i] = top - (i % 2 === 0 ? HEAD_R * 0.15 : HEAD_R * 0.7);
      }
      inkStroke(ctx, SCRATCH_X, SCRATCH_Y, 5, { ...stroke, width: 3 });
      break;
    case 'horns':
      for (const side of [-1, 1]) {
        inkArc(ctx, side * HEAD_R * 0.7, top, HEAD_R * 0.5, Math.PI, Math.PI * 1.7, {
          ...stroke,
          width: 3,
        });
      }
      break;
  }
}

// ─── Gloves (§2.5) ──────────────────────────────────────────────────────────

/** Size multiplier on the mitten; unknown gloves are a plain mitten. */
const GLOVE_BULK: Readonly<Record<GlovesId, number>> = {
  mitten: 1,
  'oven-mitt': 1.3,
  'boxing-glove': 1.4,
  'rubber-glove': 1.02,
  gauntlet: 1.22,
  'ninja-tabi-hand': 0.88,
  'bubble-wrap': 1.18,
  'winter-mitten': 1.25,
  'gardening-glove': 1.1,
  'surgical-glove': 0.98,
  'catchers-mitt': 1.45,
  'welding-glove': 1.32,
};

// ─── Drawing ────────────────────────────────────────────────────────────────

/** Trace a head silhouette into the scratch buffers. */
function traceHead(profile: HeadProfile): void {
  for (let i = 0; i < HEAD_SEGMENTS; i++) {
    const a = (i / HEAD_SEGMENTS) * Math.PI * 2;
    const r = HEAD_R * profile.radius(a);
    HEAD_X[i] = Math.cos(a) * r;
    HEAD_Y[i] = Math.sin(a) * r;
  }
}

/** The forehead mark — the channel seat identity actually rests on (§2.8). */
function drawSeatMark(ctx: CanvasRenderingContext2D, seat: number, stroke: StrokeOptions): void {
  const mark = SEAT_MARKS[seat & 3];
  const y = -HEAD_R * 0.48;
  const r = HEAD_R * 0.26;
  switch (mark) {
    case 'circle':
      inkArc(ctx, 0, y, r, 0, Math.PI * 2, stroke, 10);
      break;
    case 'triangle':
      SCRATCH_X[0] = 0;
      SCRATCH_Y[0] = y - r;
      SCRATCH_X[1] = r;
      SCRATCH_Y[1] = y + r * 0.8;
      SCRATCH_X[2] = -r;
      SCRATCH_Y[2] = y + r * 0.8;
      inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 3, stroke);
      break;
    case 'square':
      SCRATCH_X[0] = -r;
      SCRATCH_Y[0] = y - r;
      SCRATCH_X[1] = r;
      SCRATCH_Y[1] = y - r;
      SCRATCH_X[2] = r;
      SCRATCH_Y[2] = y + r;
      SCRATCH_X[3] = -r;
      SCRATCH_Y[3] = y + r;
      inkPolygon(ctx, SCRATCH_X, SCRATCH_Y, 4, stroke);
      break;
    case 'cross':
      inkLine(ctx, -r, y, r, y, stroke);
      inkLine(ctx, 0, y - r, 0, y + r, stroke);
      break;
  }
}

/** Two eyes and a mouth. Expression comes from life state and reach, not from data. */
function drawFace(
  ctx: CanvasRenderingContext2D,
  seat: RenderSeat,
  stroke: StrokeOptions,
  palette: BumPalette,
): void {
  // Below about 3px the graphite under-pass is as wide as the stroke it sits
  // under, so it reads as a smudge rather than a pencil line — and it doubles
  // the fill count on the details there are the most of.
  FINE.width = 2;
  FINE.color = stroke.color;
  FINE.alpha = stroke.alpha;
  FINE.boil = stroke.boil;
  FINE.salt = stroke.salt;
  FINE.amplitude = stroke.amplitude;
  const eyeY = HEAD_R * 0.05;
  const eyeX = HEAD_R * 0.33;
  const straining = seat.tensionL > 0.7 || seat.tensionR > 0.7;
  const reaching = seat.reachingL || seat.reachingR;

  if (straining) {
    // Screwed-up eyes: the visual twin of the rumble ramp (§13, audio/visual pairing).
    for (const side of [-1, 1]) {
      inkLine(ctx, side * eyeX - 4, eyeY - 3, side * eyeX + 4, eyeY + 3, FINE);
      inkLine(ctx, side * eyeX - 4, eyeY + 3, side * eyeX + 4, eyeY - 3, FINE);
    }
  } else {
    ctx.fillStyle = palette.ink;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeX, eyeY, reaching ? 3.6 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const mouthY = HEAD_R * 0.45;
  if (reaching || straining) {
    inkArc(ctx, 0, mouthY - 3, HEAD_R * 0.24, 0.2, Math.PI - 0.2, FINE);
  } else {
    inkArc(ctx, 0, mouthY - 6, HEAD_R * 0.3, 0.5, Math.PI - 0.5, FINE);
  }
}

/**
 * A mitten in one of three poses. This is the readability affordance the whole
 * control scheme leans on, so the poses differ in *outline*, not in detail: a
 * fist is small and round, an open hand is wide with splayed fingers, and a
 * reaching hand is stretched forward along the arm with the fingers leading.
 */
function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  gripping: boolean,
  reaching: boolean,
  bulk: number,
  stroke: StrokeOptions,
  palette: BumPalette,
): void {
  const r = HAND_R * bulk;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (gripping) {
    inkCircle(
      ctx,
      0,
      0,
      r * 0.95,
      { ...stroke, fill: palette.paper, fillComposite: 'source-over' },
      10,
    );
    // The knuckle line is what makes a circle read as a fist.
    inkLine(ctx, -r * 0.5, -r * 0.35, r * 0.5, -r * 0.35, fine(stroke, 1.8));
    // The thumb, hooked over.
    inkArc(ctx, r * 0.2, r * 0.3, r * 0.45, -0.6, 1.8, fine(stroke, 2.4));
  } else if (reaching) {
    inkCircle(
      ctx,
      -r * 0.2,
      0,
      r * 0.85,
      { ...stroke, fill: palette.paper, fillComposite: 'source-over' },
      10,
    );
    for (let i = -1; i <= 1; i++) {
      inkLine(ctx, r * 0.3, i * r * 0.42, r * 1.5, i * r * 0.55, fine(stroke, 2.6));
    }
  } else {
    inkCircle(
      ctx,
      0,
      0,
      r * 0.8,
      { ...stroke, fill: palette.paper, fillComposite: 'source-over' },
      10,
    );
    for (let i = -1; i <= 1; i++) {
      const a = i * 0.8;
      inkLine(
        ctx,
        Math.cos(a) * r * 0.6,
        Math.sin(a) * r * 0.6,
        Math.cos(a) * r * 1.5,
        Math.sin(a) * r * 1.5,
        fine(stroke, 2.4),
      );
    }
    // The thumb sits apart from the fingers, which is the whole reason a mitten
    // reads as a hand at all.
    inkLine(ctx, -r * 0.3, r * 0.7, -r * 0.9, r * 1.4, fine(stroke, 2.6));
  }
  ctx.restore();
}

/** One arm: a smoothed polyline through the physics segments, root to wrist. */
function drawArm(
  ctx: CanvasRenderingContext2D,
  points: readonly Vec2[],
  tension: number,
  salt: number,
  stroke: StrokeOptions,
): void {
  if (points.length < 2) return;
  const count = smoothPolyline(points, 3);
  if (count < 2) return;
  // Above GRIP_WARN_RATIO the stroke thins toward breaking — the visual twin of
  // the rumble ramp, and the reason a player can see a grip about to fail.
  const strain =
    tension > PHYSICS.GRIP_WARN_RATIO
      ? (tension - PHYSICS.GRIP_WARN_RATIO) / (1 - PHYSICS.GRIP_WARN_RATIO)
      : 0;
  const thin = 1 - 0.4 * strain;
  inkStroke(ctx, smoothedX, smoothedY, count, {
    ...stroke,
    width: ARM_WIDTH_ROOT * thin,
    widthEnd: ARM_WIDTH_WRIST * thin,
    salt,
  });
}

/**
 * A pinned name tag. Drawn in world space with no head rotation applied — a tag
 * that spins with the head is a tag nobody can read — and measured before it is
 * drawn so a long name (or a German one) shrinks instead of overflowing.
 */
function drawNameTag(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  ink: string,
  palette: BumPalette,
): void {
  const size = 18;
  ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const measured = ctx.measureText(name).width;
  const maxWidth = 200;
  const scale = measured > maxWidth ? maxWidth / measured : 1;
  const w = Math.max(40, measured * scale) + 16;
  const h = size + 12;

  ctx.fillStyle = palette.tape;
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.strokeStyle = withAlpha(palette.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, y, w, h);

  ctx.save();
  ctx.translate(x, y + h / 2);
  if (scale !== 1) ctx.scale(scale, 1);
  ctx.fillStyle = ink;
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

/**
 * Draw one seat. The whole per-frame actor cost is four of these.
 *
 * Order matters: arms behind, head over them (so a hand crossing the face is
 * hidden), hands in front of everything, tag last and unrotated.
 */
export function drawSeat(
  ctx: CanvasRenderingContext2D,
  seat: RenderSeat,
  deps: ActorContext,
): void {
  if (seat.state === 'dead') return;
  const { palette, boil } = deps;
  const ink = seatInk(palette, seat.seat, seat.cosmetics.ink);
  const salt = vertexId(saltFromId(seat.cosmetics.head) ^ (seat.seat + 1), 0);
  const amplitude = boil.actor;

  // A respawning seat is being sketched back in; a frozen one is a ghost.
  const alpha = seat.state === 'respawning' ? 0.55 : seat.state === 'frozen' ? 0.4 : 1;

  const stroke: StrokeOptions = {
    width: 3,
    color: ink,
    graphiteColor: palette.graphite,
    alpha,
    boil,
    salt,
    amplitude,
  };

  drawArm(ctx, seat.armL, seat.tensionL, salt + 100, stroke);
  drawArm(ctx, seat.armR, seat.tensionR, salt + 200, stroke);

  // Head, hat, face and mark all deform together under squash/stretch (§2.7).
  ctx.save();
  ctx.translate(seat.head.x, seat.head.y);
  ctx.rotate(seat.headAngle);
  const sx = Number.isFinite(seat.scaleX) && seat.scaleX > 0 ? seat.scaleX : 1;
  const sy = Number.isFinite(seat.scaleY) && seat.scaleY > 0 ? seat.scaleY : 1;
  ctx.scale(Math.min(1 + RENDER.STRETCH_MAX, sx), Math.min(1 + RENDER.STRETCH_MAX, sy));

  const profile = headProfile(seat.cosmetics.head);
  traceHead(profile);
  inkPolygon(ctx, HEAD_X, HEAD_Y, HEAD_SEGMENTS, {
    ...stroke,
    width: 3.4,
    fill: palette.paper,
    fillComposite: 'source-over',
  });
  profile.extras?.(ctx, stroke, palette);
  drawHat(ctx, seat.cosmetics.hat, stroke, palette);
  drawFace(ctx, seat, stroke, palette);
  drawSeatMark(ctx, seat.seat, { ...stroke, width: 2.6 });
  ctx.restore();

  const bulk = isGlovesId(seat.cosmetics.gloves) ? GLOVE_BULK[seat.cosmetics.gloves] : 1;
  drawHandFor(ctx, seat.armL, seat.gripL, seat.reachingL, bulk, stroke, palette);
  drawHandFor(ctx, seat.armR, seat.gripR, seat.reachingR, bulk, stroke, palette);

  const name = deps.names[seat.seat] ?? null;
  // Below ~0.7 zoom the tag is smaller than its own stroke width; drawing it
  // there costs a text raster and reads as a smudge.
  if (deps.showTags && name && deps.zoom > 0.7) {
    drawNameTag(ctx, name, seat.head.x, seat.head.y + HEAD_R * 1.25, ink, palette);
  }
}

function drawHandFor(
  ctx: CanvasRenderingContext2D,
  arm: readonly Vec2[],
  gripping: boolean,
  reaching: boolean,
  bulk: number,
  stroke: StrokeOptions,
  palette: BumPalette,
): void {
  const n = arm.length;
  if (n === 0) return;
  const hand = arm[n - 1];
  const before = n > 1 ? arm[n - 2] : hand;
  const angle = Math.atan2(hand.y - before.y, hand.x - before.x);
  drawHand(ctx, hand.x, hand.y, angle, gripping, reaching, bulk, stroke, palette);
}
