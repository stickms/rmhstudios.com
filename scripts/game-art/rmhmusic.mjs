#!/usr/bin/env node
/**
 * Generates RMH Music's catalog art: the card, banner, logo and icon.
 *
 *   public/images/games/rmhmusic.webp          card    1600×2400 (2:3), opaque
 *   public/images/games/banners/rmhmusic.webp  banner  3840×1280 (3:1), opaque, text-free
 *   public/images/games/logos/rmhmusic.webp    logo    1024×270, transparent (the wordmark)
 *   public/images/games/icons/rmhmusic.webp    icon    1024×1024, opaque
 *
 * The art is a page of hand-copied manuscript paper, the way a teacher would write out a first
 * tune for a student: the app's notebook paper (cream, navy ink, ruled blue staves, a red-pencil
 * margin) with "Ode to Joy" written on the staff and the same notes on a guitar tab beneath, so
 * piano and guitar are both there without a caption. There are no taglines, annotations,
 * badges or footers. What makes it read as made by a person rather than a program: staves
 * ruled freehand (each line bows a little and the whole system leans a fraction), noteheads and
 * stems that are not quite level, ink that is uneven at the edge and in density (an SVG
 * displacement + noise filter on the inked layer), and the wordmark set in a letterpress face
 * with a note for the dot of the i. Everything is original vector artwork drawn here; the
 * treble clef, noteheads and time signature are geometry, not font glyphs. The one third-party
 * input is IM Fell English (SIL OFL, Igino Marini's digitisation of the 17th-century Fell types),
 * vendored in scripts/game-art/fonts/. See docs/game-art-credits.md.
 *
 * Pipeline: SVG → an HTML page in a temp dir (font via file:// URL) → headless Chromium
 * (Playwright) at 2× → sharp (Lanczos down to the exact size) → WebP. Deterministic: the
 * "hand" is a seeded PRNG and the paper and ink noise are seeded feTurbulence, so a re-run
 * reproduces the same art.
 *
 *   node scripts/game-art/rmhmusic.mjs                      # all four, into public/
 *   node scripts/game-art/rmhmusic.mjs --only card,icon     # a subset
 *   node scripts/game-art/rmhmusic.mjs --preview <dir>      # also write PNG previews there
 *   PW_CHROMIUM=/path/to/chrome node scripts/game-art/rmhmusic.mjs   # (or --chromium <path>) when
 *                                       the installed Playwright's own browser build is missing
 *
 * Then regenerate the image variants: `pnpm images:variants`.
 */
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FONTS = join(HERE, 'fonts');
const GAME_FONTS = join(ROOT, 'components', 'shared', 'game-fonts');
const OUT = join(ROOT, 'public', 'images', 'games');

// ── Palette: the app's light "paper" tokens (rmhmusic.css), a little stronger where art needs it ──
const C = {
  paper: '#f6f0e1', // --app-bg
  sheet: '#fcf8ee', // --app-surface
  ink: '#1a2747', // --app-text
  inkMuted: '#3f4d70', // --app-text-muted
  pencil: '#585d6b', // graphite: a teacher's fingering marks
  staffFaint: '#cdd6e8', // the pre-printed manuscript staves
  staffInk: '#6f82a8', // the same staves where the music is written
  margin: '#dd8f88', // --rmm-margin, pencil-strong
};

// ── Fonts ──────────────────────────────────────────────────────────────────────
const fontUrl = (p, dir = FONTS) => pathToFileURL(join(dir, p)).href;
const FONT_CSS = `
@font-face{font-family:'IM Fell English';src:url('${fontUrl('IMFellEnglish/IMFellEnglish-Regular.woff2')}') format('woff2');font-weight:400;font-style:normal}
@font-face{font-family:'Bodoni Moda';src:url('${fontUrl('BodoniModa/BodoniModa-Italic-wght.woff2', GAME_FONTS)}') format('woff2');font-weight:400 900;font-style:italic}
`;
const FELL = "'IM Fell English'";
// Fell's figures are old-style (a 0 like an o, a 1 like a small-cap I), wrong for fret numbers and
// fingerings; Bodoni Moda's italic has lining figures and a pen-like slant.
const DIGITS = "'Bodoni Moda'";
const FONT_CHECKS = [`400 40px ${FELL}`, `italic 600 40px ${DIGITS}`];

// ── Geometry helpers ───────────────────────────────────────────────────────────
const f = (n) => Number(n.toFixed(2));

/** Uniform Catmull-Rom through [x, y, width] control points → dense [x, y, width] samples. */
function spline(pts, per = 28) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a, b, c, d) =>
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

/** A calligraphic stroke: the filled outline of a centreline whose width varies along it. */
function ribbon(pts, per) {
  const s = spline(pts, per);
  const left = [];
  const right = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = s[i][2] / 2;
    left.push([s[i][0] - dy * h, s[i][1] + dx * h]);
    right.push([s[i][0] + dy * h, s[i][1] - dx * h]);
  }
  const ring = [...left, ...right.reverse()];
  return `M${ring.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
}

// ── Notation (all in staff spaces `s`; staff top line at y0, lines at y0 + k·s) ──────────────
/**
 * The treble clef as one calligraphic stroke in staff-space units, origin at the staff's top line
 * and the clef's stem; the spiral curls round the G line (y = 3). Spans y −1.9 … 5.7.
 */
const CLEF_STROKE = [
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
const CLEF_BALL = [-0.5, 5.18, 0.36];

function clef(x, y0, s, color = C.ink) {
  return `<g transform="translate(${f(x)} ${f(y0)}) scale(${f(s)})" fill="${color}">
    <path d="${ribbon(CLEF_STROKE, 90)}"/>
    <circle cx="${CLEF_BALL[0]}" cy="${CLEF_BALL[1]}" r="${CLEF_BALL[2]}"/>
  </g>`;
}

/** A bold common-time "4" in a 2-space box (top-left at x, y). */
function four(x, y, s, color = C.ink) {
  const u = s / 1; // 1 unit = 1 space; the digit is 1.5 wide × 2 tall
  const P = (px, py) => `${f(x + px * u)} ${f(y + py * u)}`;
  return `<path fill="${color}" d="M${P(0.86, 0)}L${P(1.22, 0)}L${P(1.22, 1.3)}L${P(1.5, 1.3)}L${P(1.5, 1.56)}L${P(1.22, 1.56)}L${P(1.22, 2)}L${P(0.84, 2)}L${P(0.84, 1.56)}L${P(0, 1.56)}L${P(0, 1.34)}ZM${P(0.84, 0.42)}L${P(0.2, 1.3)}L${P(0.84, 1.3)}Z" fill-rule="evenodd"/>`;
}

/** Steps above E4 (the bottom line) for the notes we draw. */
const STEP = { C4: -2, D4: -1, E4: 0, F4: 1, G4: 2, A4: 3, B4: 4, C5: 5, D5: 6 };
const noteY = (y0, s, name) => y0 + 4 * s - (STEP[name] * s) / 2;

/**
 * A note: head (filled or hollow), stem (up when below the middle line B4, down on/above it),
 * ledger line for C4, optional augmentation dot and an eighth-note flag.
 */
function note(x, y0, s, name, { hollow = false, dot = false, flag = false, color = C.ink } = {}) {
  const y = noteY(y0, s, name);
  const up = STEP[name] < STEP.B4;
  const rx = 0.6 * s;
  const ry = 0.43 * s;
  const sw = 0.12 * s;
  let g = '';
  if (STEP[name] <= -2) {
    for (let st = -2; st >= STEP[name]; st -= 2) {
      const ly = y0 + 4 * s - (st * s) / 2;
      g += `<line x1="${f(x - 0.98 * s)}" y1="${f(ly)}" x2="${f(x + 0.98 * s)}" y2="${f(ly)}" stroke="${color}" stroke-width="${f(0.13 * s)}" stroke-linecap="round"/>`;
    }
  }
  const head = `<ellipse cx="0" cy="0" rx="${f(rx)}" ry="${f(ry)}"/>`;
  if (hollow) {
    g += `<g transform="translate(${f(x)} ${f(y)}) rotate(-22)" fill="${color}"><path fill-rule="evenodd" d="M${f(-rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0ZM${f(-rx * 0.62)} 0a${f(rx * 0.62)} ${f(ry * 0.5)} 0 1 1 ${f(rx * 1.24)} 0a${f(rx * 0.62)} ${f(ry * 0.5)} 0 1 1 ${f(-rx * 1.24)} 0Z" transform="rotate(-12)"/></g>`;
  } else {
    g += `<g transform="translate(${f(x)} ${f(y)}) rotate(-22)" fill="${color}">${head}</g>`;
  }
  const sx = up ? x + rx * 0.93 - sw / 2 : x - rx * 0.93 + sw / 2;
  const sy1 = up ? y - 0.14 * s : y + 0.14 * s;
  const sy2 = up ? y - 3.5 * s : y + 3.5 * s;
  g += `<line x1="${f(sx)}" y1="${f(sy1)}" x2="${f(sx)}" y2="${f(sy2)}" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="butt"/>`;
  if (flag && up) {
    const fx = sx + sw / 2;
    g += `<path fill="${color}" d="M${f(fx - sw)} ${f(sy2)}C${f(fx + 0.1 * s)} ${f(sy2 + 0.9 * s)} ${f(fx + 1.25 * s)} ${f(sy2 + 1.3 * s)} ${f(fx + 0.85 * s)} ${f(sy2 + 2.75 * s)}C${f(fx + 1.0 * s)} ${f(sy2 + 1.65 * s)} ${f(fx + 0.3 * s)} ${f(sy2 + 1.35 * s)} ${f(fx - sw)} ${f(sy2 + 1.05 * s)}Z"/>`;
  }
  if (dot) {
    // A dot on a line note moves up into the space above it.
    const onLine = STEP[name] % 2 === 0;
    const dy = onLine ? y - s / 2 : y;
    g += `<circle cx="${f(x + 1.05 * s)}" cy="${f(dy)}" r="${f(0.17 * s)}" fill="${color}"/>`;
  }
  return g;
}

/** Two eighth notes below the middle line, stems up, joined by a beam that follows the melody. */
function beamedPair(x1, n1, x2, n2, y0, s, color = C.ink) {
  const ya = noteY(y0, s, n1);
  const yb = noteY(y0, s, n2);
  const rx = 0.6 * s;
  const sw = 0.12 * s;
  const sx1 = x1 + rx * 0.93 - sw / 2;
  const sx2 = x2 + rx * 0.93 - sw / 2;
  const slant = Math.max(-s / 2, Math.min(s / 2, yb - ya));
  const by1 = ya - 3.5 * s;
  const by2 = by1 + slant;
  const bt = 0.5 * s;
  let g = '';
  for (const [x, y] of [
    [x1, ya],
    [x2, yb],
  ]) {
    g += `<g transform="translate(${f(x)} ${f(y)}) rotate(-22)" fill="${color}"><ellipse rx="${f(rx)}" ry="${f(0.43 * s)}"/></g>`;
  }
  g += `<line x1="${f(sx1)}" y1="${f(ya - 0.14 * s)}" x2="${f(sx1)}" y2="${f(by1 + bt / 2)}" stroke="${color}" stroke-width="${f(sw)}"/>`;
  g += `<line x1="${f(sx2)}" y1="${f(yb - 0.14 * s)}" x2="${f(sx2)}" y2="${f(by2 + bt / 2)}" stroke="${color}" stroke-width="${f(sw)}"/>`;
  g += `<path d="M${f(sx1 - sw / 2)} ${f(by1)}L${f(sx2 + sw / 2)} ${f(by2)}L${f(sx2 + sw / 2)} ${f(by2 + bt)}L${f(sx1 - sw / 2)} ${f(by1 + bt)}Z" fill="${color}"/>`;
  return g;
}

function barline(x, y0, s, color = C.ink, final = false) {
  const thin = `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + 4 * s)}" stroke="${color}" stroke-width="${f(0.12 * s)}"/>`;
  if (!final) return thin;
  return `${thin}<rect x="${f(x + 0.32 * s)}" y="${f(y0)}" width="${f(0.42 * s)}" height="${f(4 * s)}" fill="${color}"/>`;
}

// ── Paper ──────────────────────────────────────────────────────────────────────
function paperDefs(id, seed = 7) {
  return `
  <filter id="${id}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.10  0 0 0 0 0.15  0 0 0 0 0.28  0 0 0 0.55 -0.2"/>
  </filter>
  <filter id="${id}-mottle" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0045" numOctaves="3" seed="${seed + 4}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.25  0 0 0 0.5 -0.18"/>
  </filter>
  <radialGradient id="${id}-vig" cx="50%" cy="45%" r="75%">
    <stop offset="0.6" stop-color="${C.ink}" stop-opacity="0"/>
    <stop offset="1" stop-color="${C.ink}" stop-opacity="0.07"/>
  </radialGradient>`;
}
function paper(id, w, h) {
  return `<rect width="${w}" height="${h}" fill="${C.paper}"/>
  <rect width="${w}" height="${h}" filter="url(#${id}-mottle)" opacity="0.26"/>
  <rect width="${w}" height="${h}" filter="url(#${id}-grain)" opacity="0.5"/>
  <rect width="${w}" height="${h}" fill="url(#${id}-vig)"/>`;
}

// ── The hand ───────────────────────────────────────────────────────────────────
/** A small seeded PRNG (mulberry32): the same seed always writes the same page. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const spread = (r, amount) => (r() - 0.5) * 2 * amount;

/**
 * Ink that behaves like ink: the edge wanders (a displacement map over low-frequency noise) and
 * the density varies a little from stroke to stroke. `k` scales the noise to the canvas size
 * (1 = the 1600px card); `amp` is the edge wander in px at that size.
 */
function inkDefs(id, k, seed, amp = 3.4) {
  return `
  <filter id="${id}" x="-1%" y="-1%" width="102%" height="102%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${f(0.05 / k)}" numOctaves="3" seed="${seed}" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="${f(amp * k)}" xChannelSelector="R" yChannelSelector="G" result="rough"/>
    <feTurbulence type="fractalNoise" baseFrequency="${f(0.012 / k)}" numOctaves="2" seed="${seed + 9}" result="dens"/>
    <feColorMatrix in="dens" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0 0 0 0.6" result="a"/>
    <feComposite in="rough" in2="a" operator="in"/>
  </filter>`;
}

/**
 * `n` ruled lines, `gap` apart, drawn freehand: each bows a little and ends a little off level.
 * `breaks` is an optional list per line of [x, halfWidth] gaps (the tab's fret numbers sit in
 * the line, not on top of it).
 */
function handLines(r, x1, x2, y0, gap, n, color, w, wob, breaks = []) {
  let g = '';
  for (let k = 0; k < n; k++) {
    const y = y0 + k * gap;
    const a = spread(r, wob);
    const b = spread(r, wob);
    const c = spread(r, wob * 1.4);
    const sw = f(w * (0.88 + r() * 0.3));
    const yAt = (x) => {
      const t = (x - x1) / (x2 - x1);
      return y + a + (b - a) * t + 2 * c * t * (1 - t);
    };
    // The segments between the gaps.
    const cuts = (breaks[k] ?? []).slice().sort((p, q) => p[0] - q[0]);
    const segs = [];
    let from = x1;
    for (const [bx, hw] of cuts) {
      if (bx - hw > from) segs.push([from, bx - hw]);
      from = Math.max(from, bx + hw);
    }
    if (from < x2) segs.push([from, x2]);
    for (const [sa, sb] of segs) {
      const ya = yAt(sa);
      const yb = yAt(sb);
      const ym = yAt((sa + sb) / 2);
      g += `<path d="M${f(sa)} ${f(ya)}Q${f((sa + sb) / 2)} ${f(2 * ym - (ya + yb) / 2)} ${f(sb)} ${f(yb)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
  }
  return g;
}

// ── The tune ───────────────────────────────────────────────────────────────────
/**
 * "Ode to Joy" (Beethoven, public domain), in C, the first thing most beginners play. One
 * simplification, kept for a first reader: the dotted-quarter-and-eighth in bars 4 and 8 is two
 * quarters. Bars of four beats; each note is [name, beats].
 */
const ODE = [
  [
    ['E4', 1],
    ['E4', 1],
    ['F4', 1],
    ['G4', 1],
  ],
  [
    ['G4', 1],
    ['F4', 1],
    ['E4', 1],
    ['D4', 1],
  ],
  [
    ['C4', 1],
    ['C4', 1],
    ['D4', 1],
    ['E4', 1],
  ],
  [
    ['E4', 1],
    ['D4', 1],
    ['D4', 2],
  ],
  [
    ['E4', 1],
    ['E4', 1],
    ['F4', 1],
    ['G4', 1],
  ],
  [
    ['G4', 1],
    ['F4', 1],
    ['E4', 1],
    ['D4', 1],
  ],
  [
    ['C4', 1],
    ['C4', 1],
    ['D4', 1],
    ['E4', 1],
  ],
  [
    ['D4', 1],
    ['C4', 1],
    ['C4', 2],
  ],
];
/** Right-hand fingering, by note, for the first system: the teacher's pencil. */
const FINGERS = ['3', '3', '4', '5', '5', '4', '3', '2', '1', '1', '2', '3', '3', '2', '2'];
/** Guitar tab: [string (0 = high E), fret]. The tune lies on the top two strings. */
const TAB = { E4: [0, 0], F4: [0, 1], G4: [0, 3], D4: [1, 3], C4: [1, 1] };

/**
 * One hand-copied system: a staff with the tune and, beneath it, the same notes as guitar tab.
 * Returns the ink and the pencil as separate layers (they take different filters), both leaning
 * with the system. `bars` are slices of ODE; `crop` lets the last bar run off the canvas.
 */
function system(r, o) {
  const { x0, x1, y0, s, tg, beat, bars, lean, time = false, final = false, pencil = false } = o;
  const yTab = o.yTab;
  const xn = x0 + (time ? 5.7 : 4) * s;
  const barW = 4 * beat;
  const plot = [];
  bars.forEach((bar, bi) => {
    let off = 0;
    for (const [name, beats] of bar) {
      plot.push({ name, beats, x: xn + bi * barW + (off + 0.46) * beat });
      off += beats;
    }
  });

  // Tab fret numbers break the string they sit on.
  const gaps = Array.from({ length: 6 }, () => []);
  for (const p of plot) gaps[TAB[p.name][0]].push([p.x, tg * 0.72]);
  let ink = handLines(r, x0, x1, y0, s, 5, C.staffInk, 3.4, 1.5);
  ink += handLines(r, x0, x1, yTab, tg, 6, C.staffInk, 3, 1.5, gaps);
  ink += clef(x0 + 1.6 * s, y0, s);
  if (time) ink += four(x0 + 3.5 * s, y0, s) + four(x0 + 3.5 * s, y0 + 2 * s, s);
  // The tab clef: T A B stacked across the six strings.
  ['T', 'A', 'B'].forEach((ch, i) => {
    ink += `<text x="${f(x0 + 1.7 * s)}" y="${f(yTab + tg * (1.55 + i * 1.55))}" text-anchor="middle" font-family="${FELL}" font-size="${f(tg * 1.95)}" fill="${C.ink}">${ch}</text>`;
  });

  let pen = '';
  plot.forEach((p, i) => {
    const hy = noteY(y0, s, p.name);
    // A hand never sets a notehead quite level or quite plumb.
    const dx = spread(r, 2.4);
    const dy = spread(r, 2);
    const rot = spread(r, 3.2);
    ink += `<g transform="translate(${f(dx)} ${f(dy)}) rotate(${f(rot)} ${f(p.x)} ${f(hy)})">${note(p.x, y0, s, p.name, { hollow: p.beats === 2 })}</g>`;
    const [str, fret] = TAB[p.name];
    ink += `<text x="${f(p.x + spread(r, 1.5))}" y="${f(yTab + str * tg + tg * 0.34 + spread(r, 1.2))}" text-anchor="middle" font-family="${DIGITS}" font-style="italic" font-weight="600" font-size="${f(tg * 1.3)}" fill="${C.ink}">${fret}</text>`;
    if (pencil && FINGERS[i]) {
      pen += `<text x="${f(p.x + spread(r, 3))}" y="${f(hy - 4.1 * s + spread(r, 3))}" text-anchor="middle" font-family="${DIGITS}" font-style="italic" font-size="${f(s * 0.95)}" fill="${C.pencil}">${FINGERS[i]}</text>`;
    }
  });
  bars.forEach((_, bi) => {
    const bx = xn + (bi + 1) * barW;
    const last = bi === bars.length - 1;
    if (last && !final && !o.crop) return;
    if (bx > x1 - 8) return;
    ink += last && final ? barline(bx, y0, s, C.ink, true) : barline(bx, y0, s, C.ink);
    // The bar line crosses the tab too.
    ink += `<line x1="${f(bx)}" y1="${f(yTab)}" x2="${f(bx)}" y2="${f(yTab + 5 * tg)}" stroke="${C.ink}" stroke-width="${f(0.1 * s)}"/>`;
  });
  const t = `rotate(${lean} ${f(x0)} ${f(y0)})`;
  return { ink: `<g transform="${t}">${ink}</g>`, pencil: `<g transform="${t}">${pen}</g>` };
}

/** The pre-printed manuscript staves the music is written on, faint, ruled freehand. */
function emptyStaves(r, x1, x2, rows, s, w = 2.2) {
  return rows.map((y) => handLines(r, x1, x2, y, s, 5, C.staffFaint, w, 1.8)).join('');
}

// ── The wordmark ───────────────────────────────────────────────────────────────
/**
 * "RMH Music" in IM Fell English with a note for the dot of the i. The i is a dotless ı laid out
 * piece by piece (each piece's advance and ink measured in Chromium, see main) so the notehead
 * can be set over its real centre. Metrics are per 1px of font size.
 */
const WORD_PARTS = ['RMH Mus', 'ı', 'c'];
let WM = null;

function wordmark(cx, y, width, { halo = 0, left } = {}) {
  let pen = 0;
  let minL = Infinity;
  let maxR = -Infinity;
  const at = WM.parts.map((m) => {
    const x = pen;
    minL = Math.min(minL, x - m.left);
    maxR = Math.max(maxR, x + m.right);
    pen += m.advance;
    return { x, ...m };
  });
  const size = width / (maxR - minL);
  const x0 = (left ?? cx - width / 2) - minL * size;
  const dotted = at[1];
  // The notehead over the ı: a quarter-note head with a short stem and an eighth flag.
  const hx = x0 + (dotted.x + (dotted.right - dotted.left) / 2) * size;
  const hy = y - (WM.xh + 0.12) * size;
  const rx = 0.082 * size;
  const ry = 0.058 * size;
  const sw = 0.03 * size;
  const sx = hx + rx * 0.9 - sw / 2;
  const sy2 = hy - 0.25 * size;
  const fs = 0.088 * size;
  const flag = `<path d="M${f(sx - sw / 2)} ${f(sy2)}C${f(sx + 0.1 * fs)} ${f(sy2 + 0.9 * fs)} ${f(sx + 1.25 * fs)} ${f(sy2 + 1.3 * fs)} ${f(sx + 0.85 * fs)} ${f(sy2 + 2.75 * fs)}C${f(sx + 1.0 * fs)} ${f(sy2 + 1.65 * fs)} ${f(sx + 0.3 * fs)} ${f(sy2 + 1.35 * fs)} ${f(sx - sw / 2)} ${f(sy2 + 1.05 * fs)}Z"/>`;
  const noteShapes = (extra) =>
    `<g ${extra}><ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(-22 ${f(hx)} ${f(hy)})"/><rect x="${f(sx - sw / 2)}" y="${f(sy2)}" width="${f(sw)}" height="${f(hy - sy2)}"/>${flag}</g>`;
  const text = (extra) =>
    at
      .map(
        (m, i) =>
          `<text x="${f(x0 + m.x * size)}" y="${f(y)}" font-family="${FELL}" font-size="${f(size)}" ${extra}>${WORD_PARTS[i]}</text>`,
      )
      .join('');
  const haloSvg = halo
    ? text(
        `fill="${C.sheet}" stroke="${C.sheet}" stroke-width="${f(halo)}" stroke-linejoin="round"`,
      ) +
      noteShapes(
        `fill="${C.sheet}" stroke="${C.sheet}" stroke-width="${f(halo)}" stroke-linejoin="round"`,
      )
    : '';
  const ink = text(`fill="${C.ink}"`) + noteShapes(`fill="${C.ink}"`);
  return {
    halo: haloSvg,
    ink,
    size,
    x1: x0 + minL * size,
    x2: x0 + maxR * size,
    top: Math.min(y - WM.ascent * size, sy2),
    bottom: y + WM.descent * size,
  };
}

// ── The four pieces ────────────────────────────────────────────────────────────
function cardSvg() {
  const W = 1600;
  const H = 2400;
  const s = 34; // staff space
  const pitch = 252; // one stave to the next on the printed page
  const row = (k) => 140 + pitch * k;
  const x0 = 210;
  const x1 = 1450;
  const r = rng(20261108);
  const sys1 = system(r, {
    x0,
    x1,
    y0: row(3),
    yTab: row(4) + 6,
    s,
    tg: 32,
    beat: 64,
    bars: ODE.slice(0, 4),
    lean: -0.28,
    time: true,
    pencil: true,
  });
  const sys2 = system(r, {
    x0,
    x1,
    y0: row(5),
    yTab: row(6) + 6,
    s,
    tg: 32,
    beat: 64,
    bars: ODE.slice(4),
    lean: 0.22,
    final: true,
  });
  const empty = emptyStaves(r, x0 - 40, x1 + 80, [0, 1, 2, 7, 8].map(row), s);
  const wm = wordmark(0, 560, 1240, { left: x0 + 8 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${paperDefs('c')}${inkDefs('c-ink', 1, 5)}${inkDefs('c-pen', 1, 11, 2)}</defs>
  ${paper('c', W, H)}
  <path d="M150 0Q155 1200 149 ${H}" fill="none" stroke="${C.margin}" stroke-width="3" opacity="0.8"/>
  ${empty}
  <g filter="url(#c-ink)">${sys1.ink}${sys2.ink}${wm.ink}</g>
  <g filter="url(#c-pen)" opacity="0.8">${sys1.pencil}</g>
</svg>`;
}

function bannerSvg() {
  const W = 3840;
  const H = 1280;
  const s = 60;
  const r = rng(20261109);
  const rows = [250, 640, 1010];
  const sys = system(r, {
    x0: 420,
    x1: W,
    y0: rows[0],
    yTab: rows[1],
    s,
    tg: 40,
    beat: 124,
    bars: ODE.slice(0, 7),
    lean: -0.2,
    time: true,
    crop: true,
  });
  const empty = emptyStaves(r, 380, W, [rows[2]], s, 3.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${paperDefs('b', 11)}${inkDefs('b-ink', 2.4, 3)}</defs>
  ${paper('b', W, H)}
  <path d="M330 0Q336 640 329 ${H}" fill="none" stroke="${C.margin}" stroke-width="5" opacity="0.8"/>
  ${empty}
  <g filter="url(#b-ink)">${sys.ink}</g>
</svg>`;
}

function logoSvg() {
  const W = 1024;
  const H = 270;
  const wm = wordmark(W / 2, 0, W - 70, { halo: 9 });
  // Centre the ink box vertically in the canvas.
  const dy = (H - (wm.bottom - wm.top)) / 2 - wm.top;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="translate(0 ${f(dy)})">${wm.halo}${wm.ink}</g>
</svg>`;
}

function iconSvg() {
  const W = 1024;
  const s = 104;
  const y0 = 300;
  const r = rng(20261110);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <defs>${paperDefs('i', 3)}${inkDefs('i-ink', 0.64, 7, 3.4)}<clipPath id="i-page"><rect x="64" y="64" width="${W - 128}" height="${W - 128}" rx="150"/></clipPath></defs>
  <rect width="${W}" height="${W}" fill="${C.ink}"/>
  <g clip-path="url(#i-page)">${paper('i', W, W)}
    <path d="M170 64Q173 540 169 ${W}" fill="none" stroke="${C.margin}" stroke-width="5" opacity="0.9"/>
  </g>
  <g filter="url(#i-ink)" transform="rotate(-1.2 512 512)">
    ${handLines(r, 150, 874, y0, s, 5, C.staffInk, 8, 3)}
    ${clef(330, y0, s)}
    <g transform="rotate(-2 680 520)">${beamedPair(600, 'F4', 760, 'A4', y0, s, C.ink)}</g>
  </g>
</svg>`;
}

// ── Render ─────────────────────────────────────────────────────────────────────
const PIECES = {
  card: { svg: cardSvg, w: 1600, h: 2400, out: 'rmhmusic.webp', alpha: false, q: 86 },
  banner: { svg: bannerSvg, w: 3840, h: 1280, out: 'banners/rmhmusic.webp', alpha: false, q: 84 },
  logo: { svg: logoSvg, w: 1024, h: 270, out: 'logos/rmhmusic.webp', alpha: true, q: 90 },
  icon: { svg: iconSvg, w: 1024, h: 1024, out: 'icons/rmhmusic.webp', alpha: false, q: 88 },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The wordmark's piece advances and ink boxes in IM Fell English, per 1px of font size. */
async function measureWordmark(browser, tmp) {
  const file = join(tmp, 'measure.html');
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}</style></head><body></body></html>`,
  );
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  const m = await page.evaluate(async (parts) => {
    const font = "400 1000px 'IM Fell English'";
    await document.fonts.load(font);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    const box = (t) => {
      const q = ctx.measureText(t);
      return {
        advance: q.width / 1000,
        left: q.actualBoundingBoxLeft / 1000,
        right: q.actualBoundingBoxRight / 1000,
        ascent: q.actualBoundingBoxAscent / 1000,
        descent: q.actualBoundingBoxDescent / 1000,
      };
    };
    const all = box(parts.join(''));
    return { parts: parts.map(box), xh: box('x').ascent, ascent: all.ascent, descent: all.descent };
  }, WORD_PARTS);
  await page.close();
  return m;
}

async function main() {
  const only = arg('--only')?.split(',') ?? Object.keys(PIECES);
  const preview = arg('--preview');
  if (preview) mkdirSync(preview, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'rmhmusic-art-'));
  // As in scripts/audit-pages.mjs: `--chromium <path>` (or PW_CHROMIUM) when Playwright's own
  // browser build is not installed.
  const executablePath = arg('--chromium') || process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    WM = await measureWordmark(browser, tmp);
    for (const key of only) {
      const p = PIECES[key];
      if (!p) throw new Error(`unknown piece: ${key}`);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
        html,body{margin:0;padding:0;background:${p.alpha ? 'transparent' : C.paper}}svg{display:block}</style></head>
        <body>${p.svg()}</body></html>`;
      const file = join(tmp, `${key}.html`);
      writeFileSync(file, html);
      const page = await browser.newPage({
        viewport: { width: p.w, height: p.h },
        deviceScaleFactor: 2,
      });
      await page.goto(pathToFileURL(file).href);
      // Load every face up front (a face is otherwise only fetched once text uses it), then check.
      await page.evaluate(
        (checks) => Promise.all(checks.map((c) => document.fonts.load(c))),
        FONT_CHECKS,
      );
      await page.evaluate(() => document.fonts.ready);
      const missing = await page.evaluate(
        (checks) => checks.filter((c) => !document.fonts.check(c)),
        FONT_CHECKS,
      );
      if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
      const png = await page.screenshot({ omitBackground: p.alpha, fullPage: false });
      await page.close();
      const out = join(OUT, p.out);
      let img = sharp(png).resize(p.w, p.h, { kernel: 'lanczos3' });
      if (!p.alpha) img = img.flatten({ background: C.paper }).removeAlpha();
      await img.clone().webp({ quality: p.q, effort: 6, alphaQuality: 100 }).toFile(out);
      if (preview)
        await img
          .clone()
          .png()
          .toFile(join(preview, `${key}.png`));
      process.stdout.write(
        `${key}: ${p.w}×${p.h} → ${out} (${Math.round(statSync(out).size / 1024)} KB)\n`,
      );
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
