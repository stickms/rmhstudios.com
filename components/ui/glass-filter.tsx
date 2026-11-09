import React from 'react';

/** The SVG host is used ONLY by tab capsule merging, not by glass optics. */
export const GlassFilter: React.FC = () => (
  <svg id="glass-filters" width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <filter id="glass-goo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 16 -6" />
    </filter>
  </svg>
);
