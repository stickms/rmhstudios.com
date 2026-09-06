'use client';

/**
 * A campus's hall, drawn.
 *
 * The lines are a projection of the real lofted surface from
 * `lib/datacenter/hall-hull.ts` — the same `lib/loft/grid.ts` the RMH family of
 * cars and the RMH Fashion figure are built from, closed at both ends so it is
 * one genus-0 surface. So this is not a picture of a building shaped like the
 * spec; it IS the spec, seen from a decided angle.
 *
 * ## Why it is SVG and not the glass stage
 *
 * The cars and the wardrobe get a WebGL turntable because turning them is the
 * point — you are choosing a car, or dressing a figure. A hall is not chosen
 * and not dressed, and `routeTree.gen.ts` imports every route module
 * statically, so anything a content page reaches at the top level lands in the
 * chunk every page of the site loads. A three.js turntable here would cost the
 * whole site a vendor chunk to rotate a shed.
 *
 * What it keeps from the glass is the part that carries meaning: the three ink
 * tiers of the cage (majors, bays, runs), and depth — the far side of the hull
 * is drawn weaker than the near side, which is how the material reads as one
 * volume rather than as a flat net. Colour comes from `--site-*`, so it is the
 * page's accent in every theme rather than a palette of its own.
 */

import { useMemo } from 'react';
import { hallWireframe, type HallSpec } from '@/lib/datacenter/hall-hull';

interface HallDiagramProps {
  spec: HallSpec;
  /** The accessible description — what this hall is. Already translated. */
  label: string;
  className?: string;
}

/** Ink per tier: [stroke width, opacity at the near limb]. */
const TIERS: Record<string, [number, number]> = {
  major: [3.4, 1],
  bay: [2, 0.72],
  run: [1.6, 0.44],
};

export function HallDiagram({ spec, label, className }: HallDiagramProps) {
  const wf = useMemo(() => hallWireframe(spec), [spec]);

  return (
    <svg
      viewBox={wf.viewBox}
      className={className}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {wf.wires.map((w, i) => {
        const [width, peak] = TIERS[w.kind];
        return (
          <polyline
            key={i}
            points={w.points}
            fill="none"
            stroke="currentColor"
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Depth, not decoration: the far side of the hull is the same ink
            // at a third of the strength, which is what the glass does at the
            // limb and the only reason the net reads as a solid.
            strokeOpacity={(peak * (0.42 + 0.58 * w.depth)).toFixed(3)}
          />
        );
      })}
    </svg>
  );
}
