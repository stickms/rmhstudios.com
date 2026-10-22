'use client';

/** The mod tools tab: queue, AutoMod, flairs, settings, onboarding, related. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { ModAutomod } from '@/components/communities/ModAutomod';
import { ModFlairs } from '@/components/communities/ModFlairs';
import { ModOnboarding } from '@/components/communities/ModOnboarding';
import { ModQueue } from '@/components/communities/ModQueue';
import { ModSettings } from '@/components/communities/ModSettings';
import { ModSisters } from '@/components/communities/ModSisters';
import type { CommunityExtrasDTO } from '@/lib/communities/plus';

export default function ModPanel({
  slug,
  extras,
  onExtrasChange,
}: {
  slug: string;
  extras: CommunityExtrasDTO | null;
  onExtrasChange: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [sub, setSub] = useState('queue');
  const tabs: LiquidTab[] = [
    { id: 'queue', label: t('mod-queue', { defaultValue: 'Queue' }) },
    { id: 'automod', label: t('mod-automod', { defaultValue: 'AutoMod' }) },
    { id: 'flairs', label: t('mod-flairs', { defaultValue: 'Flairs' }) },
    { id: 'settings', label: t('mod-settings', { defaultValue: 'Posting rules' }) },
    { id: 'onboarding', label: t('mod-onboarding', { defaultValue: 'Onboarding' }) },
    { id: 'related', label: t('mod-related', { defaultValue: 'Related' }) },
  ];
  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <LiquidTabs
        tabs={tabs}
        value={sub}
        onChange={setSub}
        aria-label={t('mod-tools', { defaultValue: 'Mod tools' })}
      />
      {sub === 'queue' && <ModQueue slug={slug} />}
      {sub === 'automod' && <ModAutomod slug={slug} />}
      {sub === 'flairs' && (
        <ModFlairs slug={slug} flairs={extras?.flairs ?? []} onChange={onExtrasChange} />
      )}
      {sub === 'settings' && extras && (
        <ModSettings slug={slug} extras={extras} onChange={onExtrasChange} />
      )}
      {sub === 'onboarding' && (
        <ModOnboarding slug={slug} flairs={extras?.flairs ?? []} onChange={onExtrasChange} />
      )}
      {sub === 'related' && extras && (
        <ModSisters slug={slug} sisters={extras.sisters} onChange={onExtrasChange} />
      )}
    </div>
  );
}
