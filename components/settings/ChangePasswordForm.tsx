/**
 * Change the password from Settings → Security, under the "Email and password" row of the sign-in methods.
 * Asks for the current password (Better Auth checks it), then the new one twice. Every other device is signed
 * out: whoever knew the old password, or holds a stolen session, is cut off, and this device stays signed in.
 * The change is logged and announced to the account (lib/auth/security-hooks.server.ts).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Better Auth's limits on a password (its defaults, which this site keeps). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('feed');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) {
      setError(t('password-change-current-missing', { defaultValue: 'Enter your current password.' }));
      return;
    }
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) {
      setError(t('password-change-length', { defaultValue: 'Use 8 to 128 characters.' }));
      return;
    }
    if (next !== confirm) {
      setError(t('password-change-mismatch', { defaultValue: 'The two new passwords do not match.' }));
      return;
    }
    if (next === current) {
      setError(t('password-change-same', { defaultValue: 'The new password is the same as the current one.' }));
      return;
    }
    setPending(true);
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        setError(
          res.error.code === 'INVALID_PASSWORD'
            ? t('password-change-wrong', { defaultValue: 'Your current password is not right.' })
            : res.error.message || t('password-change-failed', { defaultValue: 'Could not change your password.' }),
        );
        return;
      }
      toast.success(
        t('password-change-done', { defaultValue: 'Password changed. Your other devices were signed out.' }),
      );
      onDone();
    } catch {
      setError(t('password-change-failed', { defaultValue: 'Could not change your password.' }));
    } finally {
      setPending(false);
    }
  };

  const describedBy = error ? 'password-change-error' : 'password-change-hint';

  return (
    <form onSubmit={submit} noValidate className="settings-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Lets a password manager file the new password under this account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <Input
          type="password"
          name="current-password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={t('password-change-current', { defaultValue: 'Current password' })}
          aria-label={t('password-change-current', { defaultValue: 'Current password' })}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoFocus
        />
        <Input
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder={t('password-change-new', { defaultValue: 'New password' })}
          aria-label={t('password-change-new', { defaultValue: 'New password' })}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
        />
        <Input
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t('password-change-confirm', { defaultValue: 'Type the new password again' })}
          aria-label={t('password-change-confirm', { defaultValue: 'Type the new password again' })}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
        />
        {error ? (
          <p id="password-change-error" role="alert" className="t-body text-site-danger">
            {error}
          </p>
        ) : (
          <p id="password-change-hint" className="settings-row__hint">
            {t('password-change-hint', {
              defaultValue: 'At least 8 characters. Your other devices are signed out when it changes.',
            })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onDone} disabled={pending}>
            {t('signin-methods-cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="submit" loading={pending}>
            {t('password-change-submit', { defaultValue: 'Change password' })}
          </Button>
        </div>
      </div>
    </form>
  );
}
