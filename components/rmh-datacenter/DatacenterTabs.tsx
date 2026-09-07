'use client';

/**
 * The RMH Datacenter sub-nav.
 *
 * LiquidTabs LINK mode (§16.2), like `StudyTabs` and the RMHLadder sub-nav: the
 * six pages stay separate routes because each is separately indexable with its
 * own canonical and description, and a strip that switches routes is navigation
 * rather than a radiogroup — so real `<Link>`s with `aria-current="page"`, not
 * `role="tab"`/`aria-selected`.
 *
 * The tabs carry no icon, which is the one place this strip differs from the
 * tabbed pages beside it. Six route tabs is at the top of what the column
 * holds: with an icon each segment leaves about 75px of label, and the active
 * tab's weight tips "Facilities" into an ellipsis — a nav item reading
 * "Faciliti…" costs more than the icon earns. `LiquidTabs` takes label-only
 * tabs natively, so the sheet, capsule and morph are unchanged.
 *
 * This replaces the bespoke sticky command bar the section shipped with. That
 * bar was a second, private answer to a question `PageTabs` already answers for
 * every other section of the site, and it drifted the moment it existed: its
 * own height, its own gutter, its own idea of what "active" looks like.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageTabs } from '@/components/feed/PageTabs';
import type { LiquidTab } from '@/components/ui/liquid-tabs';

export type DatacenterRoute =
  | '/rmh-datacenter'
  | '/rmh-datacenter/facilities'
  | '/rmh-datacenter/platform'
  | '/rmh-datacenter/network'
  | '/rmh-datacenter/power'
  | '/rmh-datacenter/contact';

export function DatacenterTabs({ active }: { active: DatacenterRoute }) {
  const { t } = useTranslation('c-rmh-datacenter');

  const tabs: LiquidTab[] = [
    { id: '/rmh-datacenter', label: t('tab-overview', { defaultValue: 'Overview' }) },
    {
      id: '/rmh-datacenter/facilities',
      label: t('tab-facilities', { defaultValue: 'Facilities' }),
    },
    {
      id: '/rmh-datacenter/platform',
      label: t('tab-platform', { defaultValue: 'Platform' }),
    },
    {
      id: '/rmh-datacenter/network',
      label: t('tab-network', { defaultValue: 'Network' }),
    },
    { id: '/rmh-datacenter/power', label: t('tab-power', { defaultValue: 'Power' }) },
    {
      id: '/rmh-datacenter/contact',
      label: t('tab-contact', { defaultValue: 'Contact' }),
    },
  ];

  return (
    <PageTabs
      tabs={tabs}
      value={active}
      aria-label={t('tabs-aria-label', { defaultValue: 'RMH Datacenter' })}
      renderTab={(tab, props) => (
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
