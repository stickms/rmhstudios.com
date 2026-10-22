/* eslint-disable no-console -- CLI bench intentionally writes its report to stdout */
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { optimizeImage, type ImageFormat } from '@/lib/image-optimize';

// Source: a photo-like 2048x1536 JPEG built from the shipped spatial art + noise.
const base = await sharp('public/og-spatial.png')
  .resize(2048, 1536, { fit: 'cover' })
  .jpeg({ quality: 88 })
  .toBuffer();
console.log(
  'source bytes',
  base.length,
  'sharp.concurrency',
  sharp.concurrency(),
  'UV_THREADPOOL_SIZE',
  process.env.UV_THREADPOOL_SIZE ?? '(default 4)',
);

let maxGap = 0;
let last = performance.now();
const hb = setInterval(() => {
  const now = performance.now();
  maxGap = Math.max(maxGap, now - last - 1);
  last = now;
}, 1);

async function once(w: number, f: ImageFormat) {
  maxGap = 0;
  last = performance.now();
  const t = performance.now();
  const r = await optimizeImage(base, { width: w, quality: 80, format: f });
  return { ms: performance.now() - t, stall: maxGap, bytes: r.buffer.length, type: r.contentType };
}

console.log('--- single encode (median of 5), width x format');
for (const f of ['webp', 'avif', 'jpeg'] as ImageFormat[]) {
  for (const w of [32, 320, 640, 1024, 1600, 2048]) {
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(await once(w, f));
    runs.sort((a, b) => a.ms - b.ms);
    const m = runs[2];
    console.log(
      `${f.padEnd(5)} w=${String(w).padEnd(5)} ${m.ms.toFixed(1).padStart(7)} ms  loop-stall ${m.stall.toFixed(1).padStart(5)} ms  ${m.bytes}B ${m.type}`,
    );
  }
}

console.log(
  '--- 8 concurrent distinct encodes (miss storm), wall + max stall + per-request latency',
);
for (const [f, w] of [
  ['webp', 1024],
  ['avif', 1024],
  ['avif', 1600],
] as [ImageFormat, number][]) {
  maxGap = 0;
  last = performance.now();
  const t = performance.now();
  const lat: number[] = [];
  await Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const s = performance.now();
      await optimizeImage(base, { width: w - i, quality: 80, format: f });
      lat.push(performance.now() - s);
    }),
  );
  lat.sort((a, b) => a - b);
  console.log(
    `${f} ~w=${w}: wall ${(performance.now() - t).toFixed(0)} ms, per-req p50 ${lat[4].toFixed(0)} max ${lat[7].toFixed(0)}, loop stall ${maxGap.toFixed(1)} ms`,
  );
}
clearInterval(hb);
process.exit(0);
