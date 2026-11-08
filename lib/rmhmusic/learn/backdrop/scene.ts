// =============================================================================
// RMH MUSIC -- Paper backdrop scene (pure renderer)
// =============================================================================
// The band of staff paper behind the app: notes, rests and the odd bar line drift
// slowly along five-line staves, and a note the learner plays pops onto a staff at
// its pitch and drifts away. Same contract as the Kowloon menu street
// (lib/kowloon-knockout/menu/street-scene.ts): no DOM, nothing allocated per frame,
// every mark lives in a pool sized when the scene is made; the host owns the canvas
// and puts the frame on screen.
//
// The STAVES are not drawn here: they are CSS (`.rmm-backdrop` in
// components/rmhmusic/rmhmusic.css), so they are on the page before any script and
// the canvas's first frame changes no colour. This draws onto a transparent canvas
// over them, using the same geometry (STAFF_FIRST / STAFF_GAP / STAFF_PERIOD).
//
// Motion is a slow drift (5–11 px/s ambient, 16 px/s for a played note) and nothing
// flashes: a played note fades in over 0.35 s and out over 1.5 s, one small mark.
// Scheme: docs/game-design-schemes/rmhmusic.json.
// =============================================================================

import { staffStep, isSharp, TOP_LINE_STEP } from '../staff';

/** Top of the first staff, the line spacing, and the distance between staff tops, in CSS px. */
export const STAFF_FIRST = 64;
export const STAFF_GAP = 10;
export const STAFF_PERIOD = 128;

/** Pool sizes: the scene never holds more marks than this. */
export const MAX_AMBIENT = 72;
export const MAX_POPS = 12;
/** One ambient mark per this many px of staff length. */
const AMBIENT_SPACING = 150;

export const DRIFT_MIN = 5;
export const DRIFT_MAX = 11;
export const POP_DRIFT = 16;
export const POP_LIFE = 6;
export const POP_IN = 0.35;
export const POP_OUT = 1.5;
/** Where a played note lands, as a share of the band's width (clear of the centre column on wide screens). */
export const POP_X = 0.88;
/** Steps a played note may sit at (lower/higher notes are drawn at the edge of this range). */
export const POP_STEP_MIN = -6;
export const POP_STEP_MAX = 14;

/** Mark kinds. */
export const QUARTER = 0;
export const HALF = 1;
export const WHOLE = 2;
export const EIGHTH = 3;
export const REST = 4;
export const BAR = 5;

export interface Mark {
  kind: number;
  staff: number;
  step: number;
  x: number;
  speed: number;
  age: number;
  alive: boolean;
  sharp: boolean;
}

export interface Scene {
  width: number;
  height: number;
  staves: number;
  /** The ambient pool (the first `ambient` are in use). */
  marks: Mark[];
  ambient: number;
  pops: Mark[];
  nextPop: number;
  rng: number;
}

/** The drawing calls the renderer needs: a subset of CanvasRenderingContext2D. */
export interface Pen {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  fill(): void;
  stroke(): void;
}

export interface Palette {
  /** Ambient notes, rests and bar lines (faint, decoration only). */
  note: string;
  /** The note a learner just played. */
  pop: string;
}

/** Staves that fit in a band of `height` CSS px. */
export function staffCount(height: number): number {
  if (!(height > STAFF_FIRST + 4 * STAFF_GAP)) return 0;
  return Math.floor((height - STAFF_FIRST - 4 * STAFF_GAP) / STAFF_PERIOD) + 1;
}

export function staffTop(staff: number): number {
  return STAFF_FIRST + staff * STAFF_PERIOD;
}

/** The y of a step's line or space centre on a staff (0 = bottom line). */
export function stepY(staff: number, step: number): number {
  return staffTop(staff) + 4 * STAFF_GAP - (step * STAFF_GAP) / 2 + 0.5;
}

/** mulberry32: a deterministic stream from the scene's seed. */
function next(scene: Scene): number {
  let t = (scene.rng = (scene.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function blankMark(): Mark {
  return { kind: QUARTER, staff: 0, step: 0, x: 0, speed: 0, age: 0, alive: false, sharp: false };
}

/** A fresh ambient mark: mostly notes on or near the staff, some rests, a few bar lines. */
function reroll(scene: Scene, m: Mark): void {
  const r = next(scene);
  m.kind =
    r < 0.38
      ? QUARTER
      : r < 0.58
        ? HALF
        : r < 0.68
          ? WHOLE
          : r < 0.84
            ? EIGHTH
            : r < 0.93
              ? REST
              : BAR;
  m.step = Math.floor(next(scene) * 11) - 1; // -1 … 9: on the staff, no ledger lines
  m.speed = DRIFT_MIN + next(scene) * (DRIFT_MAX - DRIFT_MIN);
}

/** Make a scene for a band of `width × height` CSS px. Every pool is allocated here, once. */
export function createScene(width: number, height: number, seed = 1): Scene {
  const scene: Scene = {
    width,
    height,
    staves: staffCount(height),
    marks: Array.from({ length: MAX_AMBIENT }, blankMark),
    ambient: 0,
    pops: Array.from({ length: MAX_POPS }, blankMark),
    nextPop: 0,
    rng: seed | 0,
  };
  scene.ambient = Math.min(
    MAX_AMBIENT,
    Math.round((scene.staves * Math.max(0, width)) / AMBIENT_SPACING),
  );
  for (let i = 0; i < scene.ambient; i++) {
    const m = scene.marks[i];
    reroll(scene, m);
    m.staff = i % scene.staves;
    m.x = next(scene) * width;
    m.alive = true;
  }
  return scene;
}

/** Advance the scene by `dt` seconds (clamped, so a long pause is not a jump). */
export function stepScene(scene: Scene, dt: number): void {
  const d = dt > 0 ? Math.min(dt, 0.25) : 0;
  const wrap = scene.width + 48;
  for (let i = 0; i < scene.ambient; i++) {
    const m = scene.marks[i];
    m.x -= m.speed * d;
    if (m.x < -24) {
      m.x += wrap;
      reroll(scene, m);
    }
  }
  for (let i = 0; i < MAX_POPS; i++) {
    const p = scene.pops[i];
    if (!p.alive) continue;
    p.age += d;
    p.x -= POP_DRIFT * d;
    if (p.age >= POP_LIFE) p.alive = false;
  }
}

/** The staff a played note lands on: the second one when there is one (the first sits under the header). */
export function popStaff(scene: Scene): number {
  return scene.staves >= 2 ? 1 : 0;
}

/** A played note: reuses the oldest pop slot. Does nothing when the band has no staff. */
export function popNote(scene: Scene, midi: number): void {
  if (scene.staves === 0) return;
  const p = scene.pops[scene.nextPop];
  scene.nextPop = (scene.nextPop + 1) % MAX_POPS;
  p.kind = QUARTER;
  p.staff = popStaff(scene);
  p.step = Math.max(POP_STEP_MIN, Math.min(POP_STEP_MAX, staffStep(midi)));
  p.sharp = isSharp(midi);
  p.x = scene.width * POP_X;
  p.speed = POP_DRIFT;
  p.age = 0;
  p.alive = true;
}

/** A played note's opacity at `age`: in over POP_IN, held, out over the last POP_OUT. */
export function popAlpha(age: number): number {
  if (age <= 0) return 0;
  if (age < POP_IN) return age / POP_IN;
  const left = POP_LIFE - age;
  if (left <= 0) return 0;
  return left < POP_OUT ? left / POP_OUT : 1;
}

const TAU = Math.PI * 2;
const HEAD_RX = 5.6;
const HEAD_RY = 4;
const HEAD_TILT = -0.35;
const STEM = 30;

function head(pen: Pen, x: number, y: number, open: boolean, whole: boolean): void {
  pen.beginPath();
  pen.ellipse(x, y, whole ? 6.4 : HEAD_RX, whole ? 4.2 : HEAD_RY, whole ? 0 : HEAD_TILT, 0, TAU);
  if (open) pen.stroke();
  else pen.fill();
}

function drawMark(pen: Pen, m: Mark): void {
  const x = m.x;
  if (m.kind === BAR) {
    const top = staffTop(m.staff) + 0.5;
    pen.beginPath();
    pen.moveTo(x, top);
    pen.lineTo(x, top + 4 * STAFF_GAP);
    pen.stroke();
    return;
  }
  if (m.kind === REST) {
    // A half rest: a small block sitting on the middle line.
    pen.fillRect(x - 5, stepY(m.staff, 4) - 4.5, 10, 4);
    return;
  }
  const y = stepY(m.staff, m.step);
  head(pen, x, y, m.kind === HALF || m.kind === WHOLE, m.kind === WHOLE);
  if (m.kind === WHOLE) return;
  const up = m.step < 4;
  const sx = up ? x + HEAD_RX - 0.6 : x - HEAD_RX + 0.6;
  const sy = up ? y - STEM : y + STEM;
  pen.beginPath();
  pen.moveTo(sx, y);
  pen.lineTo(sx, sy);
  if (m.kind === EIGHTH) {
    const dir = up ? 1 : -1;
    pen.moveTo(sx, sy);
    pen.quadraticCurveTo(sx + 7, sy + dir * 9, sx + 5, sy + dir * 18);
  }
  pen.stroke();
}

function drawLedgers(pen: Pen, staff: number, step: number, x: number): void {
  pen.beginPath();
  for (let s = -2; s >= step; s -= 2) {
    const y = stepY(staff, s);
    pen.moveTo(x - 9, y);
    pen.lineTo(x + 9, y);
  }
  for (let s = TOP_LINE_STEP + 2; s <= step; s += 2) {
    const y = stepY(staff, s);
    pen.moveTo(x - 9, y);
    pen.lineTo(x + 9, y);
  }
  pen.stroke();
}

/** A sharp sign to the left of a notehead: two upright strokes, two rising bars. */
function drawSharp(pen: Pen, x: number, y: number): void {
  const cx = x - 14;
  pen.beginPath();
  pen.moveTo(cx - 2, y - 8);
  pen.lineTo(cx - 2, y + 9);
  pen.moveTo(cx + 2, y - 9);
  pen.lineTo(cx + 2, y + 8);
  pen.moveTo(cx - 5, y - 1.5);
  pen.lineTo(cx + 5, y - 4.5);
  pen.moveTo(cx - 5, y + 4.5);
  pen.lineTo(cx + 5, y + 1.5);
  pen.stroke();
}

/** Draw the whole frame in CSS px (the host sets the device-pixel transform). */
export function drawScene(scene: Scene, pen: Pen, palette: Palette): void {
  pen.clearRect(0, 0, scene.width, scene.height);
  pen.globalAlpha = 1;
  pen.lineWidth = 1.3;
  pen.fillStyle = palette.note;
  pen.strokeStyle = palette.note;
  for (let i = 0; i < scene.ambient; i++) drawMark(pen, scene.marks[i]);

  pen.fillStyle = palette.pop;
  pen.strokeStyle = palette.pop;
  pen.lineWidth = 1.6;
  for (let i = 0; i < MAX_POPS; i++) {
    const p = scene.pops[i];
    if (!p.alive) continue;
    const a = popAlpha(p.age);
    if (a <= 0) continue;
    pen.globalAlpha = a;
    drawLedgers(pen, p.staff, p.step, p.x);
    if (p.sharp) drawSharp(pen, p.x, stepY(p.staff, p.step));
    drawMark(pen, p);
  }
  pen.globalAlpha = 1;
}
