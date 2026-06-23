/**
 * RMH Capital layout shell — scopes the design system under `.rmhc-root`,
 * renders the shared nav + footer, and drives the scroll-reveal animation.
 */
import { Outlet, useRouterState } from '@tanstack/react-router';
import { TopNav, SiteFooter, useReveal } from './shared';

export default function RmhCapitalLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useReveal(pathname);

  return (
    <div className="rmhc-root">
      <TopNav />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
