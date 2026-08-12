/**
 * RMH PMC layout shell — scopes the design system under `.rmhp-root`,
 * renders the command bar, the document gutter, and the footer.
 *
 * The scroll-reveal used to be driven from here (`useReveal(pathname)`); it is
 * now a scroll-driven CSS animation in rmh-pmc.css, so there is nothing to
 * drive. See docs/performance-audit-2026-08-12.md §1.4.
 */
import { Outlet } from '@tanstack/react-router';
import { CommandBar, Gutter, SiteFooter } from './shared';

export default function RmhPmcLayout() {
  return (
    <div className="rmhp-root">
      <CommandBar />
      <Gutter />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
