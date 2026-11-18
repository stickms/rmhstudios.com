/**
 * Profile customization — equip the cosmetics purchased from the shop.
 *
 * Separate from Settings → Appearance on purpose: shop cosmetics are
 * profile-scoped (they recolor the owner's profile for everyone who visits it),
 * whereas the Appearance section controls the site-wide theme for this viewer.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, Sparkles } from 'lucide-react';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { profileLinksQuery } from '@/lib/profile-links/profile-links.queries';
import { ProfileLinksPanel } from '@/components/settings/ProfileLinksPanel';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ProfileCosmetics } from '@/components/settings/ProfileCosmetics';
import { useSession } from '@/components/Providers';
import { SettingsPageBody, SettingsSection } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useIdleReady } from '@/hooks/useIdleReady';

// P05 — pronouns, /now, Top Four, stamps, profile card… loaded after the page is idle.
import ProfilePlusSettings from '@/components/profile/plus/ProfilePlusSettings';
// P11 — opt-in birthday (G1).
import BirthdaySettings from '@/components/gifting/BirthdaySettings';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_site/settings/profile')({
  head: () => ({
    meta: [{ title: 'Profile customization | RMH Studios' }],
  }),
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, profileLinksQuery()),
  component: ProfileCustomizationPage,
});

function ProfileCustomizationPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;
  const idle = useIdleReady();
  const idleArrival = useArrival(idle);
  const handle = (session?.user as { handle?: string | null } | undefined)?.handle;

  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('profile-cosmetics-title', { defaultValue: 'Profile customization' });

  const signInPrompt = (
    <SignedOutPrompt
      icon={Sparkles}
      title={t('profile-cosmetics-signed-out', {
        defaultValue: 'Sign in to customize your profile.',
      })}
      callbackURL="/settings/profile"
    />
  );

  return (
    <PageLayout
      title={title}
      description={t('profile-settings-subtitle', {
        defaultValue: 'What everyone who visits your profile sees: your name, cosmetics, links and more.',
      })}
      wide
      // Back to your own profile when we know the handle — that's what these
      // cosmetics change — otherwise up to the settings hub.
      backTo={handle ? `/u/${handle}` : '/settings'}
      backLabel={handle ? t('profile-cosmetics-back', { defaultValue: 'Profile' }) : settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {signedIn && handle ? (
          <SettingsSection
            title={t('profile-basics-title', { defaultValue: 'Name, bio and avatar' })}
          >
            <Link
              to="/u/$userid"
              params={{ userid: handle }}
              search={{ edit: 1 }}
              className="settings-row"
            >
              <span className="settings-row__text">
                <span className="settings-row__name block">
                  {t('profile-basics-edit', { defaultValue: 'Edit on your profile' })}
                </span>
                <span className="settings-row__hint block">
                  {t('profile-basics-hint', {
                    defaultValue: 'Opens the editor on your public page, where you see the result.',
                  })}
                </span>
              </span>
              <ChevronRight className="settings-row__mark rtl:-scale-x-100" aria-hidden />
            </Link>
          </SettingsSection>
        ) : null}
        {!isPending && !signedIn ? signInPrompt : <ProfileCosmetics />}
        {signedIn ? <ProfileLinksPanel handle={handle ?? null} /> : null}
        {/* No box (display: contents): the idle-deferred sections fade in (M9). */}
        <div className={cn('contents', idleArrival && 'arrive-group')}>
          {signedIn && idle ? <ProfilePlusSettings /> : null}
          {signedIn && idle ? <BirthdaySettings /> : null}
        </div>
      </SettingsPageBody>
    </PageLayout>
  );
}
