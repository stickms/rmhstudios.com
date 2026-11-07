/**
 * Build the Altair character sheets from the figure renderer.
 *
 *   pnpm exec tsx scripts/altair/sprites/build-characters.ts                 write public/sprites/altair/characters/*.png
 *   pnpm exec tsx scripts/altair/sprites/build-characters.ts --out DIR       write the sheets into DIR instead
 *   pnpm exec tsx scripts/altair/sprites/build-characters.ts --preview FILE  also write a magnified contact sheet
 *
 * The output is deterministic, so a re-run produces identical bytes and the PNGs can be committed.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderSheet, SIZE } from './figure';
import { CLASS_ART } from './characters';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(HERE, '..', '..', '..', 'public', 'sprites', 'altair', 'characters');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg('out') ?? DEFAULT_OUT;
  const preview = arg('preview');
  mkdirSync(out, { recursive: true });
  const W = SIZE * 4;
  const sheets: { id: string; rgba: Uint8ClampedArray }[] = [];
  for (const art of CLASS_ART) {
    const rgba = renderSheet(art.palette, art.accessories);
    sheets.push({ id: art.id, rgba });
    await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: W, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(out, art.file));
  }
  process.stdout.write(`wrote ${sheets.length} sheets to ${out}\n`);

  if (preview) {
    // Contact sheet: classes in a 4x2 grid, each sheet magnified 5x on a dark ground.
    const scale = 5;
    const cell = W * scale + 12;
    const cols = 4;
    const rows = Math.ceil(sheets.length / cols);
    const bg = Buffer.alloc(cell * cols * cell * rows * 4);
    for (let i = 0; i < bg.length; i += 4) {
      bg[i] = 5;
      bg[i + 1] = 11;
      bg[i + 2] = 20;
      bg[i + 3] = 255;
    }
    sheets.forEach((s, idx) => {
      const ox = (idx % cols) * cell + 6;
      const oy = Math.floor(idx / cols) * cell + 6;
      for (let y = 0; y < W * scale; y++) {
        for (let x = 0; x < W * scale; x++) {
          const sx = Math.floor(x / scale);
          const sy = Math.floor(y / scale);
          const si = (sy * W + sx) * 4;
          if (s.rgba[si + 3] === 0) continue;
          const di = ((oy + y) * cell * cols + ox + x) * 4;
          bg[di] = s.rgba[si];
          bg[di + 1] = s.rgba[si + 1];
          bg[di + 2] = s.rgba[si + 2];
          bg[di + 3] = 255;
        }
      }
    });
    await sharp(bg, { raw: { width: cell * cols, height: cell * rows, channels: 4 } }).png().toFile(preview);
    process.stdout.write(`wrote preview ${preview}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
