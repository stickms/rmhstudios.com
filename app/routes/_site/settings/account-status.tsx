/**
 * Account status — the user's side of moderation: their strike record, what it
 * means for the account, and the appeal form.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AccountStandingPanel } from '@/components/moderation/AccountStandingPanel';
import { useSession } from '@/components/Providers';

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
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-site-text-muted">
          {t('account-status-subtitle', {
            defaultValue:
              'Your standing on RMH Studios, every moderation action taken on your account, and how to contest one.',
          })}
        </p>
        {!isPending && !session?.user ? (
          <p className="text-sm text-site-text-muted">
            <Link
              to="/login"
              search={{ callbackURL: '/settings/account-status' }}
              className="text-site-accent hover:underline"
            >
              {t('account-status-sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('account-status-sign-in-rest', { defaultValue: 'to view your account status.' })}
          </p>
        ) : (
          <AccountStandingPanel />
        )}
      </div>
    </PageLayout>
  );
}
