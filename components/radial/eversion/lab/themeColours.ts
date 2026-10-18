import type { Rgba, ThemeColours } from '@/lib/eversion/types';

/**
 * Resolve a CSS custom property (including `color-mix`) to straight sRGB 0..1
 * by painting it on a 1x1 canvas. The lab's stand-in for the controller's
 * per-navigation colour resolution (spec §10.2).
 */
function resolve(
  ctx: CanvasRenderingContext2D,
  probe: HTMLElement,
  cssVar: string,
  fallback: Rgba,
): Rgba {
  probe.style.color = '';
  probe.style.color = `var(${cssVar})`;
  const value = getComputedStyle(probe).color;
  if (!value) return fallback;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const a = d[3]! / 255;
  if (a === 0) return [0, 0, 0, 0];
  return [d[0]! / 255, d[1]! / 255, d[2]! / 255, a];
}

/** Composite `top` over an opaque `under`; the result is opaque. */
function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
}

/** Read the active theme's globe colours from the document's computed styles. */
export function readThemeColours(): ThemeColours {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const probe = document.createElement('div');
  probe.style.display = 'none';
  document.documentElement.appendChild(probe);
  try {
    const bg = over(resolve(ctx, probe, '--site-bg', [1, 1, 1, 1]), [1, 1, 1, 1]);
    const accent = resolve(ctx, probe, '--site-accent', [0.2, 0.4, 1, 1]);
    const ink = resolve(ctx, probe, '--site-text', [0, 0, 0, 1]);
    const cage = (name: string, alpha: number): Rgba => {
      const c = resolve(ctx, probe, name, [ink[0], ink[1], ink[2], alpha]);
      return c[3] > 0 ? c : [ink[0], ink[1], ink[2], alpha];
    };
    return {
      bg,
      veil: over([bg[0], bg[1], bg[2], 0.55], bg),
      accent,
      cageMinor: cage('--cage-minor', 0.2),
      cageParallel: cage('--cage-parallel', 0.35),
      cageMajor: cage('--cage-major', 0.55),
      cageRipple: cage('--cage-ripple', 0.7),
      cageWidth: 1,
    };
  } finally {
    probe.remove();
  }
}
