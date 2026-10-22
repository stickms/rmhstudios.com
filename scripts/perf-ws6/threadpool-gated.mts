/* eslint-disable no-console -- CLI bench intentionally writes its report to stdout */
import { performance } from 'node:perf_hooks';
import { stat } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { type ImageFormat } from '@/lib/image-optimize';
import { getOrEncodeVariant } from '@/lib/images/variants.server';

const base = await sharp('public/og-spatial.png')
  .resize(2048, 1536, { fit: 'cover' })
  .jpeg({ quality: 88 })
  .toBuffer();

async function probe(label: string, encodes: number, f: ImageFormat, w: number) {
  const lat: number[] = [];
  const t0 = performance.now();
  const jobs = Array.from({ length: encodes }, (_, i) => {
    const s = performance.now();
    return getOrEncodeVariant({
      cacheKey: `bench|${label}|${i}|${Math.random()}`,
      width: w - i,
      quality: 80,
      format: f,
      load: async () => ({ bytes: base }),
    }).then(() => performance.now() - s);
  });
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await Promise.all([stat('package.json'), lookup('localhost')]);
    lat.push(performance.now() - t);
    await new Promise((r) => setTimeout(r, 10));
  }
  const per = await Promise.all(jobs);
  lat.sort((a, b) => a - b);
  per.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(30)} fs.stat+dns.lookup: median ${lat[2].toFixed(1)} ms, max ${lat[4].toFixed(1)} ms | encodes: wall ${(performance.now() - t0).toFixed(0)} ms, last finisher ${per[per.length - 1].toFixed(0)} ms`,
  );
}

await probe('4 concurrent webp w=1600', 4, 'webp', 1600);
await probe('8 concurrent avif w=1024', 8, 'avif', 1024);
await probe('8 concurrent avif w=1600', 8, 'avif', 1600);
process.exit(0);
