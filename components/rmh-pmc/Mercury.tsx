/**
 * <Mercury/> — the stage's liquid metal (renderer: ./mercury-renderer.ts). Decorative:
 * `aria-hidden`, never the only carrier of meaning. `orb` sits in the reticle as
 * its hub; `drip` is a full-width edge that sheds droplets over the next section.
 * Without WebGL the host keeps `.obj-mercury.is-fallback`, a static chrome ball.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { mountMercury, type MercuryMode } from './mercury-renderer';

export function Mercury({
  mode = 'orb',
  seed,
  blobs,
  className = '',
  style,
}: {
  mode?: MercuryMode;
  seed?: number;
  blobs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    return mountMercury(el, { mode, seed, blobs });
  }, [mode, seed, blobs]);
  return <div ref={host} className={`obj-mercury obj-mercury--${mode} ${className}`.trim()} style={style} aria-hidden="true" />;
}
