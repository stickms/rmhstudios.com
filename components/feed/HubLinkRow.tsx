'use client';

import { Link } from '@tanstack/react-router';
import { ArrowRight, type LucideIcon } from 'lucide-react';

/**
 * One destination on a hub page (/services, /ventures): icon, name, one line,
 * and the whole card is the link.
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
    'glass-fill glass-interactive group flex items-start gap-4 rounded-site p-4 sm:p-5';
  const body = (
    <>
      <span className="glass-fill flex size-11 shrink-0 items-center justify-center rounded-site-sm text-site-accent">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold tracking-[-0.015em] text-site-text">
          {title}
        </span>
        <span className="mt-1 block text-sm text-site-text-muted">{description}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-site-text-dim transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
        aria-hidden
      />
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
