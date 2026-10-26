/**
 * Scene → Canvas2D. Pure drawing: nothing here decides layout.
 *
 * The caller sets up the transform (scene pixels → backing-store pixels) before
 * calling, so one scene renders crisply at any display size and device pixel
 * ratio. Text, borders and images are clipped to their panel like VGUI does.
 */

import { fontCss } from '../assets/fonts';
import type { ImageStore } from '../assets/images';
import type { Rgba } from '../scheme/scheme';
import { rgbaCss } from '../scheme/scheme';
import type { BorderOp, DrawOp, ImageOp, PanelNode, Scene, TextOp } from './types';

export interface PaintOptions {
  images: ImageStore;
  /** Faint outline round every shown panel (the "show bounds" aid). */
  showBounds?: boolean;
}

function clipTo(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }) {
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  g.beginPath();
  if (rad > 0) g.roundRect(x, y, w, h, rad);
  else g.rect(x, y, w, h);
}

function wrapLines(g: CanvasRenderingContext2D, text: string, maxWidth: number, wrap: boolean) {
  const lines: string[] = [];
  for (const para of text.split(/\\n|\n/)) {
    if (!wrap) {
      lines.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && g.measureText(test).width > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(g: CanvasRenderingContext2D, op: TextOp) {
  g.save();
  clipTo(g, op.rect);
  g.font = fontCss(op.fontName, op.px, op.weight, op.italic);
  g.textBaseline = 'top';
  const innerW = Math.max(1, op.rect.w - op.insetX * 2);
  const lines = wrapLines(g, op.text, innerW, op.wrap);
  const lh = Math.round(op.px * 1.12);
  const total = lines.length * lh;
  let y = op.rect.y + op.insetY;
  if (op.valign === 'middle') y = op.rect.y + (op.rect.h - total) / 2;
  else if (op.valign === 'bottom') y = op.rect.y + op.rect.h - total - op.insetY;
  const dy = op.px * 0.06;

  lines.forEach((line, i) => {
    const w = g.measureText(line).width;
    let x = op.rect.x + op.insetX;
    if (op.align === 'center') x = op.rect.x + (op.rect.w - w) / 2;
    else if (op.align === 'right') x = op.rect.x + op.rect.w - w - op.insetX;
    const ly = y + i * lh + dy;
    if (op.dropshadow) {
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillText(line, x + 1, ly + 1);
    }
    if (op.outline) {
      g.lineJoin = 'round';
      g.lineWidth = Math.max(2, op.px / 8);
      g.strokeStyle = 'rgba(0,0,0,0.9)';
      g.strokeText(line, x, ly);
    }
    g.fillStyle = rgbaCss(op.color);
    g.fillText(line, x, ly);
    if (op.underline) g.fillRect(x, ly + op.px * 1.02, w, Math.max(1, op.px / 14));
  });
  g.restore();
}

function drawBorder(g: CanvasRenderingContext2D, op: BorderOp) {
  const { x, y, w, h } = op.rect;
  const sides = [
    ['left', op.border.left, op.colors.left],
    ['right', op.border.right, op.colors.right],
    ['top', op.border.top, op.colors.top],
    ['bottom', op.border.bottom, op.colors.bottom],
  ] as const;
  for (const [side, layers, colors] of sides) {
    layers.forEach((layer, i) => {
      const c = colors[i];
      if (!c || c.a === 0) return;
      g.fillStyle = rgbaCss(c);
      const [s, e] = layer.offset;
      switch (side) {
        case 'left':
          g.fillRect(x + i, y + s, 1, h - s - e);
          break;
        case 'right':
          g.fillRect(x + w - 1 - i, y + s, 1, h - s - e);
          break;
        case 'top':
          g.fillRect(x + s, y + i, w - s - e, 1);
          break;
        case 'bottom':
          g.fillRect(x + s, y + h - 1 - i, w - s - e, 1);
          break;
      }
    });
  }
}

const tintCache = new WeakMap<ImageBitmap, Map<string, HTMLCanvasElement | OffscreenCanvas>>();

function tinted(img: ImageBitmap, tint: Rgba): CanvasImageSource {
  const key = `${tint.r},${tint.g},${tint.b},${tint.a}`;
  let per = tintCache.get(img);
  if (!per) tintCache.set(img, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;
  const c = new OffscreenCanvas(img.width, img.height);
  const cg = c.getContext('2d')!;
  cg.drawImage(img, 0, 0);
  cg.globalCompositeOperation = 'multiply';
  cg.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
  cg.fillRect(0, 0, c.width, c.height);
  cg.globalCompositeOperation = 'destination-in';
  cg.drawImage(img, 0, 0);
  per.set(key, c);
  return c;
}

/**
 * The Source engine's "missing texture": a magenta/black checkerboard. Shown for
 * any texture the project (or the imported game files) cannot supply, so a
 * missing file is unmissable instead of silently blank.
 */
let checker: CanvasPattern | null = null;
function checkerPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (checker) return checker;
  const c = new OffscreenCanvas(2, 2);
  const cg = c.getContext('2d');
  if (!cg) return null;
  cg.fillStyle = '#ff00ff';
  cg.fillRect(0, 0, 2, 2);
  cg.fillStyle = '#000';
  cg.fillRect(0, 0, 1, 1);
  cg.fillRect(1, 1, 1, 1);
  checker = g.createPattern(c, 'repeat');
  return checker;
}

function missingTexture(g: CanvasRenderingContext2D, r: ImageOp['rect']) {
  const pattern = checkerPattern(g);
  if (!pattern) return;
  const cell = Math.max(2, Math.min(16, Math.round(Math.min(r.w, r.h) / 4)));
  pattern.setTransform(new DOMMatrix().translate(r.x, r.y).scale(cell));
  g.save();
  g.fillStyle = pattern;
  g.imageSmoothingEnabled = false;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.restore();
}

function drawImage(g: CanvasRenderingContext2D, op: ImageOp, images: ImageStore) {
  const img = images.get(op.path);
  if (img === undefined) return; // still loading: draw nothing this frame
  if (img === null) {
    missingTexture(g, op.rect);
    return;
  }
  const { x, y, w, h } = op.rect;
  const frac = op.clipX === undefined ? 1 : Math.max(0, Math.min(1, op.clipX));
  if (frac <= 0) return;
  const src = op.tint ? tinted(img, op.tint) : img;
  g.save();
  g.imageSmoothingEnabled = true;
  if (op.tint && op.tint.a < 255) g.globalAlpha = op.tint.a / 255;
  g.drawImage(src, 0, 0, img.width * frac, img.height, x, y, w * frac, h);
  g.restore();
}

function drawDynamic(g: CanvasRenderingContext2D, r: ImageOp['rect'], label: string) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.04)';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.setLineDash([3, 3]);
  g.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
  if (r.w > 30 && r.h > 12) {
    clipTo(g, r);
    g.setLineDash([]);
    g.font = '10px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  g.restore();
}

function drawOp(g: CanvasRenderingContext2D, op: DrawOp, opts: PaintOptions) {
  switch (op.t) {
    case 'rect':
      g.fillStyle = rgbaCss(op.fill);
      if (op.radius > 0) {
        roundRect(g, op.rect.x, op.rect.y, op.rect.w, op.rect.h, op.radius);
        g.fill();
      } else g.fillRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h);
      break;
    case 'border':
      drawBorder(g, op);
      break;
    case 'text':
      drawText(g, op);
      break;
    case 'image':
      drawImage(g, op, opts.images);
      break;
    case 'dynamic':
      drawDynamic(g, op.rect, op.label);
      break;
    case 'outline':
      g.save();
      g.strokeStyle = rgbaCss(op.color);
      if (op.dashed) g.setLineDash([3, 3]);
      g.strokeRect(
        op.rect.x + 0.5,
        op.rect.y + 0.5,
        Math.max(0, op.rect.w - 1),
        Math.max(0, op.rect.h - 1),
      );
      g.restore();
      break;
  }
}

export function paintScene(g: CanvasRenderingContext2D, scene: Scene, opts: PaintOptions): void {
  for (const node of scene.nodes) {
    if (!node.shown) continue;
    for (const op of node.ops) drawOp(g, op, opts);
    if (opts.showBounds) {
      g.save();
      g.strokeStyle = 'rgba(120,200,255,0.35)';
      g.lineWidth = 1;
      g.strokeRect(
        node.rect.x + 0.5,
        node.rect.y + 0.5,
        Math.max(0, node.rect.w - 1),
        Math.max(0, node.rect.h - 1),
      );
      g.restore();
    }
  }
}

export interface OverlayOptions {
  selected?: PanelNode;
  hover?: PanelNode;
  /** Scene pixels per CSS pixel, so handles keep a constant on-screen size. */
  pxPerCss: number;
}

export const HANDLE_SIZE_CSS = 8;

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function handlePoints(r: PanelNode['rect']): Record<HandleId, [number, number]> {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return {
    nw: [r.x, r.y],
    n: [cx, r.y],
    ne: [r.x + r.w, r.y],
    e: [r.x + r.w, cy],
    se: [r.x + r.w, r.y + r.h],
    s: [cx, r.y + r.h],
    sw: [r.x, r.y + r.h],
    w: [r.x, cy],
  };
}

export function paintOverlay(g: CanvasRenderingContext2D, o: OverlayOptions): void {
  const k = o.pxPerCss;
  if (o.hover && o.hover !== o.selected) {
    const r = o.hover.rect;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = k;
    g.setLineDash([4 * k, 3 * k]);
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.restore();
  }
  if (o.selected) {
    const r = o.selected.rect;
    g.save();
    g.strokeStyle = 'rgb(255,140,40)';
    g.lineWidth = 2 * k;
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#fff';
    const s = HANDLE_SIZE_CSS * k;
    for (const [px, py] of Object.values(handlePoints(r))) {
      g.fillRect(px - s / 2, py - s / 2, s, s);
      g.strokeRect(px - s / 2, py - s / 2, s, s);
    }
    g.restore();
  }
}

/** Handle under a point (scene pixels), for resize drags. */
export function hitHandle(
  r: PanelNode['rect'],
  x: number,
  y: number,
  pxPerCss: number,
): HandleId | undefined {
  const s = (HANDLE_SIZE_CSS * pxPerCss) / 2 + pxPerCss * 2;
  for (const [id, [px, py]] of Object.entries(handlePoints(r)) as [HandleId, [number, number]][]) {
    if (Math.abs(x - px) <= s && Math.abs(y - py) <= s) return id;
  }
  return undefined;
}
