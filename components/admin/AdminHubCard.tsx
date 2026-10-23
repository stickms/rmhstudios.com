import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

/**
 * One destination on the /admin dashboard: title, one line, whole card is the
 * link. Every admin entry point (including the per-feature `Admin*Link`
 * components) renders this so the grid cannot drift card to card.
 */
export function AdminHubCard({
  to,
  title,
  description,
  badge,
}: {
  to: string;
  /** Already translated. */
  title: string;
  /** Already translated. */
  description: string;
  /** Optional trailing count (e.g. open reports). */
  badge?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="glass-fill glass-interactive group flex min-w-0 items-start gap-3 rounded-site px-4 py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display text-base font-semibold text-site-text transition-colors duration-site-fast group-hover:text-site-accent">
          <span className="min-w-0">{title}</span>
          {badge}
        </span>
        <span className="mt-1 block text-sm text-site-text-muted">{description}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-site-text-dim transition-transform duration-site-fast group-hover:translate-x-0.5 rtl:-scale-x-100"
        aria-hidden
      />
    </Link>
  );
}
