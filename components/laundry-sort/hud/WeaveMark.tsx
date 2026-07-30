'use client';

/**
 * The weave glyph, in the DOM.
 *
 * The same four marks the bins and the fabric carry, so the legend, the HUD and
 * the results all name a wash the way the 3D scene does. Colour is never the
 * only channel: every mark is a distinct shape.
 */

import type { WeaveId } from '@/lib/laundry-sort/constants';

interface Props {
  weave: WeaveId;
  color: string;
  size?: number;
  className?: string;
}

export function WeaveMark({ weave, color, size = 16, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {weave === 'solid' ? <circle cx="8" cy="8" r="6.5" fill={color} /> : null}
      {weave === 'stripe' ? (
        <>
          <rect x="1" y="2" width="14" height="3" fill={color} />
          <rect x="1" y="6.5" width="14" height="3" fill={color} />
          <rect x="1" y="11" width="14" height="3" fill={color} />
        </>
      ) : null}
      {weave === 'check' ? (
        <>
          <rect x="1" y="1" width="6.5" height="6.5" fill={color} />
          <rect x="8.5" y="8.5" width="6.5" height="6.5" fill={color} />
        </>
      ) : null}
      {weave === 'dot' ? (
        <>
          <circle cx="5" cy="5" r="2.6" fill={color} />
          <circle cx="11" cy="5" r="2.6" fill={color} />
          <circle cx="5" cy="11" r="2.6" fill={color} />
          <circle cx="11" cy="11" r="2.6" fill={color} />
        </>
      ) : null}
    </svg>
  );
}
