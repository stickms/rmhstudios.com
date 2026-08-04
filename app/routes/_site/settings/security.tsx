/**
 * Security settings — how you sign in, and how you get back in.
 *
 * Passkeys and sessions were here already; J1/I3 add profile-link verification,
 * recovery codes and trusted contacts. The page also answers the recovery email
 * link (`?recovery=<id>&token=<token>`), which is why the recovery panel renders
 * for signed-OUT visitors too: the entire point of that link is that the person
 * following it cannot sign in.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PasskeyManager } from '@/components/site/PasskeyManager';
import { SessionManager } from '@/components/site/SessionManager';
import { ProfileLinksPanel } from '@/components/settings/ProfileLinksPanel';
import { RecoveryPanel } from '@/components/settings/RecoveryPanel';
import { TrustedContactsPanel } from '@/components/settings/TrustedContactsPanel';
import { useSession } from '@/components/Providers';

interface SecuritySearch {
  /** Recovery request id, from the emailed completion link. */
  recovery?: string;
  /** Single-use recovery token, from the same link. */
  token?: string;
}

export const Route = createFileRoute('/_site/settings/security')({
  validateSearch: (search: Record<string, unknown>): SecuritySearch => ({
    recovery: typeof search.recovery === 'string' ? search.recovery : undefined,
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Security | RMH Studios' }],
  }),
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { recovery, token } = Route.useSearch();
  const user = session?.user as { id: string; handle?: string | null } | undefined;
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('security-title', { defaultValue: 'Security' });

  const completion = recovery && token ? { requestId: recovery, token } : null;
  const signedOut = !isPending && !session?.user;

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

        {/* Rendered before the sign-in gate on purpose — see the file header. */}
        {completion ? <RecoveryPanel completion={completion} signedIn={!signedOut} /> : null}

        {signedOut ? (
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
            {completion ? null : <RecoveryPanel />}
            <TrustedContactsPanel />
            <ProfileLinksPanel handle={user?.handle ?? null} />
          </>
        )}
      </div>
    </PageLayout>
  );
}
