/**
 * /reset-password — where the "Forgot password?" email lands.
 *
 * The email links to Better Auth's `/api/auth/reset-password/<token>`, which checks the token and sends the browser
 * here with `?token=` (or `?error=INVALID_TOKEN` when it has expired or was used). Choosing a new password signs the
 * account out everywhere (`revokeSessionsOnPasswordReset`), then the person signs in with it. Full-screen like
 * /login, which it belongs with.
 *
 * The token is a bearer secret for the account, so the page reads it once, keeps it in memory and replaces the
 * address with plain `/reset-password`: it does not sit in the address bar, in history, or in a referrer.
 */

import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === 'string' ? search.token.slice(0, 512) : undefined,
    error: typeof search.error === 'string' ? search.error.slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Reset password | RMH Studios' },
      { name: 'robots', content: 'noindex' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation('pages');
  const search = Route.useSearch();
  const navigate = useNavigate();
  // Read once: the address is cleared below, and the page keeps working from this copy.
  const [token] = useState(search.token);
  const [linkError] = useState(search.error);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const linkBroken = !token || !!linkError;

  useEffect(() => {
    if (search.token || search.error) void navigate({ to: '/reset-password', search: {}, replace: true });
  }, [search.token, search.error, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('validation-password', { defaultValue: 'Password must be at least 8 characters.' }));
      return;
    }
    if (password !== confirm) {
      setError(t('reset-mismatch', { defaultValue: 'The two passwords do not match.' }));
      return;
    }
    if (!token) return;
    setPending(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        setError(
          res.error.code === 'INVALID_TOKEN'
            ? t('reset-link-expired', {
                defaultValue: 'This link has expired or was already used. Ask for a new one from the sign-in page.',
              })
            : (res.error.message ?? t('generic-error', { defaultValue: 'Something went wrong. Please try again.' })),
        );
        return;
      }
      setDone(true);
    } catch {
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setPending(false);
    }
  };

  const fieldIcon = 'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-site-text-muted z-10';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="t-title text-center">{t('reset-title', { defaultValue: 'Choose a new password' })}</h1>

        {done ? (
          <div className="space-y-3 text-center">
            <p role="status" className="text-sm text-site-text-muted">
              {t('reset-done', {
                defaultValue:
                  'Your password is changed, and you are signed out on every device. Sign in with the new one.',
              })}
            </p>
            <Button asChild variant="primary" size="lg" className="w-full">
              <Link to="/login">{t('sign-in-btn', { defaultValue: 'Sign in' })}</Link>
            </Button>
          </div>
        ) : linkBroken ? (
          <div className="space-y-3 text-center">
            <p role="alert" className="text-sm text-site-text-muted">
              {t('reset-link-expired', {
                defaultValue: 'This link has expired or was already used. Ask for a new one from the sign-in page.',
              })}
            </p>
            <Button asChild variant="primary" size="lg" className="w-full">
              <Link to="/login">{t('reset-back-to-sign-in', { defaultValue: 'Go to sign in' })}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            {/* A hidden username field lets password managers file the new password under the right account. */}
            <input type="text" name="username" autoComplete="username" hidden readOnly />
            <div className="relative">
              <Lock className={fieldIcon} aria-hidden />
              <Input
                type="password"
                name="new-password"
                placeholder={t('reset-new-placeholder', { defaultValue: 'New password' })}
                aria-label={t('reset-new-placeholder', { defaultValue: 'New password' })}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                minLength={8}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'reset-error' : undefined}
                className="h-12 pl-11 pr-4"
              />
            </div>
            <div className="relative">
              <Lock className={fieldIcon} aria-hidden />
              <Input
                type="password"
                name="confirm-password"
                placeholder={t('reset-confirm-placeholder', { defaultValue: 'Type it again' })}
                aria-label={t('reset-confirm-placeholder', { defaultValue: 'Type it again' })}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'reset-error' : undefined}
                className="h-12 pl-11 pr-4"
              />
            </div>
            {error && (
              <p id="reset-error" role="alert" className="text-center text-sm text-site-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
              {t('reset-submit', { defaultValue: 'Change password' })}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm text-site-text-muted hover:text-site-text"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t('check-inbox-back', { defaultValue: 'Back to sign in' })}
          </Link>
        </div>
      </div>
    </main>
  );
}
