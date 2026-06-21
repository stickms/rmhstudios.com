/**
 * RMH PMC layout shell — scopes the design system under `.rmhp-root`,
 * renders the shared nav + footer, and drives the scroll-reveal animation.
 */
import { Outlet, useRouterState } from '@tanstack/react-router';
import { TopNav, SiteFooter, FloatBack, useReveal } from './shared';

export default function RmhPmcLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useReveal(pathname);

  return (
    <div className="rmhp-root">
      <TopNav />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
      <FloatBack />
    </div>
  );
}
