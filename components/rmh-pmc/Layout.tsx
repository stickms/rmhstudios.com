/**
 * RMH PMC layout shell — scopes the design system under `.rmhp-root`,
 * renders the command bar, the document gutter, and the footer, and drives
 * the scroll-reveal animation.
 */
import { Outlet, useRouterState } from '@tanstack/react-router';
import { CommandBar, Gutter, SiteFooter, FloatBack, useReveal } from './shared';

export default function RmhPmcLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useReveal(pathname);

  return (
    <div className="rmhp-root">
      <CommandBar />
      <Gutter />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
      <FloatBack />
    </div>
  );
}
