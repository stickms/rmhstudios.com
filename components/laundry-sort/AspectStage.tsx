'use client';

/**
 * AspectStage — the locked 16:9 frame the whole game is played inside.
 *
 * Laundry Sort is a race, and in a 2.5D physics game the size of your window is
 * reach: on a free-flowing canvas a player on an ultrawide monitor sees more
 * arena, gets more warning about a falling garment, and can start a drag from
 * further out. That is the oldest way to cheat at this genre and it is a
 * leaderboard's problem, not a preference.
 *
 * So the playfield is presented at exactly {@link ASPECT}, letterboxed into
 * whatever space it is given, and the camera's aspect is pinned to the same
 * number (see `GameCanvas`). Everyone sees the same arena, on a phone in
 * portrait, a tablet, or a 32:9 monitor.
 *
 * Measured with a ResizeObserver rather than CSS `aspect-ratio` because the
 * children need the pixel size (the WebGL drawing buffer is sized from it, and
 * the pointer mapping reads it), and because `aspect-ratio` combined with both
 * `max-width` and `max-height` still resolves differently across browsers when
 * the container is the constrained axis.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ASPECT } from '@/lib/laundry-sort/constants';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** Rendered outside the frame, in the letterbox — never overlapping play. */
  outerChildren?: ReactNode;
  className?: string;
}

export interface StageSize {
  width: number;
  height: number;
}

export function AspectStage({ children, outerChildren, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      // clientWidth/Height are the padding box; subtracting the computed
      // padding gives the content box, which is what the safe-area insets have
      // already carved out for us.
      const style = window.getComputedStyle(element);
      const width0 =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height0 =
        element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const rect = { width: width0, height: height0 };
      if (rect.width <= 0 || rect.height <= 0) return;
      // The largest 16:9 box that fits — width-bound on a tall window,
      // height-bound on a wide one.
      const widthBound = rect.width / rect.height > ASPECT;
      const width = widthBound ? rect.height * ASPECT : rect.width;
      const height = widthBound ? rect.height : rect.width / ASPECT;
      setSize((prev) =>
        // Sub-pixel churn would resize the drawing buffer on every scroll of a
        // mobile URL bar, and a buffer reallocation is not free.
        Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Orientation changes on iOS report the pre-rotation size to
    // ResizeObserver, so re-measure once the viewport has settled.
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('ls-stage-frame relative h-full w-full overflow-hidden', className)}
    >
      {outerChildren}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          data-slot="laundry-stage"
          className="relative overflow-hidden rounded-site bg-black shadow-site"
          style={{ width: size.width || undefined, height: size.height || undefined }}
        >
          {size.width > 0 ? children : null}
        </div>
      </div>
    </div>
  );
}
