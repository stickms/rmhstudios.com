/**
 * RmhLadderShell — Layout wrapper for the RMH Ladder dashboard.
 *
 * Left-rail ladder nav (220px) collapses to a sticky top bar under 900px.
 * Nav items are rungs bridging two 2px --ink vertical rails.
 */

import { Link, useRouterState } from '@tanstack/react-router';

const NAV_ITEMS = [
  { label: 'Overview',  to: '/rmhladder' },
  { label: 'Jobs',      to: '/rmhladder/jobs' },
  { label: 'Pipeline',  to: '/rmhladder/pipeline' },
  { label: 'Review',    to: '/rmhladder/review' },
  { label: 'Companies', to: '/rmhladder/companies' },
  { label: 'Alerts',    to: '/rmhladder/alerts' },
  { label: 'Settings',  to: '/rmhladder/settings' },
  { label: 'Health',    to: '/rmhladder/health' },
] as const;

export default function RmhLadderShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function isActive(to: string) {
    if (to === '/rmhladder') return pathname === '/rmhladder' || pathname === '/rmhladder/';
    return pathname.startsWith(to);
  }

  return (
    <div className="rmhladder rl-shell">
      {/* Top bar (mobile / narrow) */}
      <nav className="rl-topbar" aria-label="RMH Ladder navigation">
        <span className="rl-topbar__brand">RMH Ladder</span>
        {NAV_ITEMS.map(({ label, to }) => (
          <Link
            key={to}
            to={to}
            className="rl-topbar__rung"
            data-active={isActive(to) ? 'true' : undefined}
          >
            {label}
          </Link>
        ))}
        <Link to="/" className="rl-topbar__rung rl-exit">
          ← RMH Studios
        </Link>
      </nav>

      {/* Ladder rail (desktop) */}
      <nav className="rl-rail" aria-label="RMH Ladder navigation">
        <div className="rl-rail__brand">RMH Ladder</div>
        <div className="rl-rail__nav">
          {NAV_ITEMS.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="rl-rung"
              data-active={isActive(to) ? 'true' : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
        <Link to="/" className="rl-rung rl-exit">
          ← RMH Studios
        </Link>
      </nav>

      {/* Content */}
      <main className="rl-content">
        <div className="rl-content__inner">{children}</div>
      </main>
    </div>
  );
}
