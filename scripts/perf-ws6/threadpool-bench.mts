import { performance } from 'node:perf_hooks';
import { stat } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { optimizeImage, type ImageFormat } from '@/lib/image-optimize';

const base = await sharp('public/og-spatial.png')
  .resize(2048, 1536, { fit: 'cover' })
  .jpeg({ quality: 88 })
  .toBuffer();

async function probe(label: string, encodes: number, f: ImageFormat, w: number) {
  const lat: number[] = [];
  const jobs = Array.from({ length: encodes }, (_, i) =>
    optimizeImage(base, { width: w - i, quality: 80, format: f }),
  );
  // fire probes 20ms in, while the pool is saturated
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await Promise.all([stat('package.json'), lookup('localhost')]);
    lat.push(performance.now() - t);
    await new Promise((r) => setTimeout(r, 10));
  }
  await Promise.all(jobs);
  lat.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(34)} fs.stat+dns.lookup latency during encodes: median ${lat[2].toFixed(1)} ms, max ${lat[4].toFixed(1)} ms`,
  );
}

// idle baseline
{
  const lat: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await Promise.all([stat('package.json'), lookup('localhost')]);
    lat.push(performance.now() - t);
  }
  lat.sort((a, b) => a - b);
  console.log(`idle baseline`.padEnd(34), `median ${lat[2].toFixed(2)} ms`);
}
await probe('4 concurrent webp w=1600', 4, 'webp', 1600);
await probe('8 concurrent avif w=1024', 8, 'avif', 1024);
await probe('8 concurrent avif w=1600', 8, 'avif', 1600);
process.exit(0);
