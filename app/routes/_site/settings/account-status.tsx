/**
 * Account status — the user's side of moderation: their strike record, what it
 * means for the account, and the appeal form.
 */

import { createFileRoute } from '@tanstack/react-router';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AccountStandingPanel } from '@/components/moderation/AccountStandingPanel';
import { useSession } from '@/components/Providers';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

export const Route = createFileRoute('/_site/settings/account-status')({
  head: () => ({
    meta: [{ title: 'Account status | RMH Studios' }],
  }),
  component: AccountStatusPage,
});

function AccountStatusPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('account-status-title', { defaultValue: 'Account status' });

  return (
    <PageLayout
      title={title}
      description={t('account-status-subtitle', {
        defaultValue:
          'Your standing on RMH Studios, every moderation action taken on your account, and how to contest one.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {!isPending && !session?.user ? (
          <SignedOutPrompt
            icon={ShieldAlert}
            title={t('account-status-signed-out', {
              defaultValue: 'Sign in to view your account status.',
            })}
            callbackURL="/settings/account-status"
          />
        ) : (
          <AccountStandingPanel />
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
