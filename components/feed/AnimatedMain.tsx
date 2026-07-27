import type { CSSProperties } from 'react';
import { DEFAULT_WIDTH } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  /**
   * The page's own preferred reading measure, in px. It is published as
   * `--main-target` rather than applied directly: the shell decides the real cap
   * per breakpoint (`--rad-main-cap` in radial.css), so a desktop window can give
   * the column more room than a 2019-era constant while phones and any context
   * without the radial shell still fall back to exactly this number.
   */
  targetWidth?: number;
  /** Space-filling pages (grids, boards, tables) take the whole content track. */
  wide?: boolean;
}

export function AnimatedMain({
  children,
  className,
  targetWidth = DEFAULT_WIDTH,
  wide,
}: AnimatedMainProps) {
  // A plain layout column, NOT a landmark: the `_site` shell already renders
  // the single <main id="main-content"> skip-link target around its Outlet.
  return (
    <div
      data-slot="site-main-column"
      data-wide={wide ? '' : undefined}
      className={className}
      style={{ ['--main-target' as string]: `${targetWidth}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
