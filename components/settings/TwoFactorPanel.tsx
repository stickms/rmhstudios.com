/**
 * Two-step verification on /settings/security: on or off, turn it on (`TwoFactorSetup`), turn it off, or
 * replace the backup codes. Optional (owner, 2026-11-23): nothing here is ever required.
 *
 * It protects signing in with email and password, so an account without a password has nothing to protect
 * and the section says so (a passkey is already two factors; Discord, GitHub and the rest carry their own).
 * Turning it off and making new backup codes both ask for the password again; each is logged and announced
 * to the account (lib/auth/security-hooks.server.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/providers';
import { toast } from '@/lib/toast';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { BackupCodes, TwoFactorSetup } from '@/components/settings/TwoFactorSetup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type Mode = 'idle' | 'setup' | 'disable' | 'new-codes' | 'show-codes';

// The status row wraps (`flex-wrap`, the text never narrower than 12rem): on a narrow phone the two buttons drop under the text
// instead of squeezing it to a word a line.

export function TwoFactorPanel() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const sessionEnabled = !!(session?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled;

  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(sessionEnabled);
  const [mode, setMode] = useState<Mode>('idle');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const arrival = useArrival(hasPassword !== null);

  useEffect(() => setEnabled(sessionEnabled), [sessionEnabled]);

  const load = useCallback(async () => {
    try {
      const list = await authClient.listAccounts();
      setHasPassword((list.data ?? []).some((a) => a.providerId === CREDENTIAL_PROVIDER_ID));
    } catch {
      setHasPassword(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setMode('idle');
    setPassword('');
    setError(null);
  };

  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(t('two-factor-password-missing', { defaultValue: 'Enter your password.' }));
      return;
    }
    setError(null);
    setPending(true);
    try {
      if (mode === 'disable') {
        const res = await authClient.twoFactor.disable({ password });
        if (res.error) {
          setError(
            res.error.code === 'INVALID_PASSWORD'
              ? t('two-factor-password-wrong', { defaultValue: 'That password is not right.' })
              : res.error.message || t('two-factor-disable-failed', { defaultValue: 'Could not turn it off.' }),
          );
          return;
        }
        setEnabled(false);
        reset();
        toast.success(t('two-factor-disabled', { defaultValue: 'Two-step verification is off.' }));
        return;
      }
      const res = await authClient.twoFactor.generateBackupCodes({ password });
      if (res.error || !res.data?.backupCodes) {
        setError(
          res.error?.code === 'INVALID_PASSWORD'
            ? t('two-factor-password-wrong', { defaultValue: 'That password is not right.' })
            : res.error?.message || t('two-factor-codes-failed', { defaultValue: 'Could not make new codes.' }),
        );
        return;
      }
      setCodes(res.data.backupCodes);
      setPassword('');
      setMode('show-codes');
    } catch {
      setError(t('two-factor-generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setPending(false);
    }
  };

  const hint =
    hasPassword === false
      ? t('two-factor-no-password', {
          defaultValue:
            'Protects signing in with a password. This account has no password, so there is nothing to protect: your other sign-in methods carry their own.',
        })
      : enabled
        ? t('two-factor-on', { defaultValue: 'On. Signing in with your password also asks for a code from your app.' })
        : t('two-factor-off', { defaultValue: 'Off. Turn it on to ask for a code from an app after your password.' });

  return (
    <SettingsSection
      id="two-factor"
      title={t('two-factor-title', { defaultValue: 'Two-step verification' })}
      description={t('two-factor-description', {
        defaultValue:
          'Optional. After your password, enter a code from an authenticator app on your phone, so a stolen password alone cannot sign in.',
      })}
    >
      {hasPassword === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className={cn(arrival)}>
          <div className="settings-row flex-wrap">
            <div className="settings-row__text shrink-0 grow basis-48">
              <p className="settings-row__name">{t('two-factor-row', { defaultValue: 'Authenticator app' })}</p>
              <p className="settings-row__hint">{hint}</p>
            </div>
            {hasPassword && mode === 'idle' ? (
              <div className="ms-auto flex shrink-0 flex-wrap justify-end gap-2">
                {enabled ? (
                  <>
                    <Button onClick={() => setMode('new-codes')}>
                      {t('two-factor-new-codes', { defaultValue: 'New backup codes' })}
                    </Button>
                    <Button variant="danger" onClick={() => setMode('disable')}>
                      {t('two-factor-turn-off', { defaultValue: 'Turn off' })}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setMode('setup')}>{t('two-factor-set-up', { defaultValue: 'Set up' })}</Button>
                )}
              </div>
            ) : null}
          </div>

          {mode === 'setup' ? (
            <div className="settings-row">
              <div className="min-w-0 flex-1">
                <TwoFactorSetup
                  onCancel={reset}
                  onDone={() => {
                    setEnabled(true);
                    reset();
                  }}
                />
              </div>
            </div>
          ) : null}

          {mode === 'disable' || mode === 'new-codes' ? (
            <form onSubmit={withPassword} noValidate className="settings-row">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="t-body">
                  {mode === 'disable'
                    ? t('two-factor-disable-intro', {
                        defaultValue: 'Enter your password to turn off two-step verification.',
                      })
                    : t('two-factor-new-codes-intro', {
                        defaultValue: 'Enter your password to make ten new backup codes. The old ones stop working.',
                      })}
                </p>
                <input type="text" name="username" autoComplete="username" hidden readOnly />
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('password-change-current', { defaultValue: 'Current password' })}
                  aria-label={t('password-change-current', { defaultValue: 'Current password' })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'two-factor-panel-error' : undefined}
                  autoFocus
                />
                {error ? (
                  <p id="two-factor-panel-error" role="alert" className="t-body text-site-danger">
                    {error}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" onClick={reset} disabled={pending}>
                    {t('signin-methods-cancel', { defaultValue: 'Cancel' })}
                  </Button>
                  <Button type="submit" variant={mode === 'disable' ? 'danger' : 'default'} loading={pending}>
                    {mode === 'disable'
                      ? t('two-factor-turn-off', { defaultValue: 'Turn off' })
                      : t('two-factor-make-codes', { defaultValue: 'Make new codes' })}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {mode === 'show-codes' ? (
            <div className="settings-row">
              <div className="min-w-0 flex-1">
                <BackupCodes codes={codes} onDone={reset} intro="replaced" />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
