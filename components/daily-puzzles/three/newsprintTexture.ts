import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

export interface NewsprintOptions {
  title: string;
  dateText: string;
  issueText: string;
}

/** Draws a stylized newspaper front page to a CanvasTexture (cached by key). */
export function makeNewsprintTexture(opts: NewsprintOptions): THREE.CanvasTexture {
  const key = `${opts.title}|${opts.dateText}|${opts.issueText}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 1024;
  const H = 1448;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, 0, W, H);
  // Subtle vignette / aged tint
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(120,110,90,0.12)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const ink = '#1c1a16';
  const margin = 56;

  // Masthead
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = "700 124px Georgia, 'Times New Roman', serif";
  ctx.fillText(opts.title, W / 2, 150);
  // Rules under masthead
  ctx.fillRect(margin, 188, W - margin * 2, 4);
  ctx.fillRect(margin, 198, W - margin * 2, 2);
  // Date / issue line
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText(`${opts.dateText}   ·   ${opts.issueText}   ·   PUZZLES EDITION`, W / 2, 236);

  // Column rules
  const colTop = 280;
  const colBottom = H - margin;
  for (const cx of [W / 3, (W * 2) / 3]) {
    ctx.fillStyle = 'rgba(28,26,22,0.35)';
    ctx.fillRect(cx - 1, colTop, 2, colBottom - colTop);
  }

  // Halftone-ish filler text (rows of short ink dashes) so empty areas read as newsprint
  ctx.fillStyle = 'rgba(28,26,22,0.22)';
  for (let y = colTop + 24; y < colBottom; y += 26) {
    for (let band = 0; band < 3; band++) {
      const bx = margin + band * (W / 3) - (band > 0 ? 8 : 0);
      const bw = W / 3 - margin * 0.8;
      let x = bx;
      while (x < bx + bw) {
        const wlen = 12 + ((x * 7 + y * 13) % 40);
        ctx.fillRect(x, y, Math.min(wlen, bx + bw - x), 8);
        x += wlen + 8;
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;

  if (cache.size > 8) {
    const first = cache.keys().next().value as string | undefined;
    if (first) { cache.get(first)?.dispose(); cache.delete(first); }
  }
  cache.set(key, tex);
  return tex;
}
