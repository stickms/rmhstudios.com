/** Lists you are on: the public and unlisted lists that include you, and leaving one. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ListsOnSection } from '@/components/settings/ListsOnSection';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/lists')({
  head: () => noindexHead('Lists you are on'),
  component: ListsOnPage,
});

function ListsOnPage() {
  const { t } = useTranslation('lists-on');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('page-title', { defaultValue: 'Lists you are on' });
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue: 'The public and unlisted lists other members have put you on, and leaving them.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={ListChecks}
            title={t('signed-out', { defaultValue: 'Sign in to see the lists you are on.' })}
            callbackURL="/settings/lists"
          />
        ) : (
          <ListsOnSection />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
