/**
 * The harness's two sample "pages" (T26), drawn on a canvas at runtime so no
 * binary asset ships. They are deliberately asymmetric so a mirror, a flip or a
 * quarter turn anywhere in the pipeline is obvious at a glance:
 *
 * - a header bar with the page's name at the TOP-LEFT,
 * - a big arrow pointing UP and one pointing RIGHT,
 * - a numbered 8x5 grid (cell 1 at the top-left),
 * - a column of text lines of decreasing length, left-aligned.
 *
 * BEFORE is cool-toned and says "BEFORE"; AFTER is warm-toned and says "AFTER".
 */

export type SampleKind = 'before' | 'after';

const PALETTE = {
  before: { bg: '#e8f0ff', bar: '#1d4ed8', ink: '#0f172a', grid: '#5b86e0', arrow: '#1d4ed8' },
  after: { bg: '#fff1e0', bar: '#c2410c', ink: '#1c1008', grid: '#e08a4a', arrow: '#c2410c' },
} as const;

function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  dir: 'up' | 'right',
) {
  const w = len * 0.22;
  ctx.save();
  ctx.translate(x, y);
  if (dir === 'right') ctx.rotate(Math.PI / 2);
  // Drawn pointing up from (0, 0) at its tail.
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2, -len * 0.6);
  ctx.lineTo(-w, -len * 0.6);
  ctx.lineTo(0, -len);
  ctx.lineTo(w, -len * 0.6);
  ctx.lineTo(w / 2, -len * 0.6);
  ctx.lineTo(w / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw one sample page at `w` x `h` pixels. */
export function drawSamplePage(kind: SampleKind, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const p = PALETTE[kind];
  const u = Math.min(w, h) / 100; // one "unit" scales the whole page

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  // Header bar + title (top-left).
  ctx.fillStyle = p.bar;
  ctx.fillRect(0, 0, w, 11 * u);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${6 * u}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${kind.toUpperCase()} PAGE`, 3 * u, 5.5 * u);
  ctx.textAlign = 'right';
  ctx.fillText('top right', w - 3 * u, 5.5 * u);
  ctx.textAlign = 'left';

  // Text lines, left-aligned, decreasing length.
  ctx.fillStyle = p.ink;
  ctx.font = `600 ${3.6 * u}px system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const lines = [
    'The quick brown fox',
    'jumps over the lazy dog',
    'left edge is the left',
    'short',
    'tiny',
  ];
  lines.forEach((line, i) => ctx.fillText(line, 3 * u, (19 + i * 6) * u));

  // Numbered grid, cell 1 at the top-left.
  const cols = 8;
  const rows = 5;
  const cw = Math.min(8 * u, (w - 6 * u) / cols);
  const ch = 8 * u;
  const gx = 3 * u;
  const gy = h - rows * ch - 3 * u;
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = Math.max(1, 0.5 * u);
  ctx.font = `600 ${2.8 * u}px system-ui, sans-serif`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.strokeRect(gx + c * cw, gy + r * ch, cw, ch);
      ctx.fillStyle = p.grid;
      ctx.fillText(String(r * cols + c + 1), gx + c * cw + 0.8 * u, gy + r * ch + 3.4 * u);
    }
  }

  // Big arrows: UP (right-hand side) and RIGHT (middle), each labelled.
  ctx.fillStyle = p.arrow;
  const big = Math.min(w, h) * 0.42;
  arrow(ctx, w * 0.78, h * 0.62, big, 'up');
  arrow(ctx, w * 0.36, h * 0.46, big, 'right');
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${3.6 * u}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('UP', w * 0.78, h * 0.66);
  ctx.textAlign = 'left';
  ctx.fillText('RIGHT', w * 0.36 + 2 * u, h * 0.46 - 2.5 * u);

  // A ring so any anisotropic stretch shows as an ellipse.
  ctx.strokeStyle = p.bar;
  ctx.lineWidth = 1 * u;
  ctx.beginPath();
  ctx.arc(w * 0.16, h * 0.62, 8 * u, 0, Math.PI * 2);
  ctx.stroke();

  return canvas;
}
