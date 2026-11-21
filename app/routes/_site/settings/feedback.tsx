/** Your feedback: what the member sent, where it stands and any reply. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { MyFeedbackList } from '@/components/feedback/MyFeedbackList';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { noindexHead } from '@/lib/seo';

export const Route =
  createFileRoute(
    '/_site/settings/feedback',
  )(
    {
      head: () =>
        noindexHead(
          'Your feedback',
        ),
      component:
        FeedbackRoute,
    },
  );

function FeedbackRoute() {
  const {
    t,
  } =
    useTranslation(
      'feedback-inbox',
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
      'mine-title',
      {
        defaultValue:
          'Your feedback',
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
        'mine-description',
        {
          defaultValue:
            'What you sent us, newest first, with where it stands and any reply.',
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
              MessageSquareText
            }
            title={t(
              'mine-signed-out',
              {
                defaultValue:
                  'Sign in to see your feedback.',
              },
            )}
            callbackURL="/settings/feedback"
          />
        ) : (
          <MyFeedbackList />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
