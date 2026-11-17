/**
 * Settings → Security → Sign-in methods: every way into this account, the
 * account's email and whether it is confirmed, and the offer to move a new,
 * empty account's sign-in to an existing account.
 *
 * Design: docs/superpowers/specs/2026-11-16-account-consolidation-design.md.
 * Every change here needs a sign-in from the last ten minutes; when the server
 * answers SESSION_NOT_FRESH the panel offers to sign in again and come back.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/lib/toast';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ProviderIcon } from '@/components/ui/brand-icons';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useArrival } from '@/components/ui/arrive';
import { getSignInProviders } from '@/lib/auth/sign-in-providers.functions';
import {
  CREDENTIAL_PROVIDER_ID,
  PROVIDER_NAMES,
  SESSION_NOT_FRESH,
  isPlaceholderEmail,
  isSignInProviderId,
  type SignInProviderId,
} from '@/lib/auth/providers';
import { cn } from '@/lib/utils';

const RETURN_TO = '/settings/security';

interface LinkedAccount {
  id: string;
  providerId: string;
}

type Eligibility = { eligible: true; methods: string[] } | { eligible: false; reason: string };

type AuthError = { code?: string; message?: string } | null | undefined;

export function SignInMethodsPanel({ linkError }: { linkError?: string | undefined }) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const { data: session } = useSession();
  const user = session?.user as { email?: string | null; emailVerified?: boolean | null } | undefined;

  const [providers, setProviders] = useState<SignInProviderId[]>([]);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsFreshSignIn, setNeedsFreshSignIn] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const arrival = useArrival(!loading);

  const email = user?.email ?? null;
  const hasRealEmail = !!email && !isPlaceholderEmail(email);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enabled, list, merge] = await Promise.all([
        getSignInProviders(),
        authClient.listAccounts(),
        authClient.$fetch<Eligibility>('/account-merge/eligibility', { method: 'GET' }),
      ]);
      setProviders(enabled);
      setAccounts((list.data ?? []).map((a) => ({ id: a.id, providerId: a.providerId })));
      setEligibility(merge.data ?? null);
    } catch {
      // Signed out or offline: the list stays empty.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!linkError) return;
    toast.error(
      linkError === 'account_already_linked_to_different_user'
        ? t('signin-methods-link-taken', {
            defaultValue: 'That account already signs in to a different RMH account.',
          })
        : t('signin-methods-link-failed', { defaultValue: 'Could not connect that account.' }),
    );
  }, [linkError, t]);

  /** Shared handling for an error from any change on this panel. */
  const handleError = (error: AuthError, fallback: string): void => {
    if (error?.code === SESSION_NOT_FRESH) {
      setNeedsFreshSignIn(true);
      return;
    }
    toast.error(error?.message || fallback);
  };

  const signInAgain = async () => {
    await authClient.signOut();
    window.location.href = `/login?callbackURL=${encodeURIComponent(RETURN_TO)}`;
  };

  const connect = async (provider: SignInProviderId) => {
    setBusy(provider);
    const fallback = t('signin-methods-link-failed', { defaultValue: 'Could not connect that account.' });
    const errorCallbackURL = RETURN_TO;
    try {
      if (provider === 'steam') {
        const res = await authClient.$fetch<{ url: string }>('/link/steam', {
          method: 'POST',
          body: { callbackURL: RETURN_TO, errorCallbackURL },
        });
        if (res.error || !res.data?.url) {
          handleError(res.error as AuthError, fallback);
          setBusy(null);
          return;
        }
        window.location.href = res.data.url;
        return;
      }
      const res = await authClient.linkSocial({ provider, callbackURL: RETURN_TO, errorCallbackURL });
      if (res?.error) {
        handleError(res.error as AuthError, fallback);
        setBusy(null);
      }
      // On success the browser is already on its way to the provider.
    } catch {
      toast.error(fallback);
      setBusy(null);
    }
  };

  const disconnect = async (account: LinkedAccount, name: string) => {
    const ok = await confirm({
      title: t('signin-methods-disconnect-title', {
        defaultValue: 'Disconnect {{name}}?',
        name,
      }),
      description: t('signin-methods-disconnect-body', {
        defaultValue: 'You will no longer be able to sign in with {{name}}.',
        name,
      }),
      confirmLabel: t('signin-methods-disconnect', { defaultValue: 'Disconnect' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(account.id);
    try {
      const res = await authClient.unlinkAccount({ accountId: account.id });
      if (res.error) {
        handleError(
          res.error as AuthError,
          t('signin-methods-disconnect-failed', { defaultValue: 'Could not disconnect it.' }),
        );
      } else {
        toast.success(t('signin-methods-disconnected', { defaultValue: '{{name}} disconnected.', name }));
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const resendVerification = async () => {
    if (!email) return;
    setBusy('verify');
    try {
      const res = await authClient.sendVerificationEmail({ email, callbackURL: RETURN_TO });
      if (res.error) {
        handleError(res.error as AuthError, t('signin-methods-verify-failed', { defaultValue: 'Could not send the link.' }));
      } else {
        toast.success(t('signin-methods-verify-sent', { defaultValue: 'Confirmation link sent to {{email}}.', email }));
      }
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || isPlaceholderEmail(next)) {
      toast.error(t('validation-email', { ns: 'pages', defaultValue: 'Enter a valid email address.' }));
      return;
    }
    setBusy('email');
    try {
      const res = await authClient.changeEmail({ newEmail: next, callbackURL: RETURN_TO });
      if (res.error) {
        handleError(res.error as AuthError, t('signin-methods-email-failed', { defaultValue: 'Could not change the email.' }));
        return;
      }
      setEditingEmail(false);
      setNewEmail('');
      toast.success(
        user?.emailVerified && hasRealEmail
          ? t('signin-methods-email-approve', {
              defaultValue: 'Check {{email}} to approve the change. We then send a link to the new address.',
              email,
            })
          : t('signin-methods-email-confirm', {
              defaultValue: 'Check {{email}} for a link. The address changes when you open it.',
              email: next,
            }),
      );
    } finally {
      setBusy(null);
    }
  };

  const startMerge = async () => {
    const ok = await confirm({
      title: t('signin-methods-merge-title', { defaultValue: 'Use an existing account?' }),
      description: t('signin-methods-merge-body', {
        defaultValue:
          'You will sign in to your other RMH account, and this sign-in will move to it. This new account is then closed. It has no posts, coins or games, so nothing is lost.',
      }),
      confirmLabel: t('signin-methods-merge-continue', { defaultValue: 'Continue' }),
    });
    if (!ok) return;
    setBusy('merge');
    const res = await authClient.$fetch('/account-merge/start', { method: 'POST' });
    if (res.error) {
      handleError(res.error as AuthError, t('signin-methods-merge-failed', { defaultValue: 'Could not start. Try again.' }));
      setBusy(null);
      return;
    }
    window.location.href = `/login?callbackURL=${encodeURIComponent('/account/connect')}`;
  };

  const linked = (provider: string) => accounts.filter((a) => a.providerId === provider);
  const credential = accounts.find((a) => a.providerId === CREDENTIAL_PROVIDER_ID);
  const otherLinked = accounts.filter((a) => a.providerId !== CREDENTIAL_PROVIDER_ID && !isSignInProviderId(a.providerId));

  return (
    <SettingsSection
      title={t('signin-methods-title', { defaultValue: 'Sign-in methods' })}
      description={t('signin-methods-description', {
        defaultValue: 'The ways you can sign in to this account. Connect another so you never end up with two accounts.',
      })}
    >
      {needsFreshSignIn ? (
        <div className="settings-row">
          <div className="settings-row__text">
            <p className="settings-row__name">
              {t('signin-methods-fresh-title', { defaultValue: 'Sign in again to make changes' })}
            </p>
            <p className="settings-row__hint">
              {t('signin-methods-fresh-hint', {
                defaultValue: 'For your security, changes here need a sign-in from the last 10 minutes.',
              })}
            </p>
          </div>
          <Button onClick={signInAgain}>{t('signin-methods-sign-in-again', { defaultValue: 'Sign in again' })}</Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className={cn(arrival)}>
          {/* The account's email. */}
          <div className="settings-row">
            <div className="settings-row__text">
              <p className="settings-row__name">{t('signin-methods-email', { defaultValue: 'Email' })}</p>
              <p className="settings-row__hint">
                {!hasRealEmail
                  ? t('signin-methods-email-none', { defaultValue: 'No email on this account' })
                  : user?.emailVerified
                    ? t('signin-methods-email-confirmed', { defaultValue: '{{email}} · Confirmed', email })
                    : t('signin-methods-email-unconfirmed', { defaultValue: '{{email}} · Not confirmed', email })}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {hasRealEmail && !user?.emailVerified ? (
                <Button onClick={resendVerification} disabled={busy !== null} loading={busy === 'verify'}>
                  {t('signin-methods-verify', { defaultValue: 'Send link' })}
                </Button>
              ) : null}
              {!editingEmail ? (
                <Button onClick={() => setEditingEmail(true)} disabled={busy !== null}>
                  {hasRealEmail
                    ? t('signin-methods-email-change', { defaultValue: 'Change' })
                    : t('signin-methods-email-add', { defaultValue: 'Add email' })}
                </Button>
              ) : null}
            </div>
          </div>
          {editingEmail ? (
            <form onSubmit={changeEmail} noValidate className="settings-row">
              <Input
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t('signin-methods-email-placeholder', { defaultValue: 'New email address' })}
                aria-label={t('signin-methods-email-placeholder', { defaultValue: 'New email address' })}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 gap-2">
                <Button type="button" onClick={() => setEditingEmail(false)}>
                  {t('signin-methods-cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button type="submit" loading={busy === 'email'} disabled={busy !== null}>
                  {t('signin-methods-email-send', { defaultValue: 'Send link' })}
                </Button>
              </div>
            </form>
          ) : null}

          {/* Email and password, when the account has one. */}
          {credential ? (
            <div className="settings-row">
              <div className="settings-row__text">
                <p className="settings-row__name">{t('signin-methods-password', { defaultValue: 'Email and password' })}</p>
                <p className="settings-row__hint">{t('signin-methods-connected', { defaultValue: 'Connected' })}</p>
              </div>
            </div>
          ) : null}

          {/* Each provider this site offers. */}
          {providers.map((provider) => {
            const rows = linked(provider);
            const name = PROVIDER_NAMES[provider];
            return (
              <div key={provider} className="settings-row">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIcon id={provider} className="size-5 shrink-0" />
                  <div className="settings-row__text">
                    <p className="settings-row__name">{name}</p>
                    <p className="settings-row__hint">
                      {rows.length > 0
                        ? t('signin-methods-connected', { defaultValue: 'Connected' })
                        : t('signin-methods-not-connected', { defaultValue: 'Not connected' })}
                    </p>
                  </div>
                </div>
                {rows.length > 0 ? (
                  <Button
                   
                    onClick={() => disconnect(rows[0]!, name)}
                    disabled={busy !== null || accounts.length <= 1}
                    loading={busy === rows[0]!.id}
                    title={
                      accounts.length <= 1
                        ? t('signin-methods-last', { defaultValue: 'Your only way to sign in cannot be removed.' })
                        : undefined
                    }
                  >
                    {t('signin-methods-disconnect', { defaultValue: 'Disconnect' })}
                  </Button>
                ) : (
                  <Button onClick={() => connect(provider)} disabled={busy !== null} loading={busy === provider}>
                    {t('signin-methods-connect', { defaultValue: 'Connect' })}
                  </Button>
                )}
              </div>
            );
          })}

          {/* A provider this deploy no longer offers, still on the account. */}
          {otherLinked.map((account) => (
            <div key={account.id} className="settings-row">
              <div className="settings-row__text">
                <p className="settings-row__name">{account.providerId}</p>
                <p className="settings-row__hint">{t('signin-methods-connected', { defaultValue: 'Connected' })}</p>
              </div>
              <Button
               
                onClick={() => disconnect(account, account.providerId)}
                disabled={busy !== null || accounts.length <= 1}
              >
                {t('signin-methods-disconnect', { defaultValue: 'Disconnect' })}
              </Button>
            </div>
          ))}

          {/* A new, empty account: offer to move this sign-in to an existing one. */}
          {eligibility?.eligible ? (
            <div className="settings-row">
              <div className="settings-row__text">
                <p className="settings-row__name">
                  {t('signin-methods-merge-name', { defaultValue: 'Already have an RMH account?' })}
                </p>
                <p className="settings-row__hint">
                  {t('signin-methods-merge-hint', {
                    defaultValue: 'This account is new and empty. Move this sign-in to your other account instead.',
                  })}
                </p>
              </div>
              <Button onClick={startMerge} disabled={busy !== null} loading={busy === 'merge'}>
                {t('signin-methods-merge-action', { defaultValue: 'Use existing account' })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
