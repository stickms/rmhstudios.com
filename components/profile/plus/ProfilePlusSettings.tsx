'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/components/Providers';

// Each section is its own chunk, fetched when its tab is first opened.
const IdentitySettings = lazy(() => import('./settings/IdentitySettings'));
const TopFourSettings = lazy(() => import('./settings/TopFourSettings'));
const StampSettings = lazy(() => import('./settings/StampSettings'));
const ShareSettings = lazy(() => import('./settings/ShareSettings'));

type Section = 'about' | 'top-four' | 'stamps' | 'share';

/**
 * Settings → Profile → "More about you": the editors for the profile extras —
 * pronouns, pronunciation, local time, /now, the visitor counter and skills
 * (P2, P3, P4, P8, P9), Top Four (P1), the stamp wall (P5) and the profile card
 * and webrings (P10, P6). Mounted lazily by the profile settings page.
 */
export default function ProfilePlusSettings() {
  const { t } = useTranslation('f-profile-plus');
  const { data: session } = useSession();
  const [section, setSection] = useState<Section>('about');
  const user = session?.user as { id: string; handle?: string | null } | undefined;
  if (!user) return null;

  return (
    <section className="space-y-4" aria-labelledby="profile-plus-title">
      <div>
        <h2 id="profile-plus-title" className="font-display text-lg font-bold text-site-text">
          {t('plus-title', { defaultValue: 'More about you' })}
        </h2>
        <p className="mt-1 text-sm text-site-text-muted">
          {t('plus-subtitle', {
            defaultValue:
              'Everything here is optional, and each piece appears on your profile only once you set it.',
          })}
        </p>
      </div>

      <LiquidTabs
        aria-label={t('plus-sections', { defaultValue: 'Profile sections' })}
        tabs={[
          { id: 'about', label: t('tab-about', { defaultValue: 'About you' }) },
          { id: 'top-four', label: t('tab-top-four', { defaultValue: 'Top four' }) },
          { id: 'stamps', label: t('tab-stamps', { defaultValue: 'Stamps' }) },
          { id: 'share', label: t('tab-share', { defaultValue: 'Card & rings' }) },
        ]}
        value={section}
        onChange={(id) => setSection(id as Section)}
      />

      <div className="glass-pane rounded-site p-4 sm:p-5">
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          {section === 'about' ? <IdentitySettings userId={user.id} /> : null}
          {section === 'top-four' ? <TopFourSettings /> : null}
          {section === 'stamps' ? <StampSettings userId={user.id} /> : null}
          {section === 'share' ? <ShareSettings handleOrId={user.handle || user.id} /> : null}
        </Suspense>
      </div>
    </section>
  );
}
