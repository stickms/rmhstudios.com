/**
 * A vehicle's side elevation, drawn from the same sections the 3D hull is lofted
 * from (`lib/rideshare/car-hull` §the side elevation).
 *
 * It is the fleet picker's thumbnail AND the stage's fallback, which is why it
 * is an SVG and not a second canvas: seven WebGL contexts on one page would be
 * absurd (browsers cap the live count at around sixteen and evict the oldest),
 * and a machine with no WebGL at all still has to be able to see the family.
 *
 * Two framings, one drawing:
 *  - `frame="body"` fits the vehicle to the box — what a picker card wants,
 *    where every option should be legible at the same size.
 *  - `frame="fleet"` uses one box for every vehicle — what the line-up wants,
 *    where the whole point is that the bike is a fifth of the helicopter.
 */

import { useMemo } from 'react';
import type { CarBodySpec } from '@/lib/rideshare/cars';
import { FLEET_VIEW_BOX, buildSilhouette } from '@/lib/rideshare/car-hull';

interface CarSilhouetteProps {
  spec: CarBodySpec;
  frame: 'body' | 'fleet';
  className?: string;
  /**
   * An accessible name. Omit for a purely decorative drawing — it is then
   * hidden from assistive tech, which is right whenever the label beside it
   * already says which vehicle this is.
   */
  title?: string;
}

/** Breathing room around a body-framed silhouette, as a fraction of its length. */
const PAD = 0.06;

export function CarSilhouette({ spec, frame, className, title }: CarSilhouetteProps) {
  const { outline, wheels, rotor, viewBox } = useMemo(() => {
    const s = buildSilhouette(spec);
    const pad = spec.length * PAD;
    return {
      ...s,
      viewBox:
        frame === 'fleet'
          ? FLEET_VIEW_BOX
          : `${s.box.x - pad} ${s.box.y - pad} ${s.box.width + pad * 2} ${s.box.height + pad * 2}`,
    };
  }, [spec, frame]);

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {/* `non-scaling-stroke` on every shape, and stroke widths in RENDERED
          pixels rather than metres. Without it the width is a length in model
          space and the viewBox fit scales it: a 1.9 m bike blown up to fill a
          card would be drawn with a stroke five times a 6.4 m helicopter's, and
          the picker would look like seven drawings by seven people. */}
      <path
        d={outline}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={1.25}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {rotor && (
        <g stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} strokeLinecap="round">
          <line
            x1={rotor.x1}
            y1={rotor.y}
            x2={rotor.x2}
            y2={rotor.y}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={rotor.mastX}
            y1={rotor.y}
            x2={rotor.mastX}
            y2={rotor.mastY}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {wheels.map((w, i) => (
        <circle
          key={i}
          cx={w.cx}
          cy={w.cy}
          r={w.r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeWidth={1.1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
