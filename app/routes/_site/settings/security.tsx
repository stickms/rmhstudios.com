/**
 * Security settings — how you sign in, and how you get back in.
 *
 * Passkeys and sessions were here already; J1/I3 add recovery codes and trusted
 * contacts, and account standing (strikes and appeals) moved in from its own page.
 * Profile-link verification moved to /settings/profile, beside the profile it proves. The page also answers the recovery email
 * link (`?recovery=<id>&token=<token>`), which is why the recovery panel renders
 * for signed-OUT visitors too: the entire point of that link is that the person
 * following it cannot sign in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { accountStandingQuery } from '@/lib/moderation/standing.queries';
import {
  recoveryCodeStatusQuery,
  recoveryHoldQuery,
  recoveryRequestsQuery,
  trustedContactsQuery,
} from '@/lib/recovery/recovery.queries';
import { PageLayout } from '@/components/feed/PageLayout';
import { PasskeyManager } from '@/components/site/PasskeyManager';
import { SignInMethodsPanel } from '@/components/settings/SignInMethodsPanel';
import { SessionManager } from '@/components/site/SessionManager';
import { AccountStandingPanel } from '@/components/moderation/AccountStandingPanel';
import { RecoveryPanel } from '@/components/settings/RecoveryPanel';
import { TrustedContactsPanel } from '@/components/settings/TrustedContactsPanel';
import { useSession } from '@/components/Providers';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

interface SecuritySearch {
  /** Recovery request id, from the emailed completion link. */
  recovery?: string;
  /** Single-use recovery token, from the same link. */
  token?: string;
  /** Set by Better Auth when connecting a sign-in method failed (`error` code). */
  error?: string;
}

export const Route = createFileRoute('/_site/settings/security')({
  validateSearch: (search: Record<string, unknown>): SecuritySearch => ({
    recovery: typeof search.recovery === 'string' ? search.recovery : undefined,
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error.slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Security | RMH Studios' }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      prefetchRouteQuery(context.queryClient, accountStandingQuery()),
      prefetchRouteQuery(context.queryClient, recoveryCodeStatusQuery()),
      prefetchRouteQuery(context.queryClient, recoveryHoldQuery()),
      prefetchRouteQuery(context.queryClient, recoveryRequestsQuery()),
      prefetchRouteQuery(context.queryClient, trustedContactsQuery()),
    ]);
    return undefined;
  },
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { recovery, token, error: linkError } = Route.useSearch();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('security-title', { defaultValue: 'Security' });

  const completion = recovery && token ? { requestId: recovery, token } : null;
  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('security-subtitle-standing', {
        defaultValue: 'How you sign in, how you get back in, and your account standing.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {/* Rendered before the sign-in gate on purpose — see the file header. */}
        {completion ? <RecoveryPanel completion={completion} signedIn={!signedOut} /> : null}

        {signedOut ? (
          <SignedOutPrompt
            icon={KeyRound}
            title={t('security-signed-out', {
              defaultValue: 'Sign in to manage your security settings.',
            })}
            callbackURL="/settings/security"
          />
        ) : (
          <>
            <SignInMethodsPanel linkError={linkError} />
            <PasskeyManager />
            <SessionManager />
            {completion ? null : <RecoveryPanel />}
            <TrustedContactsPanel />
            <AccountStandingPanel />
          </>
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
