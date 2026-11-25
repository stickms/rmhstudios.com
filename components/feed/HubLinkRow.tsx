import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

/**
 * One destination on a hub page (/services, /ventures): icon, name, one line,
 * and the whole row is the link.
 *
 * The hubs used to put each destination behind a tab and show one summary card
 * at a time, so five of six were hidden on every visit and the tab labels —
 * product names — could not fit a segmented control. A hub's job is to show what
 * is there, so they list every destination with this row instead (UI minimalism
 * audit, 2026-10-09). One component so the two hubs cannot drift apart.
 */
export function HubLinkRow({
  href,
  external,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  /** A destination served outside the router (a standalone HTML landing page). */
  external?: boolean;
  icon: LucideIcon;
  /** Already translated. */
  title: string;
  /** Already translated. */
  description: string;
}) {
  const className =
'row-hover hub-link-row group flex min-w-0 flex-1 items-start gap-4 py-2';
  const body = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-site-sm text-site-accent">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold tracking-[-0.015em] text-site-text">
          {title}
        </span>
        <span className="mt-1 block text-sm text-site-text-muted">{description}</span>
      </span>
    </>
  );

  return external ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <Link to={href} className={className}>
      {body}
    </Link>
  );
}
