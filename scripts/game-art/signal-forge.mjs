#!/usr/bin/env node
/**
 * Generates Signal Forge's catalog art: the card, banner, logo and icon.
 *
 *   public/images/games/signal-forge.webp          card    1600×2400 (2:3), opaque
 *   public/images/games/banners/signal-forge.webp  banner  1920×620, opaque, text-free
 *   public/images/games/logos/signal-forge.webp    logo    1024×360, transparent (the wordmark)
 *   public/images/games/icons/signal-forge.webp    icon    1024×1024, opaque
 *
 * The look (docs/game-design-schemes/signal-forge.json): a signal being forged. A cold cyan oscilloscope trace
 * runs in from the left over a phosphor graticule, crosses a glowing anvil and leaves as molten amber, with the
 * four card waveforms (pulse, sine, saw, noise) in sequence along it. Charred steel, copper circuit traces with
 * solder pads, riveted plates, sparks. The wordmark is Audiowide: SIGNAL in cold steel, FORGE poured hot.
 * Everything is original vector work drawn here; the fonts are OFL (Audiowide, Barlow Condensed, IBM Plex Mono)
 * from components/shared/game-fonts. See docs/game-art-credits.md.
 *
 * Pipeline: SVG → HTML (fonts via file:// URL) → headless Chromium (Playwright) at 2× → sharp (Lanczos) → WebP.
 * Deterministic: the sparks and traces come from a seeded PRNG.
 *
 *   node scripts/game-art/signal-forge.mjs                  # all four, into public/
 *   node scripts/game-art/signal-forge.mjs --only card,logo # a subset
 *   node scripts/game-art/signal-forge.mjs --preview <dir>  # also write PNG previews there
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
  bg: '#0E0B09',
  soot: '#1A1410',
  plate: '#241A13',
  ink: '#F6E7D2',
  muted: '#C2A888',
  amber: '#FF8A2A',
  amberHi: '#FFB23E',
  white: '#FFF1C2',
  cyan: '#3FD6F0',
  cyanHi: '#B5F4FF',
  copper: '#B8743A',
  line: '#5A3A22',
  red: '#FF4D3D',
  phosphor: '#A6E86A',
  saw: '#FF6B5A',
};

const font = (p) => pathToFileURL(join(GAME_FONTS, p)).href;
const FONT_CSS = `
@font-face{font-family:'Audiowide';src:url('${font('Audiowide/Audiowide-Regular.woff2')}') format('woff2')}
@font-face{font-family:'Barlow Condensed';src:url('${font('BarlowCondensed/BarlowCondensed-Bold.woff2')}') format('woff2');font-weight:700}
@font-face{font-family:'IBM Plex Mono';src:url('${font('IBMPlexMono/IBMPlexMono-Medium.woff2')}') format('woff2');font-weight:500}
`;
const FONT_CHECKS = ["40px 'Audiowide'", "700 40px 'Barlow Condensed'", "500 40px 'IBM Plex Mono'"];
const AW = "'Audiowide'";
const BC = "'Barlow Condensed'";
const MONO = "'IBM Plex Mono'";

const f = (n) => Number(n.toFixed(1));
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function defs(id) {
  return `
  <linearGradient id="${id}-hot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.white}"/><stop offset=".35" stop-color="${C.amberHi}"/>
    <stop offset=".75" stop-color="${C.amber}"/><stop offset="1" stop-color="#B8320A"/>
  </linearGradient>
  <linearGradient id="${id}-cold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="${C.cyanHi}"/><stop offset="1" stop-color="#4F8FA0"/>
  </linearGradient>
  <linearGradient id="${id}-trace" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset=".46" stop-color="${C.cyanHi}"/>
    <stop offset=".54" stop-color="${C.white}"/><stop offset=".62" stop-color="${C.amberHi}"/><stop offset="1" stop-color="${C.amber}"/>
  </linearGradient>
  <radialGradient id="${id}-glow"><stop offset="0" stop-color="${C.amberHi}" stop-opacity=".9"/><stop offset=".35" stop-color="${C.amber}" stop-opacity=".45"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}-cglow"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".45"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
  <filter id="${id}-bloom" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="${id}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .07  0 0 0 0 .05  0 0 0 .3 0"/></filter>
  <pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${C.cyan}" stroke-opacity=".13" stroke-width="1.5"/></pattern>
  <pattern id="${id}-scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="2" fill="#000" opacity=".25"/></pattern>`;
}

/** The signal: pulse, sine, saw, noise in sequence across [x0, x1] around y, amplitude a. */
function signalPath(x0, x1, y, a, seed = 3, k = 1) {
  const np = Math.max(1, Math.round(3 * k));
  const ns = Math.max(1, Math.round(4 * k));
  const nn = Math.max(6, Math.round(26 * k));
  const r = rng(seed);
  const seg = (x1 - x0) / 4;
  const pts = [];
  // Pulse: square steps.
  for (let i = 0; i < np; i++) {
    const s = x0 + (i * seg) / np;
    const w = seg / np;
    pts.push(`L${f(s)} ${f(y + a)}`, `L${f(s)} ${f(y - a)}`, `L${f(s + w / 2)} ${f(y - a)}`, `L${f(s + w / 2)} ${f(y + a)}`, `L${f(s + w)} ${f(y + a)}`);
  }
  // Sine.
  for (let i = 0; i <= 48; i++) {
    const x = x0 + seg + (i / 48) * seg;
    pts.push(`L${f(x)} ${f(y - Math.sin((i / 48) * Math.PI * 2 * Math.max(1, Math.round(2 * k))) * a)}`);
  }
  // Saw.
  for (let i = 0; i < ns; i++) {
    const s = x0 + 2 * seg + (i * seg) / ns;
    pts.push(`L${f(s)} ${f(y + a)}`, `L${f(s + seg / ns)} ${f(y - a)}`);
  }
  pts.push(`L${f(x0 + 3 * seg)} ${f(y + a)}`);
  // Noise.
  for (let i = 0; i <= nn; i++) {
    const x = x0 + 3 * seg + (i / nn) * seg;
    pts.push(`L${f(x)} ${f(y + (r() * 2 - 1) * a * (0.4 + 0.6 * r()))}`);
  }
  return `M${f(x0)} ${f(y)} ` + pts.join(' ');
}

function sparks(seed, cx, cy, n, spread, len, color = C.amberHi) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (r() * 2 - 1) * spread;
    const d = 40 + r() * len;
    const x = cx + Math.cos(ang) * d;
    const y = cy + Math.sin(ang) * d;
    const l = 6 + r() * 26;
    out += `<path d="M${f(x)} ${f(y)} L${f(x + Math.cos(ang) * l)} ${f(y + Math.sin(ang) * l)}" stroke="${i % 5 === 0 ? C.white : color}" stroke-width="${f(1.5 + r() * 3)}" stroke-linecap="round" opacity="${f(0.45 + r() * 0.55)}"/>`;
  }
  return out;
}

function traces(seed, x0, y0, w, h, n, color = C.copper) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    let x = x0 + r() * w;
    let y = y0 + r() * h;
    let d = `M${f(x)} ${f(y)}`;
    const pads = [[x, y]];
    for (let k = 0; k < 4; k++) {
      const len = 40 + r() * 180;
      if (k % 2 === 0) x += r() < 0.5 ? -len : len;
      else {
        const dy = (r() < 0.5 ? -1 : 1) * len * 0.5;
        x += dy * 0.6;
        y += dy;
      }
      d += ` L${f(x)} ${f(y)}`;
    }
    pads.push([x, y]);
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" opacity=".5"/>`;
    for (const [px, py] of pads) out += `<circle cx="${f(px)}" cy="${f(py)}" r="7" fill="${C.bg}" stroke="${color}" stroke-width="3" opacity=".75"/>`;
  }
  return out;
}

function anvil(cx, cy, s, id) {
  // Horn to the left, heel to the right, a glowing ingot on the face.
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="-40" rx="260" ry="90" fill="url(#${id}-glow)" filter="url(#${id}-bloom)"/>
    <path d="M-230 -20 C-170 -20 -150 -36 -120 -40 H190 V0 H150 C120 0 100 24 96 60 H130 V110 H-130 V60 H-96 C-100 24 -120 0 -150 0 H-160 C-190 0 -214 -6 -230 -20 Z" fill="#2B211B" stroke="${C.copper}" stroke-width="4"/>
    <path d="M-120 -40 H190" stroke="${C.amberHi}" stroke-width="3" opacity=".8"/>
    <path d="M-110 -26 H180" stroke="#4A3A30" stroke-width="2"/>
    <rect x="-70" y="-74" width="150" height="34" rx="6" fill="url(#${id}-hot)"/>
    <rect x="-70" y="-74" width="150" height="34" rx="6" fill="none" stroke="${C.white}" stroke-opacity=".6" stroke-width="2"/>
    <circle cx="-100" cy="84" r="6" fill="${C.copper}"/><circle cx="100" cy="84" r="6" fill="${C.copper}"/>
  </g>`;
}

function hammer(x, y, rot, s) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect x="-10" y="0" width="20" height="230" rx="6" fill="#4A3326" stroke="${C.copper}" stroke-width="3"/>
    <rect x="-70" y="-46" width="140" height="56" rx="6" fill="#3A3330" stroke="#8A7A70" stroke-width="3"/>
    <path d="M-70 -18 H70" stroke="#8A7A70" stroke-width="2"/>
  </g>`;
}

function rivetFrame(w, h, inset) {
  let out = `<rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="none" stroke="${C.copper}" stroke-width="5"/>`;
  out += `<rect x="${inset + 14}" y="${inset + 14}" width="${w - inset * 2 - 28}" height="${h - inset * 2 - 28}" fill="none" stroke="${C.line}" stroke-width="2"/>`;
  const step = 80;
  for (let x = inset + 40; x < w - inset - 20; x += step) {
    out += `<circle cx="${x}" cy="${inset + 7}" r="5" fill="${C.copper}"/><circle cx="${x}" cy="${h - inset - 7}" r="5" fill="${C.copper}"/>`;
  }
  for (let y = inset + 40; y < h - inset - 20; y += step) {
    out += `<circle cx="${inset + 7}" cy="${y}" r="5" fill="${C.copper}"/><circle cx="${w - inset - 7}" cy="${y}" r="5" fill="${C.copper}"/>`;
  }
  return out;
}

/** SIGNAL (cold steel) over FORGE (poured hot), centred on cx. */
function wordmark(id, cx, y, size, { glow = true } = {}) {
  const s2 = size * 0.62;
  return `<g text-anchor="middle" font-family="${AW}">
    <text x="${cx}" y="${y}" font-size="${s2}" fill="url(#${id}-cold)" letter-spacing="${s2 * 0.12}">SIGNAL</text>
    ${glow ? `<text x="${cx}" y="${y + size * 0.98}" font-size="${size}" fill="${C.amber}" opacity=".55" filter="url(#${id}-bloom)" letter-spacing="${size * 0.02}">FORGE</text>` : ''}
    <text x="${cx}" y="${y + size * 0.98}" font-size="${size}" fill="url(#${id}-hot)" stroke="#5A1A04" stroke-width="${size * 0.012}" letter-spacing="${size * 0.02}">FORGE</text>
  </g>`;
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function cardSvg() {
  const W = 800;
  const H = 1200;
  const id = 'c';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs(id)}</defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" filter="url(#${id}-grain)"/>
  <rect x="40" y="430" width="${W - 80}" height="360" fill="url(#${id}-grid)"/>
  <ellipse cx="160" cy="610" rx="260" ry="160" fill="url(#${id}-cglow)"/>
  ${traces(11, 40, 860, W - 80, 300, 9)}
  ${wordmark(id, W / 2, 190, 178)}
  <text x="${W / 2}" y="420" text-anchor="middle" font-family="${BC}" font-weight="700" font-size="30" fill="${C.ink}" letter-spacing="2">LAND THE PHRASE. BANK THE HEAT. FIRE THE FORGE.</text>
  <g font-family="${MONO}" font-size="15" fill="${C.cyan}" opacity=".8">
    <text x="64" y="470">CH1  PULSE · SINE · SAW · NOISE</text>
    <text x="${W - 64}" y="470" text-anchor="end">80 BPM</text>
  </g>
  <path d="${signalPath(40, 760, 610, 70, 5)}" fill="none" stroke="url(#${id}-trace)" stroke-width="16" opacity=".35" filter="url(#${id}-bloom)"/>
  <path d="${signalPath(40, 760, 610, 70, 5)}" fill="none" stroke="url(#${id}-trace)" stroke-width="7" stroke-linejoin="round"/>
  ${anvil(W / 2 + 10, 900, 1.15, id)}
  ${hammer(500, 770, 215, 1)}
  ${sparks(7, W / 2 + 10, 830, 70, 1.25, 330)}
  <g font-family="${MONO}" font-size="15" fill="${C.muted}">
    <text x="64" y="1104">FIG. 1: A SIGNAL, COLD IN, HOT OUT</text>
    <text x="${W - 64}" y="1104" text-anchor="end">ROGUELIKE DECKBUILDER</text>
  </g>
  <rect width="${W}" height="${H}" fill="url(#${id}-scan)"/>
  ${rivetFrame(W, H, 18)}
</svg>`;
}

function bannerSvg() {
  const W = 1920;
  const H = 620;
  const id = 'b';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs(id)}
    <linearGradient id="${id}-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.bg}"/><stop offset=".35" stop-color="${C.bg}" stop-opacity=".2"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" filter="url(#${id}-grain)"/>
  <rect x="0" y="60" width="${W}" height="380" fill="url(#${id}-grid)"/>
  <ellipse cx="1260" cy="560" rx="700" ry="300" fill="url(#${id}-glow)" opacity=".8"/>
  <g fill="#050403">
    <path d="M1520 620 V300 H1580 V180 H1630 V300 H1700 V420 H1780 V250 H1830 V620 Z"/>
    <path d="M1600 620 C1600 470 1660 420 1700 420 C1740 420 1790 470 1790 620 Z" fill="#1A0A04"/>
  </g>
  <ellipse cx="1695" cy="560" rx="70" ry="80" fill="${C.amber}" opacity=".55" filter="url(#${id}-bloom)"/>
  ${traces(23, 0, 470, W, 150, 16)}
  <path d="${signalPath(0, W, 300, 90, 9)}" fill="none" stroke="url(#${id}-trace)" stroke-width="22" opacity=".3" filter="url(#${id}-bloom)"/>
  <path d="${signalPath(0, W, 300, 90, 9)}" fill="none" stroke="url(#${id}-trace)" stroke-width="8" stroke-linejoin="round"/>
  ${anvil(1080, 520, 1.1, id)}
  ${hammer(1160, 410, 215, 1.1)}
  ${sparks(17, 1080, 450, 90, 1.35, 340)}
  <rect width="${W}" height="${H}" fill="url(#${id}-fade)"/>
  <rect width="${W}" height="${H}" fill="url(#${id}-scan)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${C.copper}" opacity=".7"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${C.copper}" opacity=".7"/>
</svg>`;
}

function logoSvg() {
  const W = 1024;
  const H = 360;
  const id = 'l';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs(id)}</defs>
  ${wordmark(id, W / 2, 112, 196)}
  <path d="${signalPath(70, 954, 150, 16, 2)}" fill="none" stroke="url(#${id}-trace)" stroke-width="5" stroke-linejoin="round" opacity=".95"/>
</svg>`;
}

function iconSvg() {
  const W = 512;
  const H = 512;
  const id = 'i';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs(id)}</defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" filter="url(#${id}-grain)"/>
  ${traces(5, 0, 0, W, H, 7)}
  <circle cx="256" cy="256" r="220" fill="url(#${id}-glow)" opacity=".6"/>
  <polygon points="256,36 446,146 446,366 256,476 66,366 66,146" fill="#1E1611" stroke="${C.copper}" stroke-width="10"/>
  <polygon points="256,86 402,170 402,342 256,426 110,342 110,170" fill="#0A0605" stroke="${C.line}" stroke-width="4"/>
  <rect x="120" y="180" width="272" height="152" fill="url(#${id}-grid)"/>
  <path d="${signalPath(120, 392, 256, 56, 4, 0.4)}" fill="none" stroke="url(#${id}-trace)" stroke-width="20" opacity=".35" filter="url(#${id}-bloom)"/>
  <path d="${signalPath(120, 392, 256, 56, 4, 0.4)}" fill="none" stroke="url(#${id}-trace)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
  ${[0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `<circle cx="${f(256 + Math.cos(a) * 190)}" cy="${f(256 + Math.sin(a) * 190)}" r="9" fill="${C.copper}"/>`;
  }).join('')}
</svg>`;
}

const PIECES = {
  card: { svg: cardSvg, w: 1600, h: 2400, vw: 800, vh: 1200, out: 'signal-forge.webp', q: 86 },
  banner: { svg: bannerSvg, w: 1920, h: 620, vw: 1920, vh: 620, out: 'banners/signal-forge.webp', q: 82 },
  logo: { svg: logoSvg, w: 1024, h: 360, vw: 1024, vh: 360, out: 'logos/signal-forge.webp', q: 90, alpha: true },
  icon: { svg: iconSvg, w: 1024, h: 1024, vw: 512, vh: 512, out: 'icons/signal-forge.webp', q: 86 },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const only = arg('--only')?.split(',') ?? Object.keys(PIECES);
  const preview = arg('--preview');
  if (preview) mkdirSync(preview, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'signal-forge-art-'));
  const executablePath = arg('--chromium') || process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const key of only) {
      const p = PIECES[key];
      if (!p) throw new Error(`unknown piece: ${key}`);
      const svg = p.svg().replace('<svg ', `<svg style="width:${p.vw}px;height:${p.vh}px" `);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
        html,body{margin:0;padding:0;background:${p.alpha ? 'transparent' : C.bg}}svg{display:block}</style></head><body>${svg}</body></html>`;
      const file = join(tmp, `${key}.html`);
      writeFileSync(file, html);
      const page = await browser.newPage({ viewport: { width: p.vw, height: p.vh }, deviceScaleFactor: (p.w / p.vw) * 2 });
      await page.goto(pathToFileURL(file).href);
      await page.evaluate((checks) => Promise.all(checks.map((c) => document.fonts.load(c))), FONT_CHECKS);
      await page.evaluate(() => document.fonts.ready);
      const missing = await page.evaluate((checks) => checks.filter((c) => !document.fonts.check(c)), FONT_CHECKS);
      if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
      const png = await page.screenshot({ omitBackground: !!p.alpha, fullPage: false });
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
