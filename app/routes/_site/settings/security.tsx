/**
 * Security settings — how you sign in, the sessions signed in, and account standing.
 *
 * Recovery codes and trusted contacts were here (J1/I3) and were removed (owner, 2026-11-19): a code could never be
 * redeemed and a recovery request had no way to start, so both promised a way back in that did not exist. Getting
 * back in is "Forgot password?" on /login, a reset by email, which starts the economy hold (lib/recovery/hold.server).
 */

import { createFileRoute } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { accountStandingQuery } from '@/lib/moderation/standing.queries';
import { PageLayout } from '@/components/feed/PageLayout';
import { PasskeyManager } from '@/components/site/PasskeyManager';
import { SignInMethodsPanel } from '@/components/settings/SignInMethodsPanel';
import { SessionManager } from '@/components/site/SessionManager';
import { SecurityActivityPanel } from '@/components/settings/SecurityActivityPanel';
import { AccountStandingPanel } from '@/components/moderation/AccountStandingPanel';
import { MyReportsPanel } from '@/components/moderation/MyReportsPanel';
import { useSession } from '@/components/Providers';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

interface SecuritySearch {
  /** Set by Better Auth when connecting a sign-in method failed (`error` code). */
  error?: string;
}

export const Route = createFileRoute('/_site/settings/security')({
  validateSearch: (search: Record<string, unknown>): SecuritySearch => ({
    error: typeof search.error === 'string' ? search.error.slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Security | RMH Studios' }],
  }),
  loader: async ({ context }) => {
    await prefetchRouteQuery(context.queryClient, accountStandingQuery());
    return undefined;
  },
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { error: linkError } = Route.useSearch();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('security-title', { defaultValue: 'Security' });

  const signedOut = !isPending && !session?.user;

  return (
    <PageLayout
      title={title}
      description={t('security-subtitle-sessions', {
        defaultValue: 'How you sign in, where you are signed in, and your account standing.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
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
            <SecurityActivityPanel />
            <AccountStandingPanel />
            <MyReportsPanel />
          </>
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
