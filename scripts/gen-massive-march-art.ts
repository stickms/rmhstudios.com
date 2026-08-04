/**
 * Generate Massive March's key art.
 *
 *   pnpm exec tsx scripts/gen-massive-march-art.ts
 *
 * Drawn rather than painted, and drawn from `lib/massive-march/palette.ts` — the
 * same hexes the island itself is built out of, so the card and the game cannot
 * drift apart the way a hand-exported image would.
 *
 * The composition is the game's whole art direction in one frame: an observed
 * coast at a real hour (granite headland, gum trees, sand going wet at the
 * waterline, an Australian dawn coming through low cloud) with enormous flat
 * primary-coloured objects standing on it that nothing on a real coast would
 * have, and two round birds on long legs walking somewhere with a purpose they
 * have not explained.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { AVATAR_COLORS, LAND, ORB_COLOR, TOY } from '../lib/massive-march/palette';

const W = 800;
const H = 1200;

/** A gum tree: pale trunk, sparse forked canopy. */
function gum(x: number, y: number, scale: number, tint: string): string {
  const h = 150 * scale;
  const r = 46 * scale;
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M0,0 L-5,-150 L5,-150 Z" fill="${LAND.gumBark}" />
      <path d="M-3,-96 L-34,-132" stroke="${LAND.gumBark}" stroke-width="${5}" stroke-linecap="round" fill="none" />
      <path d="M3,-108 L36,-142" stroke="${LAND.gumBark}" stroke-width="${5}" stroke-linecap="round" fill="none" />
      <ellipse cx="-34" cy="-140" rx="${r * 0.62}" ry="${r * 0.42}" fill="${tint}" />
      <ellipse cx="36" cy="-150" rx="${r * 0.7}" ry="${r * 0.46}" fill="${tint}" />
      <ellipse cx="0" cy="-${h + 8}" rx="${r * 0.82}" ry="${r * 0.5}" fill="${tint}" />
    </g>`;
}

/** A granite boulder, faceted rather than smooth. */
function boulder(x: number, y: number, scale: number, tint: string): string {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M-40,0 L-30,-26 L-6,-38 L24,-32 L40,-8 L36,0 Z" fill="${tint}" />
      <path d="M-6,-38 L24,-32 L40,-8 L14,-16 Z" fill="${LAND.graniteShade}" opacity="0.55" />
    </g>`;
}

/** A player: a round body on two very long legs, with a beak. */
function bird(x: number, y: number, scale: number, color: string, stride: number): string {
  const swing = stride * 16;
  // Legs far too long for the body, arms far too long for the legs. The
  // proportions are the joke and they are also what makes a gesture legible at
  // the size this figure is usually seen at.
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M-7,0 L${-7 - swing},74" stroke="${TOY.black}" stroke-width="5.5" stroke-linecap="round" />
      <path d="M7,0 L${7 + swing},74" stroke="${TOY.black}" stroke-width="5.5" stroke-linecap="round" />
      <g transform="translate(0 -32)">
        <circle r="32" fill="${color}" />
        <path d="M24,-2 L60,10 L24,20 Z" fill="${TOY.yellowDeep}" />
        <circle cx="17" cy="-10" r="4.6" fill="${TOY.black}" />
        <circle cx="3" cy="-13" r="4.6" fill="${TOY.black}" />
        <path d="M-27,2 L${-52 - swing},40" stroke="${TOY.black}" stroke-width="4.6" stroke-linecap="round" />
        <path d="M27,2 L${54 + swing},34" stroke="${TOY.black}" stroke-width="4.6" stroke-linecap="round" />
      </g>
    </g>`;
}

/** A banksia: waist-high scrub, the thing the flats are made of. */
function banksia(x: number, y: number, scale: number, tint: string): string {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <ellipse cx="0" cy="-14" rx="26" ry="17" fill="${tint}" />
      <ellipse cx="-16" cy="-6" rx="17" ry="12" fill="${tint}" />
      <ellipse cx="17" cy="-7" rx="15" ry="11" fill="${tint}" />
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#26407a" />
      <stop offset="42%" stop-color="#7a6a96" />
      <stop offset="72%" stop-color="#e0865c" />
      <stop offset="100%" stop-color="#f6c489" />
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${LAND.waterDeep}" />
      <stop offset="100%" stop-color="${LAND.waterShallow}" />
    </linearGradient>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${LAND.sandWet}" />
      <stop offset="30%" stop-color="${LAND.sandDry}" />
      <stop offset="100%" stop-color="#dccba6" />
    </linearGradient>
  </defs>

  <!-- Sky and sun -->
  <rect width="${W}" height="${H}" fill="url(#sky)" />
  <circle cx="596" cy="474" r="52" fill="#ffd9a0" opacity="0.95" />
  <g opacity="0.5" fill="#f0b48c">
    <ellipse cx="220" cy="330" rx="180" ry="16" />
    <ellipse cx="560" cy="286" rx="140" ry="12" />
    <ellipse cx="410" cy="392" rx="230" ry="14" />
  </g>

  <!-- The far headland: granite, hazed by distance -->
  <path d="M0,510 L86,452 L168,486 L250,430 L330,468 L420,436 L520,478 L620,452 L720,486 L800,462 L800,540 L0,540 Z"
        fill="${LAND.graniteShade}" opacity="0.55" />

  <!-- Sea -->
  <rect x="0" y="518" width="${W}" height="112" fill="url(#sea)" />
  <g fill="${LAND.foam}" opacity="0.55">
    <rect x="0" y="614" width="${W}" height="7" rx="3" />
    <rect x="60" y="596" width="200" height="4" rx="2" />
    <rect x="420" y="586" width="260" height="4" rx="2" />
  </g>

  <!-- Beach -->
  <path d="M0,626 Q400,600 800,632 L800,${H} L0,${H} Z" fill="url(#sand)" />
  <path d="M0,626 Q400,600 800,632 L800,652 Q400,624 0,648 Z" fill="${LAND.sandWet}" opacity="0.75" />

  <!-- Dune line and scrub -->
  <path d="M0,724 Q180,684 380,716 Q580,748 800,706 L800,760 L0,760 Z" fill="${LAND.grassDry}" />
  <path d="M0,780 Q220,742 460,776 Q640,802 800,764 L800,${H} L0,${H} Z" fill="${LAND.grassLush}" />

  <!-- THE BUILT WORLD: flat, primary, far too large -->
  <!-- The yellow tower -->
  <g>
    <rect x="80" y="272" width="120" height="452" fill="${TOY.yellow}" />
    <rect x="98" y="196" width="84" height="80" fill="${TOY.yellow}" />
    <rect x="116" y="140" width="48" height="60" fill="${TOY.yellow}" />
    <circle cx="140" cy="122" r="20" fill="${TOY.white}" />
    <rect x="112" y="654" width="56" height="52" fill="${TOY.black}" />
    <rect x="72" y="716" width="136" height="12" fill="${TOY.yellowDeep}" />
  </g>

  <!-- The red arch -->
  <g>
    <rect x="470" y="470" width="34" height="264" fill="${TOY.red}" />
    <rect x="686" y="470" width="34" height="270" fill="${TOY.red}" />
    <rect x="470" y="470" width="250" height="36" fill="${TOY.red}" />
  </g>

  <!-- A blue block, tipped, because somebody left it there -->
  <g transform="translate(596 764) rotate(-13)">
    <rect x="-56" y="-112" width="112" height="112" fill="${TOY.blue}" />
    <rect x="-56" y="-112" width="112" height="26" fill="${TOY.blueDeep}" opacity="0.45" />
  </g>

  <!-- A path worn up off the beach; somebody has walked this before -->
  <path d="M330,1200 Q368,1020 400,900 Q424,812 470,744" stroke="${LAND.sandDry}" stroke-width="46"
        fill="none" opacity="0.6" stroke-linecap="round" />

  <!-- Vegetation and rock, drawn over the built things so the land wins -->
  ${boulder(724, 812, 1.25, LAND.granite)}
  ${boulder(56, 848, 1.5, LAND.graniteWarm)}
  ${gum(268, 806, 0.92, '#7f9166')}
  ${gum(392, 838, 1.14, '#6d8257')}
  ${gum(742, 900, 1.3, '#8fa377')}
  ${banksia(122, 946, 1.0, LAND.banksia)}
  ${banksia(628, 968, 1.2, '#54683a')}
  ${banksia(206, 1112, 1.35, LAND.banksia)}
  ${banksia(672, 1120, 1.15, '#5b6f3c')}

  <!-- The walk itself -->
  ${bird(556, 838, 0.5, AVATAR_COLORS[1], 0.8)}
  ${bird(298, 962, 1.02, AVATAR_COLORS[0], 1)}
  ${bird(410, 986, 1.16, AVATAR_COLORS[2], -1)}
  ${bird(522, 958, 0.94, AVATAR_COLORS[3], 0.4)}

  <!-- A red round, lying on the sand where somebody dropped it -->
  <ellipse cx="164" cy="1042" rx="30" ry="9" fill="${TOY.black}" opacity="0.18" />
  <circle cx="164" cy="1024" r="22" fill="${ORB_COLOR}" />
  <circle cx="157" cy="1017" r="6" fill="#ff7a6a" opacity="0.7" />

  <!-- Title -->
  <g transform="translate(${W / 2} 1146)" text-anchor="middle">
    <rect x="-268" y="-58" width="536" height="76" fill="#f7f3e8" stroke="${TOY.black}" stroke-width="7" />
    <text y="-6" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
          font-size="50" font-weight="900" letter-spacing="3" fill="${TOY.black}">MASSIVE MARCH</text>
  </g>
</svg>`;

const out = join(process.cwd(), 'public', 'images', 'games', 'massive-march.webp');

async function main(): Promise<void> {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(png).webp({ quality: 88 }).toFile(out);
  // The SVG is kept next to the output so a future edit starts from the source
  // rather than from a raster somebody has to re-trace.
  writeFileSync(join(process.cwd(), 'public', 'images', 'games', 'massive-march.svg'), svg);
  console.warn(`wrote ${out}`);
}

void main();
