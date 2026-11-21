/** Replays: the member's saved game replays, with visibility and delete. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { Clapperboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ReplayLibrary } from '@/components/replays/ReplayLibrary';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/replays')({
  head: () => noindexHead('Replays'),
  component: ReplaysPage,
});

function ReplaysPage() {
  const { t } = useTranslation('replay-library');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('page-title', { defaultValue: 'Replays' });
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue: 'The runs you saved: make one public or unlisted, or delete it.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={Clapperboard}
            title={t('signed-out', { defaultValue: 'Sign in to manage your replays.' })}
            callbackURL="/settings/replays"
          />
        ) : (
          <ReplayLibrary />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
