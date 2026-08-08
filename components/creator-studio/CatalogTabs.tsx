'use client';

/**
 * CatalogTabs — the Games ⇄ Apps strip shared by `/games` and `/apps`.
 *
 * The two catalogs are one destination wearing two URLs: they render the same
 * `CuratedBuildsTab` off the same `listCuratedBuilds()` source, split only by
 * `kind`. Keeping them as separate routes is what makes each one indexable with
 * its own canonical and `ItemList` JSON-LD — but it also meant arriving at one
 * gave you no sign the other existed, and `/apps` in particular had no inbound
 * link anywhere in the running UI after `/create` dropped its Apps tab.
 *
 * So the crossing is a strip rather than a third hub page. A hub would have to
 * either duplicate both catalogs (thin duplication of two pages that already
 * rank) or summarize them and link out, which is a bounce page for content the
 * visitor came to browse. The strip costs no new URL, keeps both pages as the
 * real destination, and lets `SIDEBAR_NAV`'s single "Games & Apps" pin reach
 * both.
 *
 * It is LiquidTabs LINK mode (§16.2), like the RMHLadder sub-nav: real `<Link>`
 * tabs, so they are crawlable and prefetched and the active one is
 * `aria-current="page"` — a tab strip that switches routes is navigation, not a
 * radiogroup, so it must not claim `role="tab"`/`aria-selected`.
 */

import { Link } from '@tanstack/react-router';
import { AppWindow, Gamepad2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageTabs } from '@/components/feed/PageTabs';
import type { LiquidTab } from '@/components/ui/liquid-tabs';

export function CatalogTabs({ active }: { active: '/games' | '/apps' }) {
  const { t } = useTranslation('site');

  const tabs: LiquidTab[] = [
    { id: '/games', label: t('games-index-title', { defaultValue: 'Games' }), icon: Gamepad2 },
    { id: '/apps', label: t('apps-index-title', { defaultValue: 'Apps' }), icon: AppWindow },
  ];

  return (
    <PageTabs
      tabs={tabs}
      value={active}
      aria-label={t('catalog-tabs-aria-label', { defaultValue: 'Games and apps' })}
      renderTab={(tab, props) => (
        // A bare <Link> wearing LiquidTabs' own tab class, so a route tab is
        // pixel-identical to every tablist-mode strip; `min-h-11` holds the 44px
        // touch target. `props.children` is the pre-composed icon + label,
        // already at z-1 above the flowing capsule.
        <Link
          to={tab.id}
          id={props.id}
          aria-current={props['aria-current']}
          className={`${props.className} min-h-11`}
        >
          {props.children}
        </Link>
      )}
    />
  );
}
