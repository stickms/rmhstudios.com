/**
 * Instrument and specimen icons for the panels: the same drawings the board uses (engine/art.ts), painted once
 * into a small canvas. Decorative: the name always sits beside it in text.
 */
import { useEffect, useRef } from 'react';
import { drawInstrument, drawSpecimen, SPECIMEN_LOOK } from '@features/vega/engine/art';
import type { EnemyType, TowerType } from '@features/vega/engine/data';

function useCanvas(size: number, paint: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    paint(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);
  return ref;
}

export function InstrumentGlyph({ type, size = 36, tier = 0 }: { type: TowerType; size?: number; tier?: number }) {
  const ref = useCanvas(size, (ctx) => drawInstrument(ctx, type, size / 2, size / 2, size * 0.9, { tier }), [type, tier]);
  return <canvas ref={ref} aria-hidden className="vg-glyph" style={{ width: size, height: size }} />;
}

export function SpecimenGlyph({ type, size = 36, hidden = false }: { type: EnemyType; size?: number; hidden?: boolean }) {
  const ref = useCanvas(
    size,
    (ctx) => {
      const scale = (size * 0.3) / SPECIMEN_LOOK[type].r;
      drawSpecimen(ctx, type, size / 2, size / 2, { scale, still: true, phase: 0.7, revealed: true, cloaked: hidden, shieldFrac: type === 'DOUBT' ? 1 : 0 });
    },
    [type, hidden],
  );
  return <canvas ref={ref} aria-hidden className="vg-glyph" style={{ width: size, height: size }} />;
}
