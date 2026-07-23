import { DEFAULT_WIDTH } from'@/lib/layout-width';

interface AnimatedMainProps {
 children: React.ReactNode;
 className?: string;
}

export function AnimatedMain({
 children,
 className,
}: AnimatedMainProps) {
 // A plain layout column, NOT a landmark: the `_site`shell already renders the
 // single `<main id="main-content">`(skip-link target) around its Outlet, so a
 // <main> here would nest mains and duplicate the id. (RoutePending's skeleton
 // makes the same choice.)
 return (
 <div data-slot="site-main-column" className={className} style={{ maxWidth: DEFAULT_WIDTH }}>
 {children}
 </div>
 );
}
