'use client';

/**
 * StudioTabs — the Create hub's top-level strip.
 *
 * Each tab is its own **route** (`/create`, `/create/builds`,
 * `/create/personas`, `/create/earnings`) rather than a `?tab=` value on one
 * page. The surfaces behind them are whole destinations — a page generator, a
 * community catalog, a persona editor, an earnings dashboard — and a query
 * param made every one of them share a URL, a canonical, a title and a loader:
 * linking someone to Earnings meant sending `/create?tab=earnings`, and
 * `/create` paid for the Pages gallery no matter which tab you actually opened.
 *
 * So this is LiquidTabs LINK mode (§16.2), the same shape as `CatalogTabs` and
 * the RMHLadder sub-nav: real `<Link>` tabs, crawlable and prefetched, the
 * active one marked `aria-current="page"`. A strip that switches routes is
 * navigation, not a radiogroup, so it must not claim `role="tab"` /
 * `aria-selected` — which is also why the panels lost their `role="tabpanel"`
 * wiring in the split.
 */

import { Link } from '@tanstack/react-router';
import { FileText, Boxes, Bot, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageTabs } from '@/components/feed/PageTabs';
import type { LiquidTab } from '@/components/ui/liquid-tabs';

/** The tab paths, in strip order. `/create` is Pages — the hub's index. */
export const STUDIO_TAB_PATHS = [
  '/create',
  '/create/builds',
  '/create/personas',
  '/create/earnings',
] as const;
export type StudioTabPath = (typeof STUDIO_TAB_PATHS)[number];

export function StudioTabs({ active }: { active: StudioTabPath }) {
  const { t } = useTranslation('feed');

  const tabs: LiquidTab[] = [
    { id: '/create', label: t('studio-tab-pages', { defaultValue: 'Pages' }), icon: FileText },
    {
      id: '/create/builds',
      label: t('studio-tab-user-builds', { defaultValue: 'User Builds' }),
      icon: Boxes,
    },
    {
      id: '/create/personas',
      label: t('studio-tab-personas', { defaultValue: 'AI Personas' }),
      icon: Bot,
    },
    {
      id: '/create/earnings',
      label: t('studio-tab-earnings', { defaultValue: 'Earnings' }),
      icon: Coins,
    },
  ];

  return (
    <PageTabs
      tabs={tabs}
      value={active}
      aria-label={t('create', { defaultValue: 'Create' })}
      renderTab={(tab, props) => (
        // A bare <Link> wearing LiquidTabs' own tab class, so a route tab is
        // pixel-identical to every tablist-mode strip; `min-h-11` holds the 44px
        // touch target. `props.children` is the pre-composed icon + label.
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
