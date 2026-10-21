import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { Resvg, renderAsync } from '@resvg/resvg-js';
import satori from 'satori';

const { loadFonts, satoriFonts } = await import('@/lib/og/shared.server');
const { renderPageCard } = await import('@/lib/og/page-card.server');
await loadFonts();

// capture svg by wrapping Resvg constructor path: easier to re-create via satori of a page card
// Use monkeypatch of Resvg.prototype.render to grab svg string via toString()
let svgCaptured: string | null = null;
const orig = Resvg.prototype.render;
Resvg.prototype.render = function (this: any) {
  if (!svgCaptured) svgCaptured = this.toString();
  return orig.call(this);
};
await renderPageCard({ cacheKey: 'cap', eyebrow: 'Devlog', title: 'A title', subtitle: 'sub '.repeat(30), stats: [{ value: '3', label: 'x', lead: true }] });
const svg = svgCaptured!;
console.log('svg bytes', svg.length, 'has <text', /<text/.test(svg), 'has font-family', /font-family/.test(svg));

function time(label: string, fn: () => unknown, n = 8) {
  const ts: number[] = [];
  let out: any;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    out = fn();
    ts.push(performance.now() - t);
  }
  ts.sort((a, b) => a - b);
  console.log(label.padEnd(40), 'median', ts[Math.floor(n / 2)].toFixed(1), 'ms');
  return out;
}

const a = time('default (system fonts)', () => new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
const b = time('loadSystemFonts:false', () =>
  new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } }).render().asPng(),
);
const hash = (x: Uint8Array) => createHash('md5').update(x).digest('hex');
console.log('identical PNG bytes:', hash(a) === hash(b), a.length, b.length);

// async variant
const ts: number[] = [];
let stallMax = 0;
let last = performance.now();
const hb = setInterval(() => {
  const now = performance.now();
  stallMax = Math.max(stallMax, now - last - 1);
  last = now;
}, 1);
for (let i = 0; i < 6; i++) {
  stallMax = 0;
  last = performance.now();
  const t = performance.now();
  const r = await renderAsync(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } });
  const png = r.asPng();
  ts.push(performance.now() - t);
  console.log('renderAsync run', i, (performance.now() - t).toFixed(1), 'ms; max loop stall', stallMax.toFixed(1), 'identical', hash(png) === hash(b));
}
clearInterval(hb);
process.exit(0);
