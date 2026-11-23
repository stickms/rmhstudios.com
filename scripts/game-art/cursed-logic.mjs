#!/usr/bin/env node
/**
 * Generates Cursed Logic's catalog art: the card, banner, logo and icon.
 *
 *   public/images/games/cursed-logic.webp          card    1600×2400 (2:3), opaque
 *   public/images/games/banners/cursed-logic.webp  banner  1920×620, opaque, text-free (the logo sits over it)
 *   public/images/games/logos/cursed-logic.webp    logo    1024 wide, transparent (the wordmark)
 *   public/images/games/icons/cursed-logic.webp    icon    1024×1024, opaque
 *
 * The look is the game's own (docs/game-design-schemes/cursed-logic.json): a corrupted terminal. The Protocols'
 * pixel masks (the same strings as features/cursed-logic/ui/portraits.tsx) sit on the nodes of a seven-point
 * logic-gate sigil, NULL//ROOT at the centre; frozen columns of cursed glyphs run down the edges; scanlines and a
 * few horizontal tears knock slices of the picture sideways; the wordmark is Silkscreen pixel caps split by the same
 * tear with violet and acid ghosts. Everything is original vector artwork drawn here; the only third-party inputs
 * are the OFL fonts Silkscreen and IBM Plex Mono from components/shared/game-fonts/. See docs/game-art-credits.md.
 *
 * Pipeline: SVG → an HTML page in a temp dir (fonts via file:// URL) → headless Chromium (Playwright) at 2× →
 * sharp (Lanczos down to the exact size) → WebP. Deterministic: the glyph columns come from a seeded PRNG.
 *
 *   node scripts/game-art/cursed-logic.mjs                   # all four, into public/
 *   node scripts/game-art/cursed-logic.mjs --only card,logo  # a subset
 *   node scripts/game-art/cursed-logic.mjs --preview <dir>   # also write PNG previews there
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
const GAME_FONTS = join(ROOT, 'components', 'shared', 'game-fonts');
const OUT = join(ROOT, 'public', 'images', 'games');

const C = {
  bg: '#06040a',
  bgAlt: '#0f0a18',
  deep: '#3b2a5c',
  acid: '#b6ff3c',
  violet: '#a970ff',
  ink: '#e8ffd2',
  danger: '#ff4f6e',
};

const FONT_CSS = `
@font-face{font-family:'Silkscreen';src:url('${pathToFileURL(join(GAME_FONTS, 'Silkscreen', 'Silkscreen-Bold.woff2')).href}') format('woff2');font-weight:700}
@font-face{font-family:'IBM Plex Mono';src:url('${pathToFileURL(join(GAME_FONTS, 'IBMPlexMono', 'IBMPlexMono-Medium.woff2')).href}') format('woff2');font-weight:500}`;
const FONT_CHECKS = ["700 40px 'Silkscreen'", "500 20px 'IBM Plex Mono'"];

// ── The masks (copied from features/cursed-logic/ui/portraits.tsx) ──────────────────────────────────────────────
const INK = { a: C.acid, v: C.violet, w: C.ink, d: C.deep, r: C.danger, k: C.bg };
const MASKS = {
  warden: ['................', '.....dddddd.....', '...ddaaaaaadd...', '..daawwwwwwaad..', '..daw......wad..', '.daawaaaaaawaad.', '.daw.a.aa.a.wad.', '.daw.a.aa.a.wad.', '.daawaaaaaawaad.', '.daw........wad.', '..daw.wwww.wad..', '..daaw....waad..', '...daawwwwaad...', '....ddaaaadd....', '......dddd......', '................'],
  mimic: ['................', '.....aaavvv.....', '...aaaaavvvvv...', '..aa........vv..', '.aa..........vv.', '.a..ww....ww..v.', '.a.wkkw..wkkw.v.', '.a.wkkw..wkkw.v.', '.a..ww....ww..v.', '.a............v.', '.a..a......v..v.', '.aa..aaavvv..vv.', '..aa........vv..', '...aaaaavvvvv...', '.....aaavvv.....', '................'],
  berserk: ['.r............r.', '.rr..........rr.', '..rr.rrrrrr.rr..', '..rrrrrrrrrrrr..', '.rr..........rr.', '.r..r......r..r.', '.r..rrw..wrr..r.', '.r...rr..rr...r.', '.r............r.', '.r.wwwwwwwwww.r.', '.r.w.w.ww.w.w.r.', '.r.wwwwwwwwww.r.', '.rr..........rr.', '..rr..rrrr..rr..', '...rrrr..rrrr...', '................'],
  liar: ['................', '....aaaavvvv....', '..aaa......vvv..', '.aa..........vv.', '.a............v.', '.a..ww...vvvv.v.', '.a.wkkw.......v.', '.a..ww...vvvv.v.', '.a............v.', '.a.a........v.v.', '.a..aaa..vvv..v.', '.a....rrrr....v.', '.aa....rr....vv.', '..aaa.r..r.vvv..', '....aaaavvvv....', '................'],
  leech: ['................', '....vvvvvvvv....', '..vvddddddddvv..', '.vvd........dvv.', '.vd..aa..aa..dv.', '.vd..aa..aa..dv.', '.vd..........dv.', '.vd...wwwww..dv.', '.vd..w.r.r.w.dv.', '.vd...wwwww..dv.', '.vvd........dvv.', '..vvdd.dd.ddvv..', '..v.v.v..v.v.v..', '.v..v..v..v..v..', 'v...v...v...v..v', '................'],
  oracle: ['................', '......aaaa......', '....aa.ww.aa....', '...a..wkkw..a...', '..a....ww....a..', '..a.ww....ww.a..', '.a.wkkw..wkkw.a.', '.a..ww....ww..a.', '.a.....ww.....a.', '.a....wkkw....a.', '..a....ww....a..', '..a.ww....ww.a..', '...awkkw.wkkwa..', '....aww...wwa...', '......aaaa......', '................'],
  nullroot: ['.a...v....v...a.', '.aa.vvv..vvv.aa.', '.aaavvvvvvvvaaa.', '.wwwwwwwwwwwwww.', '.w............w.', '.w.rrr....rrr.w.', '.w.rkr....rkr.w.', '.w.rrr....rrr.w.', '.w.....wr.....w.', '.w......r.....w.', '.w.vvvvv.vvvv.w.', '.w.v.v.v.v.v..w.', '.ww..........ww.', '..www.w..w.www..', '....ww....ww....', '................'],
};

/** A mask as SVG cells at (x, y), `cell` px per pixel, with a violet ghost knocked left and scanlines over it. */
function mask(id, x, y, cell, { ghost = true, scan = true } = {}) {
  const rows = MASKS[id];
  let out = '';
  const draw = (fillFor, dx, op) => {
    let g = `<g opacity="${op}">`;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.') continue;
        g += `<rect x="${x + rx * cell + dx}" y="${y + ry * cell}" width="${cell}" height="${cell}" fill="${fillFor(ch)}"/>`;
      }
    });
    return `${g}</g>`;
  };
  if (ghost) out += draw(() => C.violet, -cell * 0.45, 0.55);
  out += draw((ch) => INK[ch], 0, 1);
  if (scan) {
    for (let i = 0; i < 16; i += 2) {
      out += `<rect x="${x}" y="${y + (i + 1.55) * cell}" width="${16 * cell}" height="${cell * 0.18}" fill="${C.bg}" opacity="0.6"/>`;
    }
  }
  return out;
}

// ── Seeded glyph columns ────────────────────────────────────────────────────────────────────────────────────────
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const GLYPHS = '01#%&/<>[]{}=+*§¥∆ΣΞΨ01∧∨¬⊕→↔⊥'.split('');
function glyphRain(x0, x1, top, bottom, size, seed, opacity = 0.22) {
  const r = prng(seed);
  let out = `<g font-family="IBM Plex Mono" font-weight="500" font-size="${size}">`;
  for (let x = x0; x < x1; x += size * 1.1) {
    const len = Math.floor(((bottom - top) / (size * 1.25)) * (0.35 + r() * 0.65));
    const start = top + r() * (bottom - top) * 0.4;
    for (let i = 0; i < len; i++) {
      const y = start + i * size * 1.25;
      if (y > bottom) break;
      const head = i === len - 1;
      const fill = head ? C.ink : r() < 0.15 ? C.violet : C.acid;
      const op = head ? Math.min(1, opacity * 3) : opacity * (0.3 + (i / len) * 0.9);
      out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" opacity="${op.toFixed(2)}">${GLYPHS[Math.floor(r() * GLYPHS.length)]}</text>`;
    }
  }
  return `${out}</g>`;
}

/** Orthogonal circuit traces with nodes, deep violet. */
function circuitry(w, h, seed, count) {
  const r = prng(seed);
  let out = `<g fill="none" stroke="${C.deep}" stroke-width="3">`;
  for (let i = 0; i < count; i++) {
    let x = Math.round((r() * w) / 40) * 40;
    let y = Math.round((r() * h) / 40) * 40;
    let d = `M${x} ${y}`;
    for (let s = 0; s < 4; s++) {
      if (s % 2 === 0) x += (r() < 0.5 ? -1 : 1) * Math.round(2 + r() * 6) * 40;
      else y += (r() < 0.5 ? -1 : 1) * Math.round(2 + r() * 6) * 40;
      d += ` L${x} ${y}`;
    }
    out += `<path d="${d}"/><rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="${C.bg}" stroke="${r() < 0.3 ? C.violet : C.deep}"/>`;
  }
  return `${out}</g>`;
}

/** The seven-node logic sigil: ring, glyph band, heptagram, gate nodes. Returns the node centres too. */
function sigil(cx, cy, R, stroke = C.acid) {
  const nodes = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  });
  const star = Array.from({ length: 7 }, (_, i) => nodes[(i * 3) % 7].join(',')).join(' ');
  const gates = ['∧', '∨', '¬', '⊕', '→', '↔', '⊥'];
  let out = `<g fill="none">`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R * 1.1}" stroke="${stroke}" stroke-width="${R * 0.008}" opacity="0.7"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R * 1.0}" stroke="${C.violet}" stroke-width="${R * 0.004}" stroke-dasharray="${R * 0.02} ${R * 0.03}" opacity="0.8"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R * 0.62}" stroke="${stroke}" stroke-width="${R * 0.005}" opacity="0.5"/>`;
  out += `<polygon points="${star}" stroke="${stroke}" stroke-width="${R * 0.007}" opacity="0.55"/>`;
  const band = R * 1.2;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = cx + Math.cos(a) * band;
    const y = cy + Math.sin(a) * band;
    out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="IBM Plex Mono" font-size="${R * 0.07}" fill="${C.violet}" opacity="0.7" text-anchor="middle" transform="rotate(${((i / 48) * 360 + 90).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${GLYPHS[(i * 7) % GLYPHS.length]}</text>`;
  }
  out += '</g>';
  return { svg: out, nodes, gates };
}

function scanlines(w, h, step = 6, op = 0.28) {
  return `<defs><pattern id="scan" width="4" height="${step}" patternUnits="userSpaceOnUse"><rect width="4" height="${step / 3}" fill="#000" opacity="${op}"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#scan)"/>`;
}

/** Horizontal tears: slices of the finished picture (by <use>) knocked sideways. */
function tears(w, slices) {
  return slices
    .map(
      ([y, h, dx], i) => `<clipPath id="tear${i}"><rect x="0" y="${y}" width="${w}" height="${h}"/></clipPath>
      <use href="#scene" clip-path="url(#tear${i})" transform="translate(${dx} 0)"/>
      <rect x="0" y="${y}" width="${w}" height="2" fill="${C.acid}" opacity="0.5"/>`,
    )
    .join('');
}

function ground(w, h) {
  return `<defs><radialGradient id="wash" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#1d0f33"/><stop offset="0.6" stop-color="${C.bg}"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="${C.bg}"/><rect width="${w}" height="${h}" fill="url(#wash)"/>`;
}

/** The wordmark, centred on (cx, baseline), `size` px: three ghost layers, the lower half torn right. */
function wordmark(cx, base, size, word = 'CURSED//LOGIC', tearDx = size * 0.13) {
  const t = (fill, dx) =>
    `<text x="${cx + dx}" y="${base}" text-anchor="middle" font-family="Silkscreen" font-weight="700" font-size="${size}" letter-spacing="${size * 0.04}" fill="${fill}">${word}</text>`;
  const id = `wm${Math.round(base)}`;
  const split = base - size * 0.36;
  return `<clipPath id="${id}a"><rect x="-9999" y="-9999" width="99999" height="${9999 + split}"/></clipPath>
  <clipPath id="${id}b"><rect x="-9999" y="${split}" width="99999" height="99999"/></clipPath>
  <g clip-path="url(#${id}a)">${t(C.violet, -size * 0.06)}${t(C.acid, size * 0.04)}${t(C.ink, 0)}</g>
  <g clip-path="url(#${id}b)" transform="translate(${tearDx} 0)">${t(C.violet, -size * 0.06)}${t(C.ink, 0)}</g>
  <rect x="${cx - size * 4.3}" y="${split - 1}" width="${size * 8.6}" height="${Math.max(2, size * 0.03)}" fill="${C.acid}" opacity="0.75"/>`;
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────
function cardSvg() {
  const W = 1600;
  const H = 2400;
  const cx = W / 2;
  const cy = 1000;
  const R = 560;
  const sg = sigil(cx, cy, R);
  const ring = ['warden', 'mimic', 'berserk', 'liar', 'leech', 'oracle', 'warden'];
  const scene = `
    ${ground(W, H)}
    ${circuitry(W, H, 7, 26)}
    ${glyphRain(30, 250, 0, H, 34, 11)}
    ${glyphRain(W - 250, W - 30, 0, H, 34, 12)}
    ${sg.svg}
    ${sg.nodes
      .slice(0, 6)
      .map(([x, y], i) => `<rect x="${x - 95}" y="${y - 95}" width="190" height="190" fill="${C.bg}" stroke="${C.violet}" stroke-width="4" transform="rotate(45 ${x} ${y})"/>${mask(ring[i], x - 64, y - 64, 8)}`)
      .join('')}
    ${(() => {
      const [x, y] = sg.nodes[6];
      return `<rect x="${x - 70}" y="${y - 70}" width="140" height="140" fill="${C.bg}" stroke="${C.acid}" stroke-width="4" transform="rotate(45 ${x} ${y})"/><text x="${x}" y="${y + 26}" font-family="Silkscreen" font-size="76" fill="${C.acid}" text-anchor="middle">⊥</text>`;
    })()}
    ${mask('nullroot', cx - 320, cy - 330, 40)}
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><g id="scene">${scene}</g></defs>
  <use href="#scene"/>
  ${tears(W, [
    [650, 26, 34],
    [1180, 14, -46],
    [1560, 40, 22],
  ])}
  <g font-family="IBM Plex Mono" font-weight="500" font-size="34">
    <rect x="70" y="70" width="${W - 140}" height="70" fill="${C.bgAlt}" stroke="${C.deep}" stroke-width="3"/>
    <text x="100" y="117" fill="${C.acid}">root@protocol:~$</text>
    <text x="440" y="117" fill="${C.ink}">./duel --cursed</text>
    <rect x="770" y="90" width="20" height="34" fill="${C.acid}"/>
  </g>
  ${wordmark(cx, 1880, 196, 'CURSED')}
  ${wordmark(cx, 2110, 196, '//LOGIC')}
  <g font-family="IBM Plex Mono" font-weight="500" font-size="36" text-anchor="middle">
    <text x="${cx}" y="2250" fill="${C.violet}">&gt; tells may be lies</text>
  </g>
  ${scanlines(W, H, 6)}
</svg>`;
}

function bannerSvg() {
  const W = 1920;
  const H = 620;
  const cx = 1130;
  const cy = 330;
  const R = 230;
  const sg = sigil(cx, cy, R);
  const ring = ['warden', 'mimic', 'berserk', 'liar', 'leech', 'oracle', 'warden'];
  const scene = `
    ${ground(W, H)}
    ${circuitry(W, H, 21, 22)}
    ${glyphRain(0, 640, 0, H, 22, 31, 0.16)}
    ${glyphRain(1480, W, 0, H, 22, 32, 0.2)}
    ${sg.svg}
    ${sg.nodes
      .slice(0, 6)
      .map(([x, y], i) => `<rect x="${x - 40}" y="${y - 40}" width="80" height="80" fill="${C.bg}" stroke="${C.violet}" stroke-width="2" transform="rotate(45 ${x} ${y})"/>${mask(ring[i], x - 28, y - 28, 3.5)}`)
      .join('')}
    ${(() => {
      const [x, y] = sg.nodes[6];
      return `<rect x="${x - 30}" y="${y - 30}" width="60" height="60" fill="${C.bg}" stroke="${C.acid}" stroke-width="2" transform="rotate(45 ${x} ${y})"/><text x="${x}" y="${y + 12}" font-family="Silkscreen" font-size="34" fill="${C.acid}" text-anchor="middle">⊥</text>`;
    })()}
    ${mask('nullroot', cx - 136, cy - 140, 17)}
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><g id="scene">${scene}</g></defs>
  <use href="#scene"/>
  ${tears(W, [
    [180, 12, 26],
    [402, 20, -34],
  ])}
  ${scanlines(W, H, 5)}
</svg>`;
}

function logoSvg() {
  const W = 1024;
  const H = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${wordmark(W / 2 - 10, 104, 86, "CURSED//LOGIC", 9)}
</svg>`;
}

function iconSvg() {
  const S = 1024;
  const sg = sigil(S / 2, S / 2, 380);
  const scene = `${ground(S, S)}${circuitry(S, S, 41, 10)}${sg.svg}${mask('nullroot', S / 2 - 288, S / 2 - 300, 36)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><g id="scene">${scene}</g></defs><use href="#scene"/>
  ${tears(S, [[600, 18, 24]])}
  ${scanlines(S, S, 6)}
</svg>`;
}

const PIECES = {
  card: { svg: cardSvg, w: 1600, h: 2400, out: 'cursed-logic.webp', alpha: false, q: 84 },
  banner: { svg: bannerSvg, w: 1920, h: 620, out: 'banners/cursed-logic.webp', alpha: false, q: 82 },
  logo: { svg: logoSvg, w: 1024, h: 150, out: 'logos/cursed-logic.webp', alpha: true, q: 90 },
  icon: { svg: iconSvg, w: 1024, h: 1024, out: 'icons/cursed-logic.webp', alpha: false, q: 86 },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const only = arg('--only')?.split(',') ?? Object.keys(PIECES);
  const preview = arg('--preview');
  if (preview) mkdirSync(preview, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'cursed-logic-art-'));
  const executablePath = arg('--chromium') || process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const key of only) {
      const p = PIECES[key];
      if (!p) throw new Error(`unknown piece: ${key}`);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
        html,body{margin:0;padding:0;background:${p.alpha ? 'transparent' : C.bg}}svg{display:block}</style></head>
        <body>${p.svg()}</body></html>`;
      const file = join(tmp, `${key}.html`);
      writeFileSync(file, html);
      const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 2 });
      await page.goto(pathToFileURL(file).href);
      await page.evaluate((checks) => Promise.all(checks.map((c) => document.fonts.load(c))), FONT_CHECKS);
      await page.evaluate(() => document.fonts.ready);
      const missing = await page.evaluate((checks) => checks.filter((c) => !document.fonts.check(c)), FONT_CHECKS);
      if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
      const png = await page.screenshot({ omitBackground: p.alpha, fullPage: false });
      await page.close();
      const out = join(OUT, p.out);
      let img = sharp(png).resize(p.w, p.h, { kernel: 'lanczos3' });
      if (!p.alpha) img = img.flatten({ background: C.bg }).removeAlpha();
      await img.clone().webp({ quality: p.q, effort: 6, alphaQuality: 100 }).toFile(out);
      if (preview) await img.clone().png().toFile(join(preview, `${key}.png`));
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
