#!/usr/bin/env node
/**
 * Generates Project Vega's catalog art: the card, banner, logo and icon.
 *
 *   public/images/games/vega.webp          card    1600×2400 (2:3), opaque
 *   public/images/games/banners/vega.webp  banner  3840×1280 (3:1), opaque, text-free
 *   public/images/games/logos/vega.webp    logo    880×360, transparent (the wordmark)
 *   public/images/games/icons/vega.webp    icon    1024×1024, opaque
 *
 * The look is the game's own (docs/game-design-schemes/vega.json): a diagnostic monitor of a specimen slide.
 * Green-black glass with a lab-tile grid and registration marks, a tissue corridor with a mint ECG trace, cold
 * white enamel instruments, and specimens in flesh, bile and bruise tones; on the card, the thing in the jar.
 * Everything is original canvas drawing. The instruments and specimens are drawn by the game's own routines
 * (features/vega/engine/art.ts, transpiled with esbuild and run in the page), so the library art and the board
 * are the same drawings. Fonts: Archivo and IBM Plex Mono from components/shared/game-fonts (SIL OFL).
 *
 * Pipeline: canvas in an HTML page (fonts via file:// URLs) → headless Chromium (Playwright) at 2× → sharp
 * (Lanczos down to the exact size) → WebP. Deterministic: every random choice comes from a seeded PRNG.
 *
 *   node scripts/game-art/vega.mjs                    # all four, into public/
 *   node scripts/game-art/vega.mjs --only card,logo   # a subset
 *   node scripts/game-art/vega.mjs --preview <dir>    # also write PNG previews there
 *   PW_CHROMIUM=/path/to/chrome node scripts/game-art/vega.mjs   # (or --chromium <path>)
 *
 * Then regenerate the image variants: `pnpm images:variants`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GAME_FONTS = join(ROOT, 'components', 'shared', 'game-fonts');
const OUT = join(ROOT, 'public', 'images', 'games');

const fontUrl = (p) => pathToFileURL(join(GAME_FONTS, p)).href;
const FONT_CSS = `
@font-face{font-family:'Archivo';src:url('${fontUrl('Archivo/Archivo-wdth-wght.woff2')}') format('woff2');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:'IBM Plex Mono';src:url('${fontUrl('IBMPlexMono/IBMPlexMono-Medium.woff2')}') format('woff2');font-weight:500}
`;
const FONT_CHECKS = ['900 100px Archivo', '500 40px "IBM Plex Mono"'];

/** The game's drawing routines, as plain JS for the page. */
function artModule() {
  const src = readFileSync(join(ROOT, 'features', 'vega', 'engine', 'art.ts'), 'utf8');
  const js = transformSync(src, { loader: 'ts', format: 'esm' }).code;
  // Expose the exports on window for the painter.
  return `${js.replace(/^export /gm, '')}\nwindow.VegaArt = { P, drawInstrument, drawSpecimen, drawBiohazard, roundRect, SPECIMEN_LOOK };`;
}

/**
 * The painter, run in the page: `paint(kind, W, H)` draws one piece onto the page's canvas. Written as a plain
 * function so it serialises into `page.evaluate`.
 */
function painter(kind, W, H) {
  const A = window.VegaArt;
  const P = A.P;
  const cv = document.getElementById('c');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  let seed = 20261123;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const TAU = Math.PI * 2;

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function grid(step, x0 = 0, y0 = 0, w = W, h = H) {
    ctx.save();
    ctx.fillStyle = P.void;
    ctx.fillRect(x0, y0, w, h);
    for (let y = y0; y < y0 + h; y += step) {
      for (let x = x0; x < x0 + w; x += step) {
        ctx.fillStyle = P.tile;
        ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        ctx.strokeStyle = P.tileLine;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + step * 0.08, y + step * 0.08, step * 0.84, step * 0.84);
      }
    }
    ctx.strokeStyle = P.tick;
    ctx.lineWidth = 2;
    for (let y = y0; y <= y0 + h; y += step)
      for (let x = x0; x <= x0 + w; x += step) {
        line(x - 6, y, x + 6, y);
        line(x, y - 6, x, y + 6);
      }
    ctx.restore();
  }
  function registration(x, y, r) {
    ctx.save();
    ctx.strokeStyle = P.label;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    line(x - r * 1.6, y, x + r * 1.6, y);
    line(x, y - r * 1.6, x, y + r * 1.6);
    ctx.restore();
  }
  function scanlines(alpha = 0.18, step = 4) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.globalAlpha = alpha;
    for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, step / 2);
    ctx.restore();
  }
  function vignette(inner, outer, a) {
    const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, outer);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function ecgY(u) {
    if (u < 0.55) return 0;
    if (u < 0.62) return -0.25 * Math.sin(((u - 0.55) / 0.07) * Math.PI);
    if (u < 0.65) return 0;
    if (u < 0.67) return 0.4;
    if (u < 0.7) return -1;
    if (u < 0.72) return 0.5;
    if (u < 0.8) return 0;
    if (u < 0.92) return -0.35 * Math.sin(((u - 0.8) / 0.12) * Math.PI);
    return 0;
  }
  /** A horizontal ECG trace from x0 to x1 at y, `period` px per beat, `amp` px tall. */
  function ecg(x0, x1, y, period, amp, width, color = P.mint, alpha = 0.9, phase = 0) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) {
      const yy = y + ecgY(((((x - x0 + phase) % period) + period) % period) / period) * amp;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
  }
  /** A tissue corridor along a polyline (cells of size s). */
  function corridor(pts, s) {
    ctx.save();
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = P.tissueEdge;
    ctx.lineWidth = s * 0.86;
    ctx.stroke();
    ctx.strokeStyle = P.tissue;
    ctx.lineWidth = s * 0.74;
    ctx.stroke();
    // Fibres across the channel.
    ctx.strokeStyle = '#24100F';
    ctx.lineWidth = Math.max(1.5, s * 0.025);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (let d = 0; d < len; d += s * 0.15) {
        const k = s * 0.3 * (0.6 + 0.4 * Math.sin(d * 0.37));
        const px = ax + ((bx - ax) * d) / len;
        const py = ay + ((by - ay) * d) / len;
        line(px - nx * k, py - ny * k, px + nx * k, py + ny * k);
      }
      // The trace down the middle.
      ctx.save();
      ctx.strokeStyle = P.mint;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(2, s * 0.03);
      ctx.beginPath();
      for (let d = s * 0.4; d <= len - s * 0.4; d += 2) {
        const off = ecgY((d % (s * 4)) / (s * 4)) * s * 0.3;
        const px = ax + ((bx - ax) * d) / len + nx * off;
        const py = ay + ((by - ay) * d) / len + ny * off;
        if (d === s * 0.4) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  /** A specimen jar: lid, glass, fluid, the curled thing with its eye, and a paper tag. */
  function jar(cx, cy, w, h, opts = {}) {
    const r = w * 0.12;
    ctx.save();
    // Pool of light behind the jar.
    const g = ctx.createRadialGradient(cx, cy, w * 0.1, cx, cy, w * 0.95);
    g.addColorStop(0, 'rgba(62,138,108,0.22)');
    g.addColorStop(1, 'rgba(62,138,108,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w, cy - h, w * 2, h * 2);
    // Glass body.
    const top = cy - h / 2;
    const bot = cy + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, top + h * 0.06);
    ctx.lineTo(cx - w / 2, bot - r);
    ctx.quadraticCurveTo(cx - w / 2, bot, cx - w / 2 + r, bot);
    ctx.lineTo(cx + w / 2 - r, bot);
    ctx.quadraticCurveTo(cx + w / 2, bot, cx + w / 2, bot - r);
    ctx.lineTo(cx + w / 2, top + h * 0.06);
    ctx.closePath();
    ctx.fillStyle = '#05120E';
    ctx.fill();
    // Fluid: a slightly lighter green below the meniscus.
    ctx.save();
    ctx.clip();
    const fl = top + h * 0.16;
    const fg = ctx.createLinearGradient(0, fl, 0, bot);
    fg.addColorStop(0, '#0E2A21');
    fg.addColorStop(1, '#07170F');
    ctx.fillStyle = fg;
    ctx.fillRect(cx - w / 2, fl, w, bot - fl);
    ctx.strokeStyle = P.mintDim;
    ctx.lineWidth = w * 0.006;
    line(cx - w / 2, fl, cx + w / 2, fl);
    // Bubbles and drifting cells.
    for (let i = 0; i < 26; i++) {
      const bx = cx - w * 0.42 + rnd() * w * 0.84;
      const by = fl + rnd() * (bot - fl);
      ctx.strokeStyle = 'rgba(142,240,196,0.25)';
      ctx.lineWidth = w * 0.004;
      ctx.beginPath();
      ctx.arc(bx, by, w * (0.006 + rnd() * 0.012), 0, TAU);
      ctx.stroke();
    }
    for (const [t, fx, fy, sc] of opts.cells || []) {
      A.drawSpecimen(ctx, t, cx + fx * w, cy + fy * h, {
        scale: sc * (w / 900),
        phase: fx * 9,
        still: true,
        revealed: true,
      });
    }
    // The thing in the jar: a curled body ending in a head with one eye.
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#B98A86';
    const s = w / 340;
    ctx.save();
    ctx.translate(cx + w * 0.02, cy + h * 0.06);
    ctx.lineWidth = 34 * s;
    ctx.beginPath();
    ctx.moveTo(30 * s, 170 * s);
    ctx.bezierCurveTo(-90 * s, 160 * s, -105 * s, 40 * s, -32 * s, -14 * s);
    ctx.bezierCurveTo(34 * s, -62 * s, 104 * s, -12 * s, 88 * s, 64 * s);
    ctx.bezierCurveTo(74 * s, 124 * s, 0, 130 * s, -10 * s, 76 * s);
    ctx.stroke();
    ctx.strokeStyle = '#8E5E5B';
    ctx.lineWidth = 3 * s;
    for (let i = 0; i < 14; i++) {
      const a = i * 0.42;
      line(Math.cos(a) * 60 * s, Math.sin(a) * 60 * s + 40 * s, Math.cos(a) * 76 * s, Math.sin(a) * 76 * s + 40 * s);
    }
    ctx.lineWidth = 18 * s;
    ctx.strokeStyle = '#B98A86';
    ctx.beginPath();
    ctx.moveTo(-10 * s, 76 * s);
    ctx.bezierCurveTo(-14 * s, 46 * s, 24 * s, 36 * s, 40 * s, 56 * s);
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#C58B8E';
    ctx.beginPath();
    ctx.arc(-44 * s, -40 * s, 44 * s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#6A2E34';
    ctx.lineWidth = 4 * s;
    ctx.stroke();
    // Eye: white, iris, and a pupil looking out at you.
    ctx.fillStyle = P.white;
    ctx.beginPath();
    ctx.ellipse(-52 * s, -44 * s, 22 * s, 15 * s, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2A0D10';
    ctx.beginPath();
    ctx.arc(-46 * s, -42 * s, 10 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.white;
    ctx.beginPath();
    ctx.arc(-43 * s, -46 * s, 3 * s, 0, TAU);
    ctx.fill();
    // Sutures on the skull.
    ctx.strokeStyle = '#3C1219';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(-44 * s, -40 * s, 34 * s, -2.6, -1.2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = -2.5 + i * 0.25;
      line(
        -44 * s + Math.cos(a) * 28 * s,
        -40 * s + Math.sin(a) * 28 * s,
        -44 * s + Math.cos(a) * 40 * s,
        -40 * s + Math.sin(a) * 40 * s,
      );
    }
    ctx.restore();
    ctx.restore();
    // Glass outline and highlights.
    ctx.strokeStyle = '#2F5D4F';
    ctx.lineWidth = w * 0.01;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, top + h * 0.06);
    ctx.lineTo(cx - w / 2, bot - r);
    ctx.quadraticCurveTo(cx - w / 2, bot, cx - w / 2 + r, bot);
    ctx.lineTo(cx + w / 2 - r, bot);
    ctx.quadraticCurveTo(cx + w / 2, bot, cx + w / 2, bot - r);
    ctx.lineTo(cx + w / 2, top + h * 0.06);
    ctx.stroke();
    ctx.strokeStyle = P.white;
    ctx.globalAlpha = 0.09;
    ctx.lineWidth = w * 0.05;
    line(cx - w * 0.36, top + h * 0.14, cx - w * 0.36, bot - h * 0.1);
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = w * 0.02;
    line(cx + w * 0.38, top + h * 0.2, cx + w * 0.38, bot - h * 0.3);
    ctx.globalAlpha = 1;
    // Lid.
    A.roundRect(ctx, cx - w * 0.56, top - h * 0.02, w * 1.12, h * 0.08, w * 0.02);
    ctx.fillStyle = P.enamel;
    ctx.fill();
    ctx.strokeStyle = P.enamelShade;
    ctx.lineWidth = w * 0.008;
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = P.enamelShade;
      ctx.fillRect(cx - w * 0.5 + i * w * 0.125, top + h * 0.005, w * 0.012, h * 0.045);
    }
    // Paper tag.
    if (opts.tag) {
      const tw = w * 0.46;
      const th = h * 0.1;
      const tx = cx - w * 0.38;
      const ty = bot - h * 0.2;
      ctx.save();
      ctx.translate(tx + tw / 2, ty + th / 2);
      ctx.rotate(-0.03);
      ctx.fillStyle = '#E9EFE9';
      ctx.fillRect(-tw / 2, -th / 2, tw, th);
      ctx.fillStyle = '#0B1613';
      ctx.font = `500 ${th * 0.28}px "IBM Plex Mono"`;
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.tag[0], -tw / 2 + th * 0.25, -th * 0.16);
      ctx.font = `500 ${th * 0.2}px "IBM Plex Mono"`;
      ctx.fillStyle = '#3E5A52';
      ctx.fillText(opts.tag[1], -tw / 2 + th * 0.25, th * 0.24);
      ctx.fillStyle = P.blood;
      ctx.fillRect(tw / 2 - th * 0.5, -th / 2, th * 0.22, th);
      ctx.restore();
    }
  }
  function wordmark(x, y, size, opts = {}) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fontStretch = 'ultra-condensed';
    ctx.font = `800 ${size}px Archivo`;
    const word = 'VEGA';
    const wv = ctx.measureText(word).width;
    const x0 = opts.center ? x - wv / 2 : x;
    if (opts.halo) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(2,5,4,0.92)';
      ctx.lineWidth = size * 0.07;
      ctx.strokeText(word, x0, y);
    }
    // The letters on their own layer, so the scan slit can be cut out of them (and only them).
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const lc = layer.getContext('2d');
    lc.textBaseline = 'alphabetic';
    lc.fontStretch = ctx.fontStretch;
    lc.font = ctx.font;
    lc.fillStyle = P.white;
    lc.fillText(word, x0, y);
    lc.globalCompositeOperation = 'destination-out';
    lc.fillRect(x0 - size * 0.02, y - size * 0.4, wv + size * 0.04, size * 0.035);
    ctx.drawImage(layer, 0, 0);
    // PROJECT above, tracked mono.
    ctx.fontStretch = 'normal';
    ctx.font = `500 ${size * 0.15}px "IBM Plex Mono"`;
    ctx.letterSpacing = `${size * 0.06}px`;
    if (opts.halo) {
      ctx.strokeStyle = 'rgba(2,5,4,0.92)';
      ctx.lineWidth = size * 0.04;
      ctx.strokeText('PROJECT', x0 + size * 0.02, y - size * 0.78);
    }
    ctx.fillStyle = P.mint;
    ctx.fillText('PROJECT', x0 + size * 0.02, y - size * 0.78);
    ctx.letterSpacing = '0px';
    // The ECG underline: flat, one beat, flat.
    const uy = y + size * 0.12;
    if (opts.halo) ecg(x0, x0 + wv, uy, wv, size * 0.26, size * 0.06, 'rgba(2,5,4,0.92)', 1, wv * 0.1);
    ecg(x0, x0 + wv, uy, wv, size * 0.26, size * 0.025, P.mint, 1, wv * 0.1);
    ctx.restore();
    return { x0, w: wv };
  }

  if (kind === 'card') {
    grid(100);
    const g = ctx.createRadialGradient(W / 2, H * 0.6, 100, W / 2, H * 0.6, H * 0.6);
    g.addColorStop(0, 'rgba(2,5,4,0)');
    g.addColorStop(1, 'rgba(2,5,4,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // A corridor under the jar with specimens walking it, and instruments on the benches.
    corridor(
      [
        [-100, 2050],
        [500, 2050],
        [500, 2250],
        [1700, 2250],
      ],
      100,
    );
    const walkers = [
      ['ANXIETY', 80, 2050],
      ['GUILT', 250, 2050],
      ['MANIC', 400, 2050],
      ['DEPRESSION', 500, 2160],
      ['DOUBT', 760, 2250],
      ['ANXIETY', 980, 2250],
      ['DREAD', 1180, 2250],
      ['OBSESSION', 1420, 2250],
    ];
    for (const [t, x, y] of walkers)
      A.drawSpecimen(ctx, t, x, y, {
        scale: 2.4,
        phase: x * 0.01,
        still: true,
        revealed: true,
        shieldFrac: t === 'DOUBT' ? 1 : 0,
        heading: 0,
      });
    A.drawInstrument(ctx, 'LOBOTOMIZER', 350, 2350, 84, { aim: -0.3, tier: 2 });
    A.drawInstrument(ctx, 'SYNAPSE', 700, 2120, 84, { aim: 0.6, tier: 1 });
    A.drawInstrument(ctx, 'CAUTERY', 1050, 2130, 84, { aim: 1.2, tier: 0 });
    A.drawInstrument(ctx, 'DEFIBRILLATOR', 1350, 2350, 84, { aim: -1, tier: 1 });
    // Shots.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.white;
    ctx.lineWidth = 4;
    line(350, 2350, 500, 2160);
    ctx.strokeStyle = P.thermal;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 12;
    line(1070, 2160, 1180, 2250);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.white;
    ctx.lineWidth = 3;
    line(1070, 2160, 1180, 2250);
    ctx.strokeStyle = P.electric;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1350, 2350);
    ctx.lineTo(1380, 2300);
    ctx.lineTo(1400, 2290);
    ctx.lineTo(1420, 2250);
    ctx.stroke();
    ctx.restore();
    // The ECG crossing behind the jar.
    ecg(0, W, 1250, 520, 260, 7, P.mint, 0.55, 60);
    jar(W / 2, 1330, 860, 1110, {
      tag: ['SPECIMEN 07', 'VEGA / RECURSION'],
      cells: [
        ['ANXIETY', -0.32, 0.3, 2.2],
        ['FRAGMENT', 0.3, -0.12, 2.4],
        ['ANXIETY', 0.33, 0.33, 1.8],
      ],
    });
    // Title block.
    wordmark(W / 2, 520, 460, { center: true });
    ctx.save();
    ctx.font = '500 34px "IBM Plex Mono"';
    ctx.fillStyle = P.label;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('CASE FILE 07  ·  CONTAINMENT PROTOCOL', W / 2, 660);
    ctx.restore();
    for (const [x, y] of [
      [90, 90],
      [W - 90, 90],
      [90, H - 90],
      [W - 90, H - 90],
    ])
      registration(x, y, 26);
    scanlines(0.2, 5);
    vignette(H * 0.3, H * 0.75, 0.5);
  }

  if (kind === 'banner') {
    grid(160);
    // The corridor snakes across, specimens along it, instruments firing.
    const s = 160;
    const path = [
      [-200, 400],
      [880, 400],
      [880, 880],
      [1840, 880],
      [1840, 240],
      [2720, 240],
      [2720, 720],
      [4100, 720],
    ];
    corridor(path, s);
    const along = (d) => {
      let rest = d;
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = path[i - 1];
        const [bx, by] = path[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (rest <= len)
          return [ax + ((bx - ax) * rest) / len, ay + ((by - ay) * rest) / len, Math.atan2(by - ay, bx - ax)];
        rest -= len;
      }
      return path[path.length - 1];
    };
    const kinds = [
      'ANXIETY',
      'ANXIETY',
      'GUILT',
      'MANIC',
      'DOUBT',
      'ANXIETY',
      'DEPRESSION',
      'OBSESSION',
      'FRAGMENT',
      'FRAGMENT',
      'DREAD',
      'PARANOIA',
      'MANIC',
      'DEPRESSION',
      'ANXIETY',
    ];
    const at = kinds.map((t, i) => {
      const [x, y, h] = along(220 + i * 280 + rnd() * 60);
      return { t, x, y, h, i };
    });
    const [bx, by] = along(4470);
    // Fields under the instruments.
    ctx.save();
    ctx.fillStyle = P.sedative;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(720, 560, 290, 0, TAU);
    ctx.fill();
    ctx.restore();
    const towers = [
      ['SYNAPSE', 1040, 560],
      ['SUPPRESSOR', 720, 560],
      ['CAUTERY', 1360, 720],
      ['CENTRIFUGE', 1680, 560],
      ['ECHO', 1520, 560],
      ['DEFIBRILLATOR', 2000, 560],
      ['LOBOTOMIZER', 2240, 560],
      ['SYNAPSE', 2560, 400],
      ['BIOBANK', 400, 720],
    ];
    // Each instrument aims at the nearest specimen; the shots are drawn to it.
    const shots = [];
    for (const [t, x, y] of towers) {
      let best = at[0];
      let bd = Infinity;
      for (const e of at) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (t === 'LOBOTOMIZER') best = { x: bx, y: by };
      shots.push([t, x, y, best]);
      A.drawInstrument(ctx, t, x, y, 130, { aim: Math.atan2(best.y - y, best.x - x), tier: 1 + (((x / 160) % 2) | 0) });
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (const [t, x, y, e] of shots) {
      const a = Math.atan2(e.y - y, e.x - x);
      const tx = x + Math.cos(a) * 60;
      const ty = y + Math.sin(a) * 60;
      if (t === 'CAUTERY') {
        ctx.strokeStyle = P.thermal;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 18;
        line(tx, ty, e.x, e.y);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 4;
        line(tx, ty, e.x, e.y);
      } else if (t === 'DEFIBRILLATOR') {
        ctx.strokeStyle = P.electric;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo((tx + e.x) / 2 + 24, (ty + e.y) / 2 - 18);
        ctx.lineTo(e.x, e.y);
        const next = at
          .filter((o) => o !== e)
          .sort((p, q) => Math.hypot(p.x - e.x, p.y - e.y) - Math.hypot(q.x - e.x, q.y - e.y))[0];
        ctx.lineTo((e.x + next.x) / 2 - 20, (e.y + next.y) / 2 + 14);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      } else if (t === 'LOBOTOMIZER') {
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 6;
        line(tx, ty, e.x, e.y);
      } else if (t === 'SYNAPSE') {
        ctx.strokeStyle = P.mint;
        ctx.lineWidth = 4;
        line(tx, ty, e.x, e.y);
      }
    }
    ctx.restore();
    for (const e of at) {
      A.drawSpecimen(ctx, e.t, e.x, e.y, {
        scale: 3.4,
        phase: e.i * 1.7,
        heading: e.h,
        still: true,
        revealed: e.t !== 'PARANOIA',
        cloaked: e.t === 'PARANOIA',
        shieldFrac: e.t === 'DOUBT' ? 0.8 : 0,
      });
    }
    A.drawSpecimen(ctx, 'PATIENT', bx, by, { scale: 3.2, phase: 1, still: true });
    // The jar at the right, larger than life.
    jar(3330, 640, 760, 1020, {
      cells: [
        ['ANXIETY', -0.3, 0.32, 2],
        ['FRAGMENT', 0.3, -0.05, 2.2],
      ],
    });
    // Exit door.
    A.drawBiohazard(ctx, 3760, 1160, 50, P.blood);
    for (const [x, y] of [
      [70, 70],
      [W - 70, 70],
      [70, H - 70],
      [W - 70, H - 70],
    ])
      registration(x, y, 22);
    scanlines(0.2, 5);
    vignette(H * 0.4, W * 0.62, 0.62);
  }

  if (kind === 'logo') {
    ctx.clearRect(0, 0, W, H);
    wordmark(34, 258, 268, { halo: true });
  }

  if (kind === 'icon') {
    ctx.fillStyle = P.void;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    A.roundRect(ctx, 40, 40, W - 80, H - 80, 150);
    ctx.clip();
    grid(128, 40, 40, W - 80, H - 80);
    ecg(40, W - 40, 560, 600, 200, 10, P.mint, 0.6, 40);
    jar(W / 2, 560, 560, 760, {});
    scanlines(0.18, 6);
    ctx.restore();
    ctx.strokeStyle = '#2F5D4F';
    ctx.lineWidth = 8;
    A.roundRect(ctx, 40, 40, W - 80, H - 80, 150);
    ctx.stroke();
  }
}

const PIECES = {
  card: { w: 1600, h: 2400, out: 'vega.webp', alpha: false, q: 86 },
  banner: { w: 3840, h: 1280, out: 'banners/vega.webp', alpha: false, q: 82 },
  logo: { w: 880, h: 360, out: 'logos/vega.webp', alpha: true, q: 90 },
  icon: { w: 1024, h: 1024, out: 'icons/vega.webp', alpha: false, q: 88 },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const only = arg('--only')?.split(',') ?? Object.keys(PIECES);
  const preview = arg('--preview');
  if (preview) mkdirSync(preview, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'vega-art-'));
  const executablePath = arg('--chromium') || process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const art = artModule();
  try {
    for (const key of only) {
      const p = PIECES[key];
      if (!p) throw new Error(`unknown piece: ${key}`);
      const file = join(tmp, `${key}.html`);
      writeFileSync(
        file,
        `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
        html,body{margin:0;padding:0;background:${p.alpha ? 'transparent' : '#020504'}}canvas{display:block;width:${p.w}px;height:${p.h}px}</style></head>
        <body><canvas id="c"></canvas><script>${art}</script></body></html>`,
      );
      const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(file).href);
      await page.evaluate((checks) => Promise.all(checks.map((c) => document.fonts.load(c))), FONT_CHECKS);
      const missing = await page.evaluate((checks) => checks.filter((c) => !document.fonts.check(c)), FONT_CHECKS);
      if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
      // Paint at 2x into the canvas backing store, then let CSS show it at 1x for the screenshot at 2x DPR.
      await page.evaluate(
        ({ src, kind, w, h }) => {
          const paint = new Function(`return (${src})`)();
          paint(kind, w, h);
        },
        { src: painter.toString(), kind: key, w: p.w, h: p.h },
      );
      const png = await page.screenshot({ omitBackground: p.alpha, fullPage: false });
      await page.close();
      const out = join(OUT, p.out);
      let img = sharp(png).resize(p.w, p.h, { kernel: 'lanczos3' });
      if (!p.alpha) img = img.flatten({ background: '#020504' }).removeAlpha();
      await img.clone().webp({ quality: p.q, effort: 6, alphaQuality: 100 }).toFile(out);
      if (preview)
        await img
          .clone()
          .png()
          .toFile(join(preview, `${key}.png`));
      process.stdout.write(`${key}: ${p.w}×${p.h} → ${out} (${Math.round(statSync(out).size / 1024)} KB)\n`);
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
