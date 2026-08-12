/**
 * RMH Capital layout shell — scopes the design system under `.rmhc-root`,
 * renders the shared nav + footer.
 *
 * The scroll-reveal used to be driven from here (`useReveal(pathname)`); it is
 * now a scroll-driven CSS animation in rmh-capital.css. See
 * docs/performance-audit-2026-08-12.md §1.4.
 */
import { Outlet } from '@tanstack/react-router';
import { TopNav, SiteFooter } from './shared';

export default function RmhCapitalLayout() {
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
