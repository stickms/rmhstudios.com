/**
 * Privacy & data settings — data export (DSAR) and account deletion (erasure)
 * for the signed-in user.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { DataExportPanel } from '@/components/site/DataExportPanel';
import { DeleteAccountPanel } from '@/components/site/DeleteAccountPanel';
import { MutedWordsPanel } from '@/components/site/MutedWordsPanel';
import { useSession } from '@/components/Providers';

export const Route = createFileRoute('/_site/settings/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy & data | RMH Studios' }],
  }),
  component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('privacy-title', { defaultValue: 'Privacy & data' });

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
          {t('privacy-subtitle', {
            defaultValue: 'Export or delete the data tied to your account.',
          })}
        </p>
        {!isPending && !session?.user ? (
          <p className="text-sm text-site-text-muted">
            <Link
              to="/login"
              search={{ callbackURL: '/settings/privacy' }}
              className="text-site-accent hover:underline"
            >
              {t('privacy-sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('privacy-sign-in-rest', { defaultValue: 'to manage your privacy settings.' })}
          </p>
        ) : (
          <>
            <MutedWordsPanel />
            <DataExportPanel />
            <DeleteAccountPanel />
          </>
        )}
      </div>
    </PageLayout>
  );
}
