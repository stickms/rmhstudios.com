'use client';

import { cn } from '@/lib/utils';

interface RadialLoaderProps {
  /** Pixel size of the loader box (default 24). */
  size?: number;
  className?: string;
  /** Accessible label; omit only when a parent already announces the wait. */
  label?: string;
  /** Drop `role="status"` when an ancestor already owns the live region. */
  decorative?: boolean;
}

/**
 * The site's loading mark: the radial language in miniature.
 *
 * Blobs orbit a pulsing core the way the hub's wedges bloom around the RMH orb,
 * so a wait reads as the same material as the rest of the UI rather than a
 * generic spinner. Inside the radial shell the whole thing runs through the goo
 * filter (see `radial.css`), which fuses the orbiting blobs into the core with
 * stretched liquid necks; anywhere else — games, `/login`, legal pages, which are
 * outside the shell and so have no filter defs — it degrades to the same motion
 * with crisp blobs. Colour comes from `currentColor`, so it inherits whatever
 * context it lands in.
 *
 * Reduced motion is handled in CSS: the orbit and pulse stop and the mark holds
 * as a static ring, so the element still reads as "busy" without animation.
 */
export function RadialLoader({ size = 24, className, label, decorative }: RadialLoaderProps) {
  return (
    <span
      className={cn('rad-loader', className)}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : (label ?? 'Loading')}
      aria-hidden={decorative || undefined}
    >
      <span className="rad-loader__core" />
      {[0, 1, 2].map((i) => (
        <span key={i} className="rad-loader__blob" style={{ ['--i' as string]: i }} />
      ))}
    </span>
  );
}
