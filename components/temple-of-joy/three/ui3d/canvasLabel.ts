import * as THREE from 'three';

/**
 * Renders text to a CanvasTexture so it can live on a real mesh in the 3D scene.
 * Uses the browser's 2D canvas (system fonts) — no font asset or network fetch,
 * so it works offline and on mobile. Textures are cached by their full options
 * key and disposed by the LRU when the cache grows large.
 */
export interface LabelOptions {
  fontSize?: number;       // px in the source canvas
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;       // px before word-wrap (source canvas units)
  lineHeight?: number;     // multiplier
  padding?: number;
}

export interface LabelTexture {
  texture: THREE.CanvasTexture;
  aspect: number;          // width / height of the rendered canvas
  width: number;
  height: number;
}

const cache = new Map<string, LabelTexture>();
const MAX_CACHE = 400;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (!maxWidth) { out.push(rawLine); continue; }
    const words = rawLine.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

export function makeLabelTexture(text: string, opts: LabelOptions = {}): LabelTexture {
  const {
    fontSize = 48,
    color = '#e8d5b0',
    bold = true,
    italic = false,
    align = 'center',
    maxWidth = 0,
    lineHeight = 1.25,
    padding = 12,
  } = opts;

  const key = `${text}|${fontSize}|${color}|${bold}|${italic}|${align}|${maxWidth}|${lineHeight}|${padding}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize}px Georgia, 'Times New Roman', serif`;

  // Measure pass
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const lines = wrap(measure, text, maxWidth);
  const lineH = fontSize * lineHeight;
  const textW = Math.ceil(Math.max(1, ...lines.map((l) => measure.measureText(l).width)));
  const w = textW + padding * 2;
  const h = Math.ceil(lines.length * lineH) + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  // subtle shadow for legibility against the scene
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = Math.max(2, fontSize * 0.08);
  ctx.shadowOffsetY = 1;
  const x = align === 'left' ? padding : align === 'right' ? w - padding : w / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, padding + lineH * (i + 0.5)));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  const entry: LabelTexture = { texture, aspect: w / h, width: w, height: h };

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) {
      cache.get(firstKey)?.texture.dispose();
      cache.delete(firstKey);
    }
  }
  cache.set(key, entry);
  return entry;
}
