/**
 * Profile customization — equip the cosmetics purchased from the shop.
 *
 * Separate from Settings → Appearance on purpose: shop cosmetics are
 * profile-scoped (they recolor the owner's profile for everyone who visits it),
 * whereas the Appearance section controls the site-wide theme for this viewer.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ProfileCosmetics } from '@/components/settings/ProfileCosmetics';
import { useSession } from '@/components/Providers';

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
  const handle = (session?.user as { handle?: string | null } | undefined)?.handle;

  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('profile-cosmetics-title', { defaultValue: 'Profile customization' });

  const signInPrompt = (
    <p className="text-sm text-site-text-muted">
      <Link
        to="/login"
        search={{ callbackURL: '/settings/profile' }}
        className="text-site-accent hover:underline"
      >
        {t('settings-sign-in', { defaultValue: 'Sign in' })}
      </Link>{' '}
      {t('settings-sign-in-rest', { defaultValue: 'to manage this section.' })}
    </p>
  );

  return (
    <PageLayout
      title={title}
      wide
      // Back to your own profile when we know the handle — that's what these
      // cosmetics change — otherwise up to the settings hub.
      backTo={handle ? `/u/${handle}` : '/settings'}
      backLabel={handle ? t('profile-cosmetics-back', { defaultValue: 'Profile' }) : settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-site-text-muted">
          {t('profile-cosmetics-subtitle', {
            defaultValue:
              'Equip the cosmetics you own from the shop. These apply to your profile — everyone who visits it sees them.',
          })}
        </p>
        {!isPending && !signedIn ? signInPrompt : <ProfileCosmetics />}
      </div>
    </PageLayout>
  );
}
