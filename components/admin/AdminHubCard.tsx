import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

/**
 * One destination on the /admin dashboard: title, one line, the whole row is
 * the link. Every admin entry point (including the per-feature `Admin*Link`
 * components) renders this so the list cannot drift row to row.
 *
 * It is a row on a rule, not a card (R3): the name is kept because the
 * per-feature link components import it. The row sits flush with the page
 * gutter, so the target is the full width of the column on a phone.
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
    <Link to={to} className="group flex min-w-0 items-start gap-3 border-b border-site-border py-3">
      <span className="min-w-0 flex-1">
        <span className="t-heading flex items-center gap-2 text-site-text">
          <span className="min-w-0">{title}</span>
          {badge}
        </span>
        <span className="t-body mt-1 block text-site-text-muted">{description}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-site-text-muted transition-colors duration-site-fast group-hover:text-site-text rtl:-scale-x-100"
        aria-hidden
      />
    </Link>
  );
}
