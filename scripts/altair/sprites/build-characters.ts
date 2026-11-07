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
import { ENEMY_ART, ECHO_ALLY, renderEnemySheet } from './creatures';
import { BOSS_ART, BOSS_SHEET, renderBossSheet } from './boss-art';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ALTAIR = join(HERE, '..', '..', '..', 'public', 'sprites', 'altair');
const DEFAULT_OUT = join(PUBLIC_ALTAIR, 'characters');

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
  // Enemies go beside the characters when --out is given (so previews stay out of public/), else into enemies/.
  const enemyOut = arg('out') ? join(out, 'enemies') : join(PUBLIC_ALTAIR, 'enemies');
  mkdirSync(enemyOut, { recursive: true });
  for (const art of ENEMY_ART) {
    const rgba = renderEnemySheet(art.draw, art.palette);
    sheets.push({ id: art.id, rgba });
    await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: W, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(enemyOut, art.file));
  }
  // Bosses: 32x32 frames, 4 columns by 3 rows (128x96).
  const bossOut = arg('out') ? join(out, 'bosses') : join(PUBLIC_ALTAIR, 'bosses');
  mkdirSync(bossOut, { recursive: true });
  for (const art of BOSS_ART) {
    const rgba = renderBossSheet(art.draw, art.palette);
    await sharp(Buffer.from(rgba.buffer), { raw: { width: BOSS_SHEET.width, height: BOSS_SHEET.height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(bossOut, art.file));
    if (arg('boss-preview')) {
      const sc = 4;
      const pw = BOSS_SHEET.width * sc;
      const ph = BOSS_SHEET.height * sc;
      const big = Buffer.alloc(pw * ph * 4);
      for (let i = 0; i < big.length; i += 4) { big[i] = 5; big[i + 1] = 11; big[i + 2] = 20; big[i + 3] = 255; }
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const si = (Math.floor(y / sc) * BOSS_SHEET.width + Math.floor(x / sc)) * 4;
        if (!rgba[si + 3]) continue;
        const di = (y * pw + x) * 4;
        big[di] = rgba[si]; big[di + 1] = rgba[si + 1]; big[di + 2] = rgba[si + 2]; big[di + 3] = 255;
      }
      await sharp(big, { raw: { width: pw, height: ph, channels: 4 } }).png().toFile(join(arg('boss-preview')!, `${art.id}.png`));
    }
  }
  // The Echo-Binder's allies get their own cyan sheet (they used to borrow the skeleton's).
  const echo = renderEnemySheet(ECHO_ALLY.draw, ECHO_ALLY.palette);
  await sharp(Buffer.from(echo.buffer), { raw: { width: W, height: W, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(join(out, ECHO_ALLY.file));
  sheets.push({ id: 'echo', rgba: echo });
  process.stdout.write(`wrote ${sheets.length} sheets to ${out}\n`);

  if (preview) {
    // Contact sheet: every sheet in a grid, each sheet magnified 5x on a dark ground.
    const scale = 5;
    const cell = W * scale + 12;
    const cols = 6;
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
