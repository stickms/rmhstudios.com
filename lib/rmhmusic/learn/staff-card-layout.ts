/**
 * Where everything on a flashcard's staff (`components/rmhmusic/learn/StaffCard.tsx`) goes —
 * pure, so the drawing can be checked without a DOM.
 *
 * The SVG's box is fixed ({@link CARD_W} × {@link CARD_H}) and covers steps
 * {@link CARD_MIN_STEP}…{@link CARD_MAX_STEP} on either clef (two ledger lines below and above,
 * all the decks reach: B3 under the treble staff, A5 and the bass staff's C4 over theirs), with
 * the stem, so a card is one reserved height whatever note it shows — and no taller, so the
 * answer written under it stays near the note.
 *
 * The clefs are calligraphic strokes — a centreline whose pen width swells and thins along it,
 * filled as one outline — the same construction as the catalog art (`scripts/game-art/
 * rmhmusic.mjs`, whose treble stroke is reused here unchanged), so a card reads as copied by
 * hand rather than set from a font. The staff lines are ruled by hand too: each bows and tilts a
 * fraction of a unit, never the same way twice.
 */

import { clefStep, ledgerSteps, type Clef } from './theory/clef';

export const CARD_W = 200;
export const CARD_H = 102;
/** Staff space (line to line). */
export const CARD_GAP = 10;
/** The top line's y. */
export const CARD_TOP = 32;
export const CARD_NOTE_X = 122;
/** The lowest and highest steps a card can draw (two ledger lines each way). */
export const CARD_MIN_STEP = -4;
export const CARD_MAX_STEP = 12;
/**
 * The note finder's taller card (`range="low"`): three ledger lines below the treble staff, down to
 * step −7, where guitar music writes the open low E (it sounds E2 and is written E3). Every
 * note-finder card uses it, on either instrument, so the card is one height before the learner's
 * instrument is known (the loading placeholder) and after.
 */
export const CARD_LOW_MIN_STEP = -7;
export const CARD_LOW_H = 117;
/** A stem is three and a half spaces long. */
const STEM = 3.5 * CARD_GAP;
/** The notehead's half-width and half-height (before its −20° tilt). */
export const HEAD_RX = 6.6;
export const HEAD_RY = 4.6;

export const cardY = (step: number): number => CARD_TOP + 4 * CARD_GAP - (step * CARD_GAP) / 2;

export interface CardLayout {
  step: number;
  noteY: number;
  ledgerYs: number[];
  /** The stem as a line: x and its two ends. Up (on the right) below the middle line. */
  stem: { x: number; y1: number; y2: number };
}

/**
 * A card's marks. A note outside the drawable steps (`minStep`…{@link CARD_MAX_STEP}) is clamped to
 * the edge (the decks and the note finder never ask for one; `staff-card-layout.test.ts` checks
 * every card fits without clamping).
 */
export function cardLayout(clef: Clef, midi: number, minStep = CARD_MIN_STEP): CardLayout {
  const raw = clefStep(clef, midi);
  const step = Math.min(CARD_MAX_STEP, Math.max(minStep, raw));
  const noteY = cardY(step);
  const up = step < 4;
  return {
    step,
    noteY,
    ledgerYs: ledgerSteps(step).map(cardY),
    stem: up
      ? { x: CARD_NOTE_X + HEAD_RX - 0.6, y1: noteY - 1, y2: noteY - STEM }
      : { x: CARD_NOTE_X - HEAD_RX + 0.6, y1: noteY + 1, y2: noteY + STEM },
  };
}

// ── Hand ruling ──────────────────────────────────────────────────────────────

/** Small fixed offsets (in SVG units) so each ruled line bows and tilts its own way. */
const BOW = [0.35, -0.45, 0.25, -0.3, 0.4];
const TILT = [-0.25, 0.2, -0.1, 0.3, -0.2];

/** One staff line, `i` = 0 (top) … 4 (bottom), as a gently bowed path from x0 to x1. */
export function ruledLine(i: number, x0: number, x1: number): string {
  const y = CARD_TOP + i * CARD_GAP;
  const k = ((i % BOW.length) + BOW.length) % BOW.length;
  const ya = y - TILT[k];
  const yb = y + TILT[k];
  const mx = (x0 + x1) / 2;
  return `M ${x0} ${f(ya)} Q ${f(mx)} ${f(y + BOW[k] * 2)} ${x1} ${f(yb)}`;
}

/** A ledger line at `y`, short and slightly tilted, centred on the note. */
export function ledgerLine(y: number, n: number): string {
  const t = n % 2 === 0 ? 0.35 : -0.3;
  return `M ${CARD_NOTE_X - 12} ${f(y + t)} L ${CARD_NOTE_X + 12} ${f(y - t)}`;
}

// ── Calligraphic strokes ─────────────────────────────────────────────────────

type Pt = readonly [number, number, number];

const f = (n: number): number => Number(n.toFixed(2));

/** Uniform Catmull-Rom through [x, y, width] control points → dense [x, y, width] samples. */
function spline(pts: readonly Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const e = t * t * (3 - 2 * t);
      out.push([
        cr(p0[0], p1[0], p2[0], p3[0]),
        cr(p0[1], p1[1], p2[1], p3[1]),
        p1[2] + (p2[2] - p1[2]) * e,
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The filled outline of a stroke whose pen width varies along it, scaled and moved into place. */
function ribbon(pts: readonly Pt[], per: number, x: number, y: number, s: number): string {
  const line = spline(pts, per);
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = line[i][2] / 2;
    left.push([line[i][0] - dy * h, line[i][1] + dx * h]);
    right.push([line[i][0] + dy * h, line[i][1] - dx * h]);
  }
  const ring = [...left, ...right.reverse()];
  return `M${ring.map(([px, py]) => `${f(x + px * s)} ${f(y + py * s)}`).join('L')}Z`;
}

/**
 * The treble clef in staff spaces, origin at the top line and the clef's stem; the spiral curls
 * round the G line (y = 3). The catalog art's stroke (`CLEF_STROKE` in the art generator).
 */
const TREBLE_STROKE: readonly Pt[] = [
  [0.3, 3.1, 0.06],
  [0.6, 2.76, 0.14],
  [0.34, 2.2, 0.22],
  [-0.32, 2.18, 0.3],
  [-0.84, 2.86, 0.42],
  [-0.64, 3.8, 0.42],
  [0.12, 4.24, 0.34],
  [0.88, 3.88, 0.28],
  [1.1, 3.0, 0.3],
  [0.8, 2.02, 0.38],
  [0.12, 1.08, 0.42],
  [-0.36, 0.1, 0.34],
  [-0.34, -0.9, 0.2],
  [-0.06, -1.66, 0.13],
  [0.32, -1.96, 0.11],
  [0.6, -1.64, 0.12],
  [0.56, -0.98, 0.13],
  [0.32, -0.28, 0.14],
  [0.2, 1.4, 0.15],
  [0.13, 3.4, 0.16],
  [0.07, 5.0, 0.15],
  [-0.12, 5.6, 0.13],
  [-0.56, 5.68, 0.09],
];

/**
 * The bass (F) clef in staff spaces, origin at the top line: from the ball on the F line (y = 1)
 * up over the top line, swelling round to the right and tapering down to the fourth space.
 */
const BASS_STROKE: readonly Pt[] = [
  [0.05, 0.95, 0.5],
  [0.1, 0.4, 0.2],
  [0.6, -0.04, 0.24],
  [1.3, 0.02, 0.34],
  [1.86, 0.55, 0.42],
  [1.98, 1.4, 0.44],
  [1.72, 2.3, 0.38],
  [1.14, 3.1, 0.28],
  [0.36, 3.72, 0.15],
  [-0.24, 4.02, 0.05],
];

export interface ClefGlyph {
  /** The stroke's outline. */
  path: string;
  /** Filled dots: the treble clef's ball, the bass clef's head and its two dots. */
  dots: { cx: number; cy: number; r: number }[];
}

const CLEF_X = { treble: 24, bass: 14 } as const;

function glyph(clef: Clef): ClefGlyph {
  const x = CLEF_X[clef];
  const s = CARD_GAP;
  const at = (dx: number, dy: number, r: number) => ({
    cx: f(x + dx * s),
    cy: f(CARD_TOP + dy * s),
    r: f(r * s),
  });
  if (clef === 'treble') {
    return { path: ribbon(TREBLE_STROKE, 24, x, CARD_TOP, s), dots: [at(-0.5, 5.18, 0.36)] };
  }
  return {
    path: ribbon(BASS_STROKE, 24, x, CARD_TOP, s),
    // The head on the F line, and the two dots either side of it.
    dots: [at(0.18, 1.0, 0.36), at(2.6, 0.5, 0.17), at(2.6, 1.5, 0.17)],
  };
}

/** Both clefs, built once. */
export const CLEF_GLYPHS: Record<Clef, ClefGlyph> = {
  treble: glyph('treble'),
  bass: glyph('bass'),
};
