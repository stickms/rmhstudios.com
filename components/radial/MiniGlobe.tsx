'use client';

import { useId } from 'react';

/**
 * The docked orb's face: a small jelly globe — a lit sphere with a meridian and
 * parallel wireframe, the same object the orb swells into when it is tapped.
 *
 * Drawn in `currentColor` (the orb's accent-contrast ink) with the sphere's
 * shading carried by two gradient stops that read tokens in radial.css, so every
 * theme works. It is static: the globe it becomes owns all the motion.
 */
export function MiniGlobe({ className }: { className?: string }) {
  const id = useId();
  const body = `${id}-body`;
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <radialGradient id={body} cx="34%" cy="28%" r="78%">
          <stop offset="0" className="radial-hub__globe-lit" />
          <stop offset="1" className="radial-hub__globe-deep" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${body})`} />
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="32" cy="32" r="29" opacity="0.9" />
        <ellipse cx="32" cy="32" rx="29" ry="10" opacity="0.55" />
        <ellipse cx="32" cy="32" rx="10.5" ry="29" opacity="0.55" />
        <ellipse cx="32" cy="32" rx="21" ry="29" opacity="0.4" />
        <path d="M5.5 22h53M5.5 42h53" opacity="0.4" />
        <path d="M32 3v58" opacity="0.4" />
      </g>
    </svg>
  );
}
