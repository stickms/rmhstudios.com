/**
 * A small rendering of a scheme border, drawn with the same code the preview uses.
 */
'use client';

import { useEffect, useRef } from 'react';
import { drawBorder } from '@/lib/tf2-hud/scene/paint';
import { resolveColor, type BorderDef, type Scheme } from '@/lib/tf2-hud/scheme/scheme';

export function BorderSwatch({ border, scheme }: { border: BorderDef; scheme: Scheme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgb(60 70 80)';
    g.fillRect(0, 0, c.width, c.height);
    const colors = (layers: BorderDef['left']) =>
      layers.map((l) => resolveColor(scheme, l.color) ?? { r: 0, g: 0, b: 0, a: 0 });
    drawBorder(g, {
      t: 'border',
      rect: { x: 4, y: 4, w: c.width - 8, h: c.height - 8 },
      border,
      scale: 1,
      colors: {
        left: colors(border.left),
        right: colors(border.right),
        top: colors(border.top),
        bottom: colors(border.bottom),
      },
    });
  }, [border, scheme]);
  return (
    <canvas
      ref={ref}
      width={96}
      height={48}
      className="shrink-0 rounded-(--app-radius-sm)"
      aria-hidden
    />
  );
}
