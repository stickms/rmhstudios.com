/**
 * Generates the default Open Graph share card at public/images/og/default.png
 * (1200×630). `lib/seo.ts` `buildMeta()` falls back to this image for any route
 * that doesn't supply its own og:image, so it must exist or shares 404.
 *
 * Reuses the same satori → resvg pipeline as the dynamic post cards
 * (lib/og/post-image.server.tsx). Fonts are read from local files when
 * OG_FONT_REGULAR / OG_FONT_BOLD point at TTFs, otherwise fetched from gstatic.
 *
 * Run:  pnpm exec tsx scripts/gen-default-og.tsx
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INTER_REGULAR_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
const INTER_BOLD_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';

async function loadFont(envPath: string | undefined, url: string): Promise<Buffer> {
  if (envPath) return readFileSync(envPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const h = React.createElement;

async function main() {
  const [regular, bold] = await Promise.all([
    loadFont(process.env.OG_FONT_REGULAR, INTER_REGULAR_URL),
    loadFont(process.env.OG_FONT_BOLD, INTER_BOLD_URL),
  ]);

  const tree = h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0b0d12 0%, #16121f 55%, #1c1430 100%)',
        padding: '80px',
        fontFamily: 'Inter',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '20px' } },
      h(
        'div',
        {
          style: {
            width: '72px',
            height: '72px',
            borderRadius: '18px',
            background: '#9b7ad8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0b0d12',
            fontSize: '40px',
            fontWeight: 800,
          },
        },
        'R',
      ),
      h('div', { style: { color: '#e8e8ec', fontSize: '34px', fontWeight: 700 } }, 'RMH Studios'),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      h(
        'div',
        {
          style: {
            color: '#ffffff',
            fontSize: '76px',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-2px',
          },
        },
        'The everything platform.',
      ),
      h(
        'div',
        { style: { color: '#9a9ba4', fontSize: '32px', fontWeight: 400 } },
        'Games · Apps · Blog · A social home for builders.',
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
      h('div', {
        style: { width: '14px', height: '14px', borderRadius: '9999px', background: '#9b7ad8' },
      }),
      h('div', { style: { color: '#c9cad2', fontSize: '28px', fontWeight: 600 } }, 'rmhstudios.com'),
    ),
  );

  const svg = await satori(tree, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      { name: 'Inter', data: bold, weight: 800, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  const dir = resolve(process.cwd(), 'public/images/og');
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, 'default.png');
  writeFileSync(out, png);
  console.warn(`wrote ${out} (${png.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
