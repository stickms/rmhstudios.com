import { lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { focusSetting } from '@/lib/settings/focus-setting';

// Each section is its own chunk, fetched when its tab is first opened.
const IdentitySettings = lazy(() => import('./settings/IdentitySettings'));
const TopFourSettings = lazy(() => import('./settings/TopFourSettings'));
const StampSettings = lazy(() => import('./settings/StampSettings'));
const ShareSettings = lazy(() => import('./settings/ShareSettings'));

type Section = 'about' | 'top-four' | 'stamps' | 'share';

/**
 * Where a `#hash` on this page points: the tab it lives in. The id is the element to scroll to; the section's own
 * wrapper carries `plus-<section>`, and `plus-now` and the like are fields inside the About tab.
 */
function sectionForHash(hash: string): Section | null {
  const id = hash.replace(/^#/, '');
  if (!id.startsWith('plus-')) return null;
  if (id === 'plus-top-four') return 'top-four';
  if (id === 'plus-stamps') return 'stamps';
  if (id === 'plus-share') return 'share';
  return 'about';
}

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

  // An edit link from the profile arrives as `/settings/profile#plus-now`: open that tab, then scroll to and briefly
  // tint the setting so it is obvious where to type.
  useEffect(() => {
    let stop: (() => void) | undefined;
    const go = () => {
      stop?.();
      const hash = window.location.hash;
      const target = sectionForHash(hash);
      if (!target) return;
      setSection(target);
      stop = focusSetting(hash.slice(1));
    };
    go();
    window.addEventListener('hashchange', go);
    return () => {
      stop?.();
      window.removeEventListener('hashchange', go);
    };
  }, []);
  const user = session?.user as
    | {
        id: string;
        handle?: string | null;
      }
    | undefined;
  if (!user) return null;

  return (
    <SettingsSection
      title={t('plus-title', {
        defaultValue: 'More about you',
      })}
      description={t('plus-subtitle', {
        defaultValue: 'Everything here is optional, and each piece appears on your profile only once you set it.',
      })}
    >
      <Tabs
        aria-label={t('plus-sections', {
          defaultValue: 'Profile sections',
        })}
        tabs={[
          {
            id: 'about',
            label: t('tab-about', {
              defaultValue: 'About you',
            }),
          },
          {
            id: 'top-four',
            label: t('tab-top-four', {
              defaultValue: 'Top four',
            }),
          },
          {
            id: 'stamps',
            label: t('tab-stamps', {
              defaultValue: 'Stamps',
            }),
          },
          {
            id: 'share',
            label: t('tab-share', {
              defaultValue: 'Card & rings',
            }),
          },
        ]}
        value={section}
        onChange={(id) => setSection(id as Section)}
      />

      <div id={`plus-${section}`}>
        <ArrivalSuspense fallback={<Skeleton className="h-48 w-full" />}>
          {section === 'about' ? <IdentitySettings userId={user.id} /> : null}
          {section === 'top-four' ? <TopFourSettings /> : null}
          {section === 'stamps' ? <StampSettings userId={user.id} /> : null}
          {section === 'share' ? <ShareSettings handleOrId={user.handle || user.id} /> : null}
        </ArrivalSuspense>
      </div>
    </SettingsSection>
  );
}
