/**
 * Profile customization — equip the cosmetics purchased from the shop.
 *
 * Separate from Settings → Appearance on purpose: shop cosmetics are
 * profile-scoped (they recolor the owner's profile for everyone who visits it),
 * whereas the Appearance section controls the site-wide theme for this viewer.
 */

import { createFileRoute } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ProfileCosmetics } from '@/components/settings/ProfileCosmetics';
import { useSession } from '@/components/Providers';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useIdleReady } from '@/hooks/useIdleReady';

// P05 — pronouns, /now, Top Four, stamps, profile card… loaded after the page is idle.
import ProfilePlusSettings from '@/components/profile/plus/ProfilePlusSettings';
// P11 — opt-in birthday (G1).
import BirthdaySettings from '@/components/gifting/BirthdaySettings';

export const Route = createFileRoute('/_site/settings/profile')({
  head: () => ({
    meta: [{ title: 'Profile customization | RMH Studios' }],
  }),
  component: ProfileCustomizationPage,
});

function ProfileCustomizationPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;
  const idle = useIdleReady();
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
      description={t('profile-cosmetics-subtitle', {
        defaultValue:
          'Equip the cosmetics you own from the shop. These apply to your profile — everyone who visits it sees them.',
      })}
      wide
      // Back to your own profile when we know the handle — that's what these
      // cosmetics change — otherwise up to the settings hub.
      backTo={handle ? `/u/${handle}` : '/settings'}
      backLabel={handle ? t('profile-cosmetics-back', { defaultValue: 'Profile' }) : settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {!isPending && !signedIn ? signInPrompt : <ProfileCosmetics />}
        {signedIn && idle ? <ProfilePlusSettings /> : null}
        {signedIn && idle ? <BirthdaySettings /> : null}
      </SettingsPageBody>
    </PageLayout>
  );
}
