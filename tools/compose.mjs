import sharp from 'sharp';
import fs from 'node:fs';
import { compose, texturesOf, fromRgba } from './warpaint.ts';
const kit = process.argv[2], out = '/tmp/pk';
const script = JSON.parse(fs.readFileSync(`${out}/kits/${kit}.json`, 'utf8'));
async function load(p) {
  const f = `${out}/tex/${p}.webp`;
  if (!fs.existsSync(f)) return undefined;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return fromRgba(new Uint8ClampedArray(data), info.width, info.height);
}
for (const [wear, seed] of [[1, 5], [3, 5], [5, 5], [3, 99]]) {
  const tree = script.w[wear - 1];
  const paths = [...texturesOf(tree)];
  const rs = await Promise.all(paths.map(load));
  const missing = paths.filter((_, i) => !rs[i]);
  const map = new Map(paths.map((p, i) => [p, rs[i]]));
  const t0 = Date.now();
  const r = compose(tree, { size: 256, seed, wear, texture: (p) => map.get(p) });
  const ms = Date.now() - t0;
  let mean = [0, 0, 0];
  for (let i = 0; i < r.w * r.h; i++) for (let c = 0; c < 3; c++) mean[c] += r.data[i * 3 + c] / (r.w * r.h);
  console.log(`wear ${wear} seed ${seed}: ${paths.length} textures (${missing.length} missing ${missing.slice(0, 3)}), ${ms} ms, mean`, mean.map((v) => v.toFixed(2)).join(','));
  if (wear === 3 && seed === 5) {
    const N = 8;
    for (let y = 0; y < N; y++) {
      let row = '';
      for (let x = 0; x < N; x++) {
        let a = [0, 0, 0], n = 0;
        for (let yy = y * 32; yy < y * 32 + 32; yy++) for (let xx = x * 32; xx < x * 32 + 32; xx++) { for (let c = 0; c < 3; c++) a[c] += r.data[(yy * 256 + xx) * 3 + c]; n++; }
        row += a.map((v) => Math.round((v / n) * 255).toString(16).padStart(2, '0')).join('') + ' ';
      }
      console.log(row);
    }
  }
}
