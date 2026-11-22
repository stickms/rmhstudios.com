/** See your profile as others see it: personal, so noindex and not in the sitemap's public map. */

import { createFileRoute } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ProfilePreview } from '@/components/settings/ProfilePreview';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/preview')({
  head: () => noindexHead('Profile preview'),
  component: ProfilePreviewPage,
});

function ProfilePreviewPage() {
  const { t } = useTranslation('profile-preview');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('page-title', { defaultValue: 'See your profile as others do' });
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue:
          'Your header and first posts as someone signed out, or signed in without following you, would see them.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={Eye}
            title={t('signed-out', { defaultValue: 'Sign in to preview your profile.' })}
            callbackURL="/settings/preview"
          />
        ) : (
          <ProfilePreview />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
