'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/** The SVG host is used ONLY by tab capsule merging, not by glass optics. */
const GlassFilter: React.FC = () => (
  <svg id="glass-filters" width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <filter id="glass-goo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 16 -6" />
    </filter>
  </svg>
);

interface GlassPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hover and press response. */
  interactive?: boolean;
  /**
   * Refract the page behind the pane's rim. A pane is lit by default but does not bend the page: its own text is in the
   * page snapshot and would be drawn twice. Opt in for a pane that sits over imagery with nothing near its edge.
   * Sets `data-liquid-glass="refract"` (see `lib/liquid/glass/engine.ts`).
   */
  refract?: boolean;
  /** Retained alias: every pane is a shader slab; this has no effect of its own. */
  liquid?: boolean;
}

const GlassPane: React.FC<GlassPaneProps> = ({
  interactive = false,
  refract = false,
  // Kept so existing `<GlassPane liquid>` call sites still type-check; the slab needs no flag.
  liquid: _liquid = false,
  className,
  children,
  ...props
}) => (
  <div
    data-slot="glass-pane"
    data-liquid-glass={refract ? 'refract' : undefined}
    className={cn('glass-pane', interactive && 'glass-interactive', className)}
    {...props}
  >
    {children}
  </div>
);

export { GlassFilter, GlassPane };
export type { GlassPaneProps };
