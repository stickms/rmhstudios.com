import { DEFAULT_WIDTH } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  targetWidth?: number;
}

export function AnimatedMain({ children, className, targetWidth = DEFAULT_WIDTH }: AnimatedMainProps) {
  // A plain layout column, NOT a landmark: the `_site` shell already renders the
  // single `<main id="main-content">` (skip-link target) around its Outlet, so a
  // <main> here would nest mains and duplicate the id. (RoutePending's skeleton
  // makes the same choice.)
  return (
    <div className={className} style={{ maxWidth: targetWidth }}>
      {children}
    </div>
  );
}
