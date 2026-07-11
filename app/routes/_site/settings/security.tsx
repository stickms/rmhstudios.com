/**
 * Security settings — passkey management for the signed-in user.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PasskeyManager } from '@/components/site/PasskeyManager';
import { SessionManager } from '@/components/site/SessionManager';
import { useSession } from '@/components/Providers';

export const Route = createFileRoute('/_site/settings/security')({
  head: () => ({
    meta: [{ title: 'Security | RMH Studios' }],
  }),
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('security-title', { defaultValue: 'Security' });

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
          {t('security-subtitle', { defaultValue: 'Manage how you sign in to your account.' })}
        </p>
        {!isPending && !session?.user ? (
          <p className="text-sm text-site-text-muted">
            <Link
              to="/login"
              search={{ callbackURL: '/settings/security' }}
              className="text-site-accent hover:underline"
            >
              {t('security-sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('security-sign-in-rest', { defaultValue: 'to manage your security settings.' })}
          </p>
        ) : (
          <>
            <PasskeyManager />
            <SessionManager />
          </>
        )}
      </div>
    </PageLayout>
  );
}
