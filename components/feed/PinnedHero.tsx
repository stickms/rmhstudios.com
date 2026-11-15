/**
 * PinnedHero: a page's lead block, flat. A headline, one supporting line and the actions, on the page ground
 * (Steel R1, R5: no atmosphere, no pinned scroll scene, no motion; the old version pinned a viewport-tall stage and
 * composed its type from scroll progress over a blurred radial glow).
 *
 * The name stays because its callers do (the membership panel, the shop, the storefront, recap, wrapped and the
 * long-form editorial pages). `as` is the heading level: pass `h2` on routes that already render their own h1
 * (PageLayout titles, ColumnHeaders) so the page keeps exactly one, see docs/page-consistency.md.
 */
import type { ReactNode } from 'react';

export interface PinnedHeroProps {
  /**
   * A short label above the headline. Optional, and usually better left out: where the hero sits under a page title
   * or a selected tab, it only repeats it.
   */
  eyebrow?: string;
  /** Headline (may include <br/> and an accent <span>). */
  title: ReactNode;
  /** Supporting line under the headline. */
  subtitle: string;
  /** Actions, set under the supporting line. */
  actions?: ReactNode;
  /** Heading level for the headline. Defaults to h1. */
  as?: 'h1' | 'h2';
}

export function PinnedHero({ eyebrow, title, subtitle, actions, as }: PinnedHeroProps) {
  const Heading = as === 'h2' ? 'h2' : 'h1';
  return (
    <div className="max-w-2xl py-6">
      {eyebrow && <p className="site-kicker mb-2">{eyebrow}</p>}
      <Heading className={as === 'h2' ? 't-heading' : 't-title'}>{title}</Heading>
      <p className="t-body mt-2 text-site-text-muted">{subtitle}</p>
      {actions && <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
