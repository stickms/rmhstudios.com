/**
 * Generates the PWA manifest `screenshots` used by the richer install prompt
 * (Chrome/Edge/Android). We can't capture the live app here, so these are clean,
 * on-brand stylized mocks — a wide desktop layout and a narrow phone layout —
 * rendered to PNG with zero dependencies (pure Node + zlib), so the build never
 * needs a headless browser or image library to reproduce them.
 *
 *   node scripts/gen-pwa-screenshots.mjs
 *
 * Writes:
 *   public/images/screenshots/feed-wide.png    (1280x720, form_factor "wide")
 *   public/images/screenshots/games-narrow.png (720x1280, form_factor "narrow")
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/images/screenshots');

// ---- tiny RGBA canvas -----------------------------------------------------

function createCanvas(w, h) {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

function blend(c, x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const ia = 1 - a;
  c.data[i] = r * a + c.data[i] * ia;
  c.data[i + 1] = g * a + c.data[i + 1] * ia;
  c.data[i + 2] = b * a + c.data[i + 2] * ia;
  c.data[i + 3] = 255;
}

function verticalGradient(c, top, bottom) {
  for (let y = 0; y < c.h; y++) {
    const t = y / (c.h - 1);
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = 0; x < c.w; x++) blend(c, x, y, r, g, b, 1);
  }
}

// Soft radial glow (accent bloom) centered at cx,cy.
function glow(c, cx, cy, radius, color, strength) {
  const r0 = Math.max(1, Math.floor(cx - radius));
  const r1 = Math.min(c.w, Math.ceil(cx + radius));
  const c0 = Math.max(1, Math.floor(cy - radius));
  const c1 = Math.min(c.h, Math.ceil(cy + radius));
  for (let y = c0; y < c1; y++) {
    for (let x = r0; x < r1; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d) * strength;
      blend(c, x, y, color[0], color[1], color[2], a);
    }
  }
}

function roundRect(c, x, y, w, h, radius, color, alpha = 1) {
  const rad = Math.min(radius, w / 2, h / 2);
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const dx = px < x + rad ? x + rad - px : px > x + w - rad - 1 ? px - (x + w - rad - 1) : 0;
      const dy = py < y + rad ? y + rad - py : py > y + h - rad - 1 ? py - (y + h - rad - 1) : 0;
      if (dx > 0 && dy > 0 && Math.hypot(dx, dy) > rad) continue;
      blend(c, px, py, color[0], color[1], color[2], alpha);
    }
  }
}

function circle(c, cx, cy, r, color, alpha = 1) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) blend(c, x, y, color[0], color[1], color[2], alpha);
    }
  }
}

// ---- palette --------------------------------------------------------------

const BG_TOP = [11, 13, 18];
const BG_BOT = [16, 18, 27];
const RAIL = [20, 22, 32];
const CARD = [24, 26, 38];
const LINE = [46, 50, 68];
const LINE_DIM = [34, 37, 52];
const ACCENT = [124, 92, 255];
const ACCENT_2 = [86, 133, 255];

// ---- layouts --------------------------------------------------------------

function drawWide() {
  const c = createCanvas(1280, 720);
  verticalGradient(c, BG_TOP, BG_BOT);
  glow(c, 250, 120, 520, ACCENT, 0.16);
  glow(c, 1120, 640, 560, ACCENT_2, 0.12);

  // Left nav rail with accented "logo" tile + nav dashes.
  roundRect(c, 40, 40, 190, 640, 24, RAIL, 0.9);
  roundRect(c, 68, 74, 40, 40, 12, ACCENT, 1);
  for (let i = 0; i < 6; i++) {
    const yy = 150 + i * 46;
    circle(c, 88, yy + 8, 8, i === 0 ? ACCENT : LINE, i === 0 ? 1 : 0.9);
    roundRect(c, 108, yy, i === 0 ? 96 : 80, 12, 6, i === 0 ? ACCENT : LINE, i === 0 ? 0.9 : 0.8);
  }

  // Center feed column of cards.
  const colX = 270;
  const colW = 620;
  for (let i = 0; i < 3; i++) {
    const y = 56 + i * 214;
    roundRect(c, colX, y, colW, 190, 22, CARD, 0.96);
    circle(c, colX + 42, y + 44, 22, i === 0 ? ACCENT : ACCENT_2, 0.9);
    roundRect(c, colX + 78, y + 30, 150, 12, 6, LINE, 1);
    roundRect(c, colX + 78, y + 50, 90, 10, 5, LINE_DIM, 1);
    roundRect(c, colX + 30, y + 92, colW - 60, 11, 5, LINE, 0.9);
    roundRect(c, colX + 30, y + 112, colW - 120, 11, 5, LINE_DIM, 0.9);
    // little action row
    for (let a = 0; a < 3; a++) roundRect(c, colX + 30 + a * 70, y + 146, 44, 12, 6, LINE_DIM, 0.8);
  }

  // Right sidebar: games/apps tiles grid.
  const sx = 920;
  roundRect(c, sx, 56, 320, 260, 22, CARD, 0.96);
  roundRect(c, sx + 24, 80, 120, 12, 6, LINE, 1);
  for (let r = 0; r < 2; r++)
    for (let col = 0; col < 3; col++) {
      const gx = sx + 24 + col * 96;
      const gy = 112 + r * 88;
      roundRect(c, gx, gy, 80, 68, 14, r + col === 0 ? ACCENT : LINE_DIM, r + col === 0 ? 0.85 : 1);
    }
  roundRect(c, sx, 340, 320, 324, 22, CARD, 0.96);
  roundRect(c, sx + 24, 366, 140, 12, 6, LINE, 1);
  for (let i = 0; i < 4; i++) {
    const yy = 402 + i * 62;
    circle(c, sx + 44, yy + 14, 16, ACCENT_2, 0.8);
    roundRect(c, sx + 72, yy + 4, 150, 11, 5, LINE, 1);
    roundRect(c, sx + 72, yy + 22, 90, 9, 4, LINE_DIM, 1);
  }
  return c;
}

function drawNarrow() {
  const c = createCanvas(720, 1280);
  verticalGradient(c, BG_TOP, BG_BOT);
  glow(c, 140, 160, 460, ACCENT, 0.18);
  glow(c, 620, 1120, 520, ACCENT_2, 0.14);

  // Top bar with logo tile.
  roundRect(c, 40, 48, 44, 44, 12, ACCENT, 1);
  roundRect(c, 100, 60, 160, 16, 8, LINE, 1);
  circle(c, 660, 70, 22, CARD, 1);

  // Hero "featured game" banner.
  roundRect(c, 40, 120, 640, 220, 26, CARD, 0.96);
  glow(c, 200, 230, 260, ACCENT, 0.22);
  roundRect(c, 72, 250, 200, 18, 9, LINE, 1);
  roundRect(c, 72, 282, 320, 14, 7, LINE_DIM, 1);
  roundRect(c, 72, 312, 120, 34, 17, ACCENT, 0.9);

  // Grid of game tiles.
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 3; col++) {
      const gx = 40 + col * 220;
      const gy = 372 + r * 232;
      roundRect(c, gx, gy, 200, 200, 22, CARD, 0.96);
      roundRect(c, gx + 20, gy + 20, 160, 110, 14, r + col === 0 ? ACCENT : LINE_DIM, r + col === 0 ? 0.85 : 1);
      roundRect(c, gx + 20, gy + 146, 120, 12, 6, LINE, 1);
      roundRect(c, gx + 20, gy + 166, 80, 10, 5, LINE_DIM, 1);
    }

  // Bottom tab bar.
  roundRect(c, 24, 1180, 672, 76, 26, RAIL, 0.96);
  for (let i = 0; i < 5; i++) {
    const cx = 96 + i * 132;
    circle(c, cx, 1218, 12, i === 0 ? ACCENT : LINE, i === 0 ? 1 : 0.85);
  }
  return c;
}

// ---- PNG encoder (RGBA, filter 0) ----------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(canvas) {
  const { w, h, data } = canvas;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- run ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'feed-wide.png'), encodePng(drawWide()));
writeFileSync(resolve(OUT_DIR, 'games-narrow.png'), encodePng(drawNarrow()));
console.log('Wrote feed-wide.png (1280x720) and games-narrow.png (720x1280) to', OUT_DIR);
