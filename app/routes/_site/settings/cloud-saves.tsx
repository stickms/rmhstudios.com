/** Cloud saves — every game that saves to the account, with backups, restore and version history. */

import { createFileRoute } from '@tanstack/react-router';
import { CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CloudSaves } from '@/components/settings/CloudSaves';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

export const Route =
  createFileRoute(
    '/_site/settings/cloud-saves',
  )(
    {
      head: () => ({
        meta: [
          {
            title:
              'Cloud saves | RMH Studios',
          },
        ],
      }),
      component:
        CloudSavesPage,
    },
  );

function CloudSavesPage() {
  const {
    t,
  } =
    useTranslation(
      'cloud-saves',
    );
  const {
    data: session,
    isPending,
  } =
    useSession();
  const settingsLabel =
    t(
      'settings',
      {
        defaultValue:
          'Settings',
      },
    );
  const title =
    t(
      'page-title',
      {
        defaultValue:
          'Cloud saves',
      },
    );

  const signedOut =
    !isPending &&
    !session?.user;

  return (
    <PageLayout
      title={
        title
      }
      description={t(
        'page-description',
        {
          defaultValue:
            'Back up, restore and delete the saves your games keep on your account.',
        },
      )}
      wide
      backTo="/settings"
      backLabel={
        settingsLabel
      }
      breadcrumbs={[
        {
          label:
            settingsLabel,
          to: '/settings',
        },
        {
          label:
            title,
        },
      ]}
    >
      <SettingsPageBody>
        {signedOut ? (
          <SignedOutPrompt
            icon={
              CloudUpload
            }
            title={t(
              'signed-out',
              {
                defaultValue:
                  'Sign in to manage your cloud saves.',
              },
            )}
            callbackURL="/settings/cloud-saves"
          />
        ) : (
          <CloudSaves />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
