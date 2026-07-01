/**
 * Generates PWA icons at public/images/icons/ (192, 512, and a maskable 512).
 * The manifest references these so the app installs with a proper home-screen
 * icon instead of only the SVG favicon. Branded to match the OG card mark.
 *
 * Run:  pnpm exec tsx scripts/gen-pwa-icons.tsx
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INTER_BOLD_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';

const h = React.createElement;
const ACCENT = '#9b7ad8';
const FG = '#0b0d12';

async function loadFont(): Promise<Buffer> {
  const p = process.env.OG_FONT_BOLD;
  if (p) return readFileSync(p);
  const res = await fetch(INTER_BOLD_URL);
  if (!res.ok) throw new Error(`font ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** @param inset padding fraction (0 = full-bleed maskable, >0 = rounded badge). */
function icon(size: number, inset: number, font: Buffer) {
  const pad = Math.round(size * inset);
  return satori(
    h(
      'div',
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: inset > 0 ? '#0b0d12' : ACCENT,
          padding: `${pad}px`,
        },
      },
      h(
        'div',
        {
          style: {
            width: `${size - pad * 2}px`,
            height: `${size - pad * 2}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: ACCENT,
            color: FG,
            borderRadius: inset > 0 ? `${Math.round(size * 0.22)}px` : '0px',
            fontSize: `${Math.round(size * 0.58)}px`,
            fontWeight: 800,
            fontFamily: 'Inter',
          },
        },
        'R',
      ),
    ),
    { width: size, height: size, fonts: [{ name: 'Inter', data: font, weight: 800, style: 'normal' }] },
  );
}

async function main() {
  const font = await loadFont();
  const dir = resolve(process.cwd(), 'public/images/icons');
  mkdirSync(dir, { recursive: true });

  const targets: Array<[string, number, number]> = [
    ['icon-192.png', 192, 0.12],
    ['icon-512.png', 512, 0.12],
    ['icon-maskable-512.png', 512, 0], // full-bleed for maskable safe zone
  ];

  for (const [name, size, inset] of targets) {
    const svg = await icon(size, inset, font);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(resolve(dir, name), png);
    console.warn(`wrote ${name} (${png.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
