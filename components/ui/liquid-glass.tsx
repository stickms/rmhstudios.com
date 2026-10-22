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
  /** Compatibility alias for a signature surface; no SVG displacement. */
  refract?: boolean;
  /** Compatibility alias; every pane uses the new material. */
  liquid?: boolean;
}

const GlassPane: React.FC<GlassPaneProps> = ({
  interactive = false,
  refract = false,
  liquid = false,
  className,
  children,
  ...props
}) => (
  <div
    data-slot="glass-pane"
    data-liquid-surface={refract || liquid ? '' : undefined}
    className={cn(
      'glass-pane',
      interactive && 'glass-interactive',
      refract && 'glass-refract',
      liquid && 'glass-liquid',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export { GlassFilter, GlassPane };
export type { GlassPaneProps };
