// loadSystemFonts:false vs default in svgToPng's renderAsync: wall time per render, byte equality.
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { renderAsync } from '@resvg/resvg-js';
import satori from 'satori';

const { loadFonts, satoriFonts } = await import('@/lib/og/shared.server');
await loadFonts();
const el = (w: number, h: number) => ({
  type: 'div',
  props: {
    style: {
      width: w,
      height: h,
      display: 'flex',
      flexDirection: 'column',
      padding: 60,
      background: '#fff',
      fontFamily: 'Inter',
    },
    children: [
      {
        type: 'div',
        props: {
          style: { fontSize: 64, fontWeight: 700 },
          children: 'A reasonably long card title that wraps',
        },
      },
      {
        type: 'div',
        props: {
          style: { fontSize: 32, color: '#565656', marginTop: 24 },
          children: 'lorem ipsum dolor sit amet '.repeat(12),
        },
      },
      {
        type: 'div',
        props: {
          style: {
            marginTop: 40,
            width: 300,
            height: 120,
            borderRadius: 44,
            border: '2px solid rgba(0,0,0,.16)',
            background: 'rgba(0,0,0,.045)',
          },
        },
      },
    ],
  },
});
const hash = (b: Uint8Array) => createHash('md5').update(b).digest('hex');
for (const [name, w, h] of [
  ['landscape', 1200, 630],
  ['story', 1080, 1920],
] as const) {
  const svg = await satori(el(w, h) as any, { width: w, height: h, fonts: satoriFonts() as any });
  console.log(name, 'svg bytes', svg.length, '<text:', /<text/.test(svg));
  const variants = { default: undefined, noSys: { loadSystemFonts: false } } as const;
  const times: Record<string, number[]> = { default: [], noSys: [] };
  const hashes: Record<string, string> = {};
  for (let round = 0; round < 15; round++) {
    for (const k of ['default', 'noSys'] as const) {
      const t = performance.now();
      const r = await renderAsync(svg, {
        fitTo: { mode: 'width', value: w },
        ...(variants[k] ? { font: variants[k] } : {}),
      });
      const png = r.asPng();
      times[k].push(performance.now() - t);
      hashes[k] = hash(png);
    }
  }
  for (const k of ['default', 'noSys']) {
    const t = times[k].slice(2).sort((a, b) => a - b);
    console.log(
      ' ',
      k.padEnd(8),
      'median',
      t[t.length >> 1].toFixed(1),
      'ms  min',
      t[0].toFixed(1),
      'p90',
      t[Math.floor(t.length * 0.9)].toFixed(1),
    );
  }
  console.log('  identical bytes:', hashes.default === hashes.noSys);
}
process.exit(0);
