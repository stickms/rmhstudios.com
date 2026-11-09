#!/usr/bin/env node
/**
 * Generates RMH Music's catalog art: the card, banner, logo and icon.
 *
 *   public/images/games/rmhmusic.webp          card    1600×2400 (2:3), opaque
 *   public/images/games/banners/rmhmusic.webp  banner  3840×1280 (3:1), opaque, text-free
 *   public/images/games/logos/rmhmusic.webp    logo    1024×270, transparent (the wordmark)
 *   public/images/games/icons/rmhmusic.webp    icon    1024×1024, opaque
 *
 * The art is the app's own notebook paper (components/rmhmusic/rmhmusic.css: cream paper, navy
 * fountain-pen ink, blue ruled lines, a red-pencil margin rule, one indigo pen-ink accent) with
 * what a beginner learns in it: a treble staff with a correctly notated melody, a piano keyboard
 * and a guitar chord box, all showing C major. Everything is original vector artwork drawn here as
 * SVG; the treble clef, noteheads, time signature and instruments are geometry, not font glyphs.
 * The only third-party inputs are the bundled OFL fonts in components/shared/game-fonts/
 * (Cormorant Garamond for the wordmark, the pen annotations and the tagline, IBM Plex
 * Mono for string names). See docs/game-art-credits.md.
 *
 * Pipeline: SVG → an HTML page in a temp dir (fonts via file:// URLs) → headless Chromium
 * (Playwright) at 2× → sharp (Lanczos down to the exact size) → WebP. Deterministic: no
 * randomness (the paper grain is a seeded feTurbulence), so a re-run reproduces the same art.
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS = join(ROOT, 'components', 'shared', 'game-fonts');
const OUT = join(ROOT, 'public', 'images', 'games');

// ── Palette: the app's light "paper" tokens (rmhmusic.css), a little stronger where art needs it ──
const C = {
  paper: '#f6f0e1', // --app-bg
  sheet: '#fcf8ee', // --app-surface
  paperDeep: '#efe7d4', // --app-bg-subtle
  ink: '#1a2747', // --app-text
  inkMuted: '#3f4d70', // --app-text-muted
  accent: '#4338ca', // --app-accent (pen ink)
  accentWash: '#d9d8f6', // the accent at ~15% on the sheet: a pressed key
  rule: '#c3cfe4', // --rmm-rule
  staffFaint: '#d3dbea', // --rmm-staff, a touch lighter so it stays background
  staffInk: '#6f82a8', // --app-border-bright: the inked staff in ruled-line blue
  margin: '#dd8f88', // --rmm-margin, pencil-strong
};

// ── Fonts ──────────────────────────────────────────────────────────────────────
const fontUrl = (p) => pathToFileURL(join(FONTS, p)).href;
const FONT_CSS = `
@font-face{font-family:'Great Vibes';src:url('${fontUrl('GreatVibes/GreatVibes-Regular.woff2')}') format('woff2');font-weight:400}
@font-face{font-family:'Cormorant Garamond';src:url('${fontUrl('CormorantGaramond/CormorantGaramond-Variable.woff2')}') format('woff2');font-weight:300 700;font-style:normal}
@font-face{font-family:'Cormorant Garamond';src:url('${fontUrl('CormorantGaramond/CormorantGaramond-Italic-Variable.woff2')}') format('woff2');font-weight:300 700;font-style:italic}
@font-face{font-family:'IBM Plex Mono';src:url('${fontUrl('IBMPlexMono/IBMPlexMono-Medium.woff2')}') format('woff2');font-weight:500}
@font-face{font-family:'Bodoni Moda';src:url('${fontUrl('BodoniModa/BodoniModa-Italic-wght.woff2')}') format('woff2');font-weight:400 900;font-style:italic}
@font-face{font-family:'Cinzel';src:url('${fontUrl('Cinzel/Cinzel-Variable.woff2')}') format('woff2');font-weight:400 900;font-style:normal}
@font-face{font-family:'Jost';src:url('${fontUrl('Jost/Jost-Variable.woff2')}') format('woff2');font-weight:100 900;font-style:normal}
`;
const FONT_CHECKS = [
  "400 40px 'Great Vibes'",
  "600 40px 'Cormorant Garamond'",
  "italic 600 40px 'Cormorant Garamond'",
  "500 40px 'IBM Plex Mono'",
];

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

function staffLines(x1, x2, y0, s, color, w) {
  let g = '';
  for (let k = 0; k < 5; k++) {
    const y = y0 + k * s;
    g += `<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}" stroke="${color}" stroke-width="${f(w)}"/>`;
  }
  return g;
}

function barline(x, y0, s, color = C.ink, final = false) {
  const thin = `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + 4 * s)}" stroke="${color}" stroke-width="${f(0.12 * s)}"/>`;
  if (!final) return thin;
  return `${thin}<rect x="${f(x + 0.32 * s)}" y="${f(y0)}" width="${f(0.42 * s)}" height="${f(4 * s)}" fill="${color}"/>`;
}

/** Faint empty manuscript staves over a region, the app backdrop's paper. */
function manuscript(x1, x2, yStart, yEnd, s, gap, color = C.staffFaint) {
  let g = '';
  for (let y = yStart; y + 4 * s <= yEnd; y += 4 * s + gap) g += staffLines(x1, x2, y, s, color, 2);
  return g;
}

// ── Instruments ────────────────────────────────────────────────────────────────
const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Black keys sit after these white keys (C#, D#, F#, G#, A#): groups of two and three. */
const HAS_SHARP = new Set(['C', 'D', 'F', 'G', 'A']);

/**
 * A piano keyboard from C, `n` white keys wide. `lit` names white keys to highlight
 * (e.g. ['C4','E4','G4']), labelled at the key's foot in pen ink.
 */
function keyboard(x, y, w, h, n, { lit = [], labels = true, startOct = 4, labelSize } = {}) {
  const kw = w / n;
  const bw = kw * 0.6;
  const bh = h * 0.62;
  const r = kw * 0.12;
  let g = `<g>`;
  // The case: a navy lip above the keys, like the fallboard edge.
  g += `<rect x="${f(x - kw * 0.12)}" y="${f(y - h * 0.09)}" width="${f(w + kw * 0.24)}" height="${f(h * 0.09 + h + kw * 0.12)}" rx="${f(r * 1.4)}" fill="${C.ink}"/>`;
  for (let i = 0; i < n; i++) {
    const name = WHITE[i % 7] + (startOct + Math.floor(i / 7));
    const on = lit.includes(name);
    const kx = x + i * kw;
    g += `<path d="M${f(kx + 2)} ${f(y)}H${f(kx + kw - 2)}V${f(y + h - r)}Q${f(kx + kw - 2)} ${f(y + h)} ${f(kx + kw - 2 - r)} ${f(y + h)}H${f(kx + 2 + r)}Q${f(kx + 2)} ${f(y + h)} ${f(kx + 2)} ${f(y + h - r)}Z" fill="${on ? C.accentWash : C.sheet}"/>`;
    if (on) {
      g += `<rect x="${f(kx + kw * 0.2)}" y="${f(y + h - kw * 0.2 - kw * 0.12)}" width="${f(kw * 0.6)}" height="${f(kw * 0.12)}" rx="${f(kw * 0.06)}" fill="${C.accent}"/>`;
    }
    if (labels && on) {
      const fs = labelSize ?? kw * 0.5;
      g += `<text x="${f(kx + kw / 2)}" y="${f(y + h - kw * 0.48)}" text-anchor="middle" font-family="Cormorant Garamond" font-style="italic" font-weight="700" font-size="${f(fs)}" fill="${C.accent}">${name[0]}</text>`;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (!HAS_SHARP.has(WHITE[i % 7])) continue;
    const bx = x + (i + 1) * kw - bw / 2;
    g += `<path d="M${f(bx)} ${f(y)}H${f(bx + bw)}V${f(y + bh - r * 0.6)}Q${f(bx + bw)} ${f(y + bh)} ${f(bx + bw - r * 0.6)} ${f(y + bh)}H${f(bx + r * 0.6)}Q${f(bx)} ${f(y + bh)} ${f(bx)} ${f(y + bh - r * 0.6)}Z" fill="${C.ink}"/>`;
    // A sliver of light on the key's face.
    g += `<rect x="${f(bx + bw * 0.18)}" y="${f(y + bh * 0.06)}" width="${f(bw * 0.12)}" height="${f(bh * 0.78)}" rx="${f(bw * 0.06)}" fill="#3a4a72" opacity="0.7"/>`;
  }
  return `${g}</g>`;
}

/**
 * A six-string chord box, strings 6 → 1 left to right, nut on top. `shape` is the chord in
 * standard notation low E → high E ('x32010' = C major); `fingers` the fingering in the same order.
 */
function chordBox(x, y, w, frets, shape, fingers, { name, stringNames = true } = {}) {
  const gap = w / 5;
  const fh = gap * 1.28;
  const h = fh * frets;
  const line = gap * 0.055;
  let g = `<g>`;
  if (name) {
    g += `<text x="${f(x + w / 2)}" y="${f(y - gap * 1.25)}" text-anchor="middle" font-family="Cormorant Garamond" font-weight="700" font-size="${f(gap * 1.25)}" fill="${C.ink}">${name}</text>`;
  }
  for (let i = 0; i < 6; i++) {
    const sx = x + i * gap;
    g += `<line x1="${f(sx)}" y1="${f(y)}" x2="${f(sx)}" y2="${f(y + h)}" stroke="${C.ink}" stroke-width="${f(line * (1.5 - i * 0.12))}" stroke-linecap="round"/>`;
  }
  for (let k = 1; k <= frets; k++) {
    g += `<line x1="${f(x)}" y1="${f(y + k * fh)}" x2="${f(x + w)}" y2="${f(y + k * fh)}" stroke="${C.ink}" stroke-width="${f(line)}"/>`;
  }
  g += `<rect x="${f(x - line)}" y="${f(y - gap * 0.2)}" width="${f(w + 2 * line)}" height="${f(gap * 0.22)}" rx="${f(gap * 0.05)}" fill="${C.ink}"/>`;
  for (let i = 0; i < 6; i++) {
    const sx = x + i * gap;
    const c = shape[i];
    const my = y - gap * 0.62;
    const m = gap * 0.2;
    if (c === 'x') {
      g += `<path d="M${f(sx - m)} ${f(my - m)}L${f(sx + m)} ${f(my + m)}M${f(sx + m)} ${f(my - m)}L${f(sx - m)} ${f(my + m)}" stroke="${C.ink}" stroke-width="${f(gap * 0.07)}" stroke-linecap="round"/>`;
    } else if (c === '0') {
      g += `<circle cx="${f(sx)}" cy="${f(my)}" r="${f(m)}" fill="none" stroke="${C.ink}" stroke-width="${f(gap * 0.06)}"/>`;
    } else {
      const fy = y + (Number(c) - 0.5) * fh;
      g += `<circle cx="${f(sx)}" cy="${f(fy)}" r="${f(gap * 0.36)}" fill="${C.accent}"/>`;
      g += `<text x="${f(sx)}" y="${f(fy + gap * 0.17)}" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="${f(gap * 0.46)}" fill="${C.sheet}">${fingers[i]}</text>`;
    }
  }
  if (stringNames) {
    'EADGBE'.split('').forEach((n, i) => {
      g += `<text x="${f(x + i * gap)}" y="${f(y + h + gap * 0.8)}" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="${f(gap * 0.44)}" fill="${C.inkMuted}">${n}</text>`;
    });
  }
  return `${g}</g>`;
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

/** A hand-drawn pen arrow along a quadratic curve, with a two-stroke head. */
function penArrow(x1, y1, cx, cy, x2, y2, w, color = C.accent) {
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const L = w * 5.5;
  const a1 = ang + Math.PI * 0.82;
  const a2 = ang - Math.PI * 0.82;
  return `<g fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}"/>
    <path d="M${f(x2 + Math.cos(a1) * L)} ${f(y2 + Math.sin(a1) * L)}L${f(x2)} ${f(y2)}L${f(x2 + Math.cos(a2) * L)} ${f(y2 + Math.sin(a2) * L)}"/>
  </g>`;
}

/** The pen-ink swash under the wordmark: a tapered stroke. */
function swash(x1, y1, x2, y2, sag, w, color = C.accent) {
  const mx = (x1 + x2) / 2;
  const pts = [
    [x1, y1, w * 0.15],
    [x1 + (mx - x1) * 0.5, (y1 + y2) / 2 + sag * 0.7, w * 0.8],
    [mx, (y1 + y2) / 2 + sag, w],
    [mx + (x2 - mx) * 0.55, (y1 + y2) / 2 + sag * 0.6, w * 0.7],
    [x2, y2, w * 0.1],
  ];
  return `<path d="${ribbon(pts, 30)}" fill="${color}"/>`;
}

/** The swash's cream outline, drawn under it (and under the lettering's ink) on the logo. */
function swashHalo(x1, y1, x2, y2, sag, w, halo) {
  return swash(x1, y1, x2, y2, sag, w, C.sheet).replace(
    '<path ',
    `<path stroke="${C.sheet}" stroke-width="${halo}" stroke-linejoin="round" `,
  );
}

const pen = (
  x,
  y,
  size,
  text,
  { anchor = 'middle', color = C.accent, weight = 600, italic = true } = {},
) =>
  `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="Cormorant Garamond" ${italic ? 'font-style="italic"' : ''} font-weight="${weight}" font-size="${f(size)}" fill="${color}">${text}</text>`;

/** Mono digits for fingerings (lining figures; the serif's are old-style). */
const finger = (x, y, size, text, color = C.inkMuted) =>
  `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="${f(size)}" fill="${color}">${text}</text>`;

/**
 * Ink metrics of the wordmark at 1px, measured in Chromium before drawing (see main), so the
 * lettering can be fitted to a width and the swash hung under its real ink.
 */
const WORD = 'RMH Music';
let WM = { left: 0, right: 0, ascent: 0, descent: 0 };

/**
 * The wordmark's typeface, picked with `--wordmark-font <key>` (default below). Every entry is a
 * bundled OFL face from components/shared/game-fonts/. `pieces` is the word laid out piece by
 * piece — each piece's advance and ink measured in Chromium — so a face with one awkward capital
 * can be corrected by hand: `sx` scales a piece horizontally about its pen origin and `gap`
 * (em/1000) follows it. Great Vibes' looped capital H is wide enough to dwarf the R and M and
 * crowd the M, so it is narrowed and the word space is set by hand; the other faces set the word
 * as one run. `swashDrop` (em) hangs the swash under the baseline for the upright faces, whose
 * letters it would otherwise cut through (a script's long descenders hide it). `stroke` is a hairline of ink round the fill (em), which gives a thin script a
 * fountain pen's weight.
 */
const WORDMARKS = {
  'great-vibes': {
    family: 'Great Vibes',
    weight: 400,
    style: 'normal',
    stroke: 0.012,
    swashDrop: 0,
    pieces: [
      { text: 'R', sx: 1, gap: 20 },
      { text: 'M', sx: 1, gap: 30 },
      { text: 'H', sx: 0.8, gap: 170 },
      { text: 'Music', sx: 1, gap: 0 },
    ],
  },
  cormorant: {
    family: 'Cormorant Garamond',
    weight: 700,
    style: 'italic',
    stroke: 0.004,
    swashDrop: 0.1,
  },
  bodoni: { family: 'Bodoni Moda', weight: 700, style: 'italic', stroke: 0, swashDrop: 0.1 },
  cinzel: { family: 'Cinzel', weight: 700, style: 'normal', stroke: 0, swashDrop: 0.1 },
  jost: { family: 'Jost', weight: 600, style: 'normal', stroke: 0, swashDrop: 0.1 },
};
const WORDMARK_FONT = arg('--wordmark-font') ?? 'cormorant';
if (!WORDMARKS[WORDMARK_FONT]) throw new Error(`unknown wordmark font: ${WORDMARK_FONT}`);
const WORDMARK = WORDMARKS[WORDMARK_FONT];
const PIECES_OF_WORD = WORDMARK.pieces ?? [{ text: WORD, sx: 1, gap: 0 }];
const wordmarkFont = (px) => `${WORDMARK.style} ${WORDMARK.weight} ${px}px '${WORDMARK.family}'`;
/** Filled by main(): [{ text, x, sx }] in em, plus the ink box. */
let LAYOUT = [];

function layoutWord(measured) {
  let pen = 0;
  let minL = Infinity;
  let maxR = -Infinity;
  LAYOUT = PIECES_OF_WORD.map((p, i) => {
    const m = measured[i];
    const x = pen;
    minL = Math.min(minL, x - m.left * p.sx);
    maxR = Math.max(maxR, x + m.right * p.sx);
    pen += m.advance * p.sx + p.gap / 1000;
    return { text: p.text, x, sx: p.sx };
  });
  return { left: -minL, right: maxR };
}

/**
 * The wordmark fitted to `width` of ink, centred on `cx`, baseline `y`; an optional cream halo so
 * it reads on dark and light grounds. Returns the markup and the ink box.
 */
function wordmark(cx, y, width, { halo = 0 } = {}) {
  const inkW = WM.right + WM.left;
  const size = width / inkW;
  // text-anchor start at x: ink spans x - left·size … x + right·size.
  const x = cx - width / 2 + WM.left * size;
  const t = (extra) =>
    LAYOUT.map((p) => {
      const px = x + p.x * size;
      const tf =
        p.sx === 1
          ? ''
          : ` transform="translate(${f(px)} 0) scale(${p.sx} 1) translate(${f(-px)} 0)"`;
      return `<text x="${f(px)}" y="${f(y)}"${tf} font-family="${WORDMARK.family}" font-weight="${WORDMARK.weight}" font-style="${WORDMARK.style}" font-size="${f(size)}" ${extra}>${p.text}</text>`;
    }).join('');
  const weight = size * WORDMARK.stroke;
  const haloSvg = halo
    ? t(
        `fill="${C.sheet}" stroke="${C.sheet}" stroke-width="${f(halo + weight)}" stroke-linejoin="round"`,
      )
    : '';
  const ink = t(
    `fill="${C.ink}" stroke="${C.ink}" stroke-width="${f(weight)}" stroke-linejoin="round"`,
  );
  return {
    svg: haloSvg + ink,
    halo: haloSvg,
    ink,
    size,
    x1: cx - width / 2,
    x2: cx + width / 2,
    top: y - WM.ascent * size,
    bottom: y + WM.descent * size,
    /** How far the swash hangs below where a script's descenders would hide it. */
    drop: WORDMARK.swashDrop * size,
  };
}

// ── The four pieces ────────────────────────────────────────────────────────────
function cardSvg() {
  const W = 1600;
  const H = 2400;
  const M = 150; // the red margin rule
  const s = 50;
  const y0 = 930; // inked staff, top line
  const xs = 210;
  const xe = 1470;
  // A rising C major scale, C4 → C5, with the right hand's fingering (thumb under after E).
  const melody = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const fingers = ['1', '2', '3', '1', '2', '3', '4', '5'];
  const nx = [488, 610, 732, 854, 1010, 1132, 1254, 1376];
  let notes = '';
  melody.forEach((n, i) => {
    notes += note(nx[i], y0, s, n);
    notes += pen(nx[i], y0 + 7.1 * s, 66, n[0]);
    notes += finger(nx[i], y0 - 1.6 * s, 40, fingers[i]);
  });
  const ta = nx[2] + 6;
  const tb = nx[3] - 6;
  const thumb = `<path d="M${ta} ${y0 - 2.55 * s}Q${(ta + tb) / 2} ${y0 - 3.45 * s} ${tb} ${y0 - 2.55 * s}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round"/>`;
  const thumbLabel = pen((ta + tb) / 2, y0 - 3.7 * s, 42, 'thumb under', { weight: 500 });

  const wm = wordmark(W / 2 + M / 2 - 10, 410, 1200);
  const kbX = 230;
  const kbY = 1600;
  const kbW = 820;
  const kbH = 400;
  const cbX = 1150;
  const cbY = 1690;
  const band = [y0 - 5 * s, y0 + 8.4 * s];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${paperDefs('c')}</defs>
  ${paper('c', W, H)}
  ${manuscript(M, W, 110, band[0], 24, 110)}
  ${manuscript(M, W, band[1] + 70, H - 60, 24, 110)}
  <rect x="${M - 1.5}" y="0" width="3" height="${H}" fill="${C.margin}" opacity="0.85"/>
  ${swash(wm.x1 + 70, wm.bottom + 4 + wm.drop, wm.x2 - 30, wm.bottom - 10 + wm.drop, 18, 12)}
  ${wm.svg}
  ${pen(W / 2 + M / 2 - 10, wm.bottom + 150, 100, 'Learn piano &amp; guitar', { color: C.ink, italic: false, weight: 600 })}
  ${staffLines(xs, xe, y0, s, C.staffInk, 3.4)}
  ${clef(xs + 72, y0, s)}
  ${four(xs + 160, y0, s)}${four(xs + 160, y0 + 2 * s, s)}
  ${notes}
  ${barline(932, y0, s)}
  ${barline(xe - 22, y0, s, C.ink, true)}
  ${thumb}${thumbLabel}
  ${penArrow(nx[0] - 26, y0 + 7.5 * s, nx[0] - 150, y0 + 10.6 * s, kbX + 44, kbY - 46, 4.5)}
  ${pen(nx[0] - 120, y0 + 9.3 * s, 42, 'middle C', { anchor: 'end', weight: 500 })}
  ${keyboard(kbX, kbY, kbW, kbH, 10, { lit: ['C4', 'E4', 'G4'] })}
  ${chordBox(cbX, cbY, 280, 4, 'x32010', ['', '3', '2', '', '1', ''], { name: 'C' })}
  ${pen(W / 2 + M / 2 - 10, 2130, 56, 'C major, on keys and on strings', { color: C.inkMuted, weight: 500 })}
  ${pen(W / 2 + M / 2 - 10, 2262, 70, 'Read music · Train your ear · Play along', { color: C.ink, weight: 500 })}
</svg>`;
}

function bannerSvg() {
  const W = 3840;
  const H = 1280;
  // Content sits in y ≈ 170–800: the library hero crops a wide window's banner to about that band.
  const s = 78;
  const y0 = 330;
  const xs = 1440;
  const xe = 2830;
  // "Ode to Joy", bars 1–2, in C position: E E F G | G F E D, fingers 3 3 4 5 | 5 4 3 2.
  const melody = ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4'];
  const fingers = ['3', '3', '4', '5', '5', '4', '3', '2'];
  const nx = [1880, 1992, 2104, 2216, 2364, 2476, 2588, 2700];
  let notes = '';
  melody.forEach((n, i) => {
    notes += note(nx[i], y0, s, n);
    notes += pen(nx[i], y0 + 5.75 * s, 76, n[0]);
    notes += finger(nx[i], y0 - 0.9 * s, 50, fingers[i]);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${paperDefs('b', 11)}</defs>
  ${paper('b', W, H)}
  ${manuscript(0, W, 70, H - 30, 28, 120)}
  <rect x="430" y="0" width="4" height="${H}" fill="${C.margin}" opacity="0.8"/>
  ${staffLines(xs, xe, y0, s, C.staffInk, 4.5)}
  ${clef(xs + 110, y0, s)}
  ${four(xs + 245, y0, s)}${four(xs + 245, y0 + 2 * s, s)}
  ${notes}
  ${barline(2290, y0, s)}
  ${barline(xe - 34, y0, s, C.ink, true)}
  ${keyboard(560, 215, 740, 580, 7, { lit: ['C4', 'E4', 'G4'] })}
  ${chordBox(2990, 330, 360, 4, 'x32010', ['', '3', '2', '', '1', ''], { name: 'C' })}
  ${pen(930, 900, 64, 'piano', { color: C.inkMuted, weight: 500 })}
  ${pen(3170, 900, 64, 'guitar', { color: C.inkMuted, weight: 500 })}
</svg>`;
}

function logoSvg() {
  const W = 1024;
  const H = 270;
  const wm = wordmark(W / 2, 0, W - 60, { halo: 16 });
  // Centre the ink box vertically: shift the whole group so top/bottom sit inside the canvas.
  const sy = wm.bottom - 22 + wm.drop; // the swash's left end; its underside is ~14px lower
  const dy = (H - (Math.max(wm.bottom, sy + 14) - wm.top)) / 2 - wm.top;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="translate(0 ${f(dy)})">
    ${wm.halo}
    ${swashHalo(wm.x1 + 60, sy, wm.x2 - 40, sy - 12, 14, 12, 14)}
    ${swash(wm.x1 + 60, sy, wm.x2 - 40, sy - 12, 14, 12)}
    ${wm.ink}
  </g>
</svg>`;
}

function iconSvg() {
  const W = 1024;
  const s = 104;
  const y0 = 300;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <defs>${paperDefs('i', 3)}<clipPath id="i-page"><rect x="64" y="64" width="${W - 128}" height="${W - 128}" rx="150"/></clipPath></defs>
  <rect width="${W}" height="${W}" fill="${C.ink}"/>
  <g clip-path="url(#i-page)">${paper('i', W, W)}
    <rect x="170" y="64" width="5" height="${W}" fill="${C.margin}" opacity="0.9"/>
  </g>
  ${staffLines(150, 874, y0, s, C.staffInk, 9)}
  ${clef(330, y0, s)}
  ${beamedPair(600, 'F4', 760, 'A4', y0, s, C.accent)}
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

/** The wordmark's ink box in the chosen typeface, per 1px of font size. */
async function measureWordmark(browser, tmp) {
  const file = join(tmp, 'measure.html');
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}</style></head><body></body></html>`,
  );
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  const m = await page.evaluate(
    async ({ word, pieces, font }) => {
      await document.fonts.load(font);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = font;
      const t = ctx.measureText(word);
      return {
        ascent: t.actualBoundingBoxAscent / 1000,
        descent: t.actualBoundingBoxDescent / 1000,
        pieces: pieces.map((p) => {
          const q = ctx.measureText(p);
          return {
            advance: q.width / 1000,
            left: q.actualBoundingBoxLeft / 1000,
            right: q.actualBoundingBoxRight / 1000,
          };
        }),
      };
    },
    { word: WORD, pieces: PIECES_OF_WORD.map((p) => p.text), font: wordmarkFont(1000) },
  );
  await page.close();
  const ink = layoutWord(m.pieces);
  return { ...ink, ascent: m.ascent, descent: m.descent };
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
        [...FONT_CHECKS, wordmarkFont(40)],
      );
      await page.evaluate(() => document.fonts.ready);
      const missing = await page.evaluate(
        (checks) => checks.filter((c) => !document.fonts.check(c)),
        [...FONT_CHECKS, wordmarkFont(40)],
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
