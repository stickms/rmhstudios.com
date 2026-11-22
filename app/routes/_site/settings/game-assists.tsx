/** Game assists: calmer visuals, a slower clock and no timed input for the games that honour them. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { Accessibility } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { GameAssistsPanel } from '@/components/settings/GameAssistsPanel';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/game-assists')({
  head: () => noindexHead('Game assists'),
  component: GameAssistsPage,
});

function GameAssistsPage() {
  const { t } = useTranslation('game-assists');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', {
    defaultValue: 'Settings',
  });
  const title = t('page-title', {
    defaultValue: 'Game assists',
  });
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue: 'Settings that supporting games honour: calmer visuals, a slower clock and no timed input.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[
        {
          label: settingsLabel,
          to: '/settings',
        },
        {
          label: title,
        },
      ]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={Accessibility}
            title={t('signed-out', {
              defaultValue: 'Sign in to set your game assists.',
            })}
            callbackURL="/settings/game-assists"
          />
        ) : (
          <GameAssistsPanel />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
