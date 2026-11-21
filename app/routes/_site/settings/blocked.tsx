/** Blocked and muted: the member's own block and mute lists, with unblock and unmute. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { BlockedMutedPage } from '@/components/settings/BlockedMutedPage';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/blocked')({
  head: () => noindexHead('Blocked and muted'),
  component: BlockedRoute,
});

function BlockedRoute() {
  const { t } = useTranslation('blocked-muted');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('page-title', { defaultValue: 'Blocked and muted' });
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue: 'Everyone you blocked or muted, newest first. Unblock or unmute them here.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={UserX}
            title={t('signed-out', { defaultValue: 'Sign in to see who you blocked or muted.' })}
            callbackURL="/settings/blocked"
          />
        ) : (
          <BlockedMutedPage />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
