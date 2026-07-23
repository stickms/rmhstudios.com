import { DEFAULT_WIDTH } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  targetWidth?: number;
}

export function AnimatedMain({
  children,
  className,
  targetWidth = DEFAULT_WIDTH,
}: AnimatedMainProps) {
  // A plain layout column, NOT a landmark: the `_site` shell already renders
  // the single <main id="main-content"> skip-link target around its Outlet.
  return (
    <div
      data-slot="site-main-column"
      className={className}
      style={{
        width: '100%',
        maxWidth: targetWidth,
        flexBasis: targetWidth,
        flexShrink: 1,
      }}
    >
      {children}
    </div>
  );
}
