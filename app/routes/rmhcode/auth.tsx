import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useState, useEffect, Suspense } from 'react';
import { m as motion } from 'framer-motion';
import { Terminal, Check, X, Loader2, Shield } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

/** True only for a valid URL whose host is localhost (the CLI callback allowlist). */
function isLocalhostCallback(cb: string): boolean {
  try {
    return /^(localhost|127\.0\.0\.1)$/.test(new URL(cb).hostname);
  } catch {
    return false;
  }
}

function AuthContent() {
  const { t } = useTranslation("r-rmhcode");
  const navigate = useNavigate();
  const { callback, session: sessionId } = Route.useSearch();
  const { data: session, isPending } = useSession();

  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (callback) {
      try {
        const url = new URL(callback);
        if (!url.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
          setError(t("invalid-callback-url", { defaultValue: "Invalid callback URL. Only localhost is allowed." }));
        }
      } catch {
        setError(t("invalid-callback-url-format", { defaultValue: "Invalid callback URL format." }));
      }
    }
  }, [callback]);

  async function handleAuthorize() {
    if (!callback || !sessionId) { setError(t("missing-params", { defaultValue: "Missing callback or session parameters." })); return; }
    setAuthorizing(true); setError(null);
    try {
      const res = await fetch('/api/rmhcode/auth/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || t("failed-to-generate-token", { defaultValue: "Failed to generate token" })); }
      const { token, user } = await res.json();
      const callbackUrl = new URL(callback);
      callbackUrl.searchParams.set('token', token);
      callbackUrl.searchParams.set('session', sessionId);
      callbackUrl.searchParams.set('user', JSON.stringify({ id: user.id, name: user.name, username: user.username }));
      setSuccess(true);
      setTimeout(() => { window.location.href = callbackUrl.toString(); }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : t("authorization-failed", { defaultValue: "Authorization failed" })); setAuthorizing(false); }
  }

  function handleDeny() {
    // Only redirect back to a validated localhost callback (same allowlist as
    // authorize). Otherwise an attacker-supplied callback host would turn Deny
    // into an open redirect, so fall back to the in-app page.
    if (callback && sessionId && isLocalhostCallback(callback)) {
      const callbackUrl = new URL(callback);
      callbackUrl.searchParams.set('error', 'access_denied');
      callbackUrl.searchParams.set('session', sessionId);
      window.location.href = callbackUrl.toString();
    } else {
      navigate({ to: '/rmhcode' });
    }
  }

  if (isPending) return <div className="min-h-screen bg-site-bg flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>;

  if (!session) {
    const loginUrl = `/login?redirect=${encodeURIComponent(`/rmhcode/auth?callback=${encodeURIComponent(callback || '')}&session=${sessionId || ''}`)}`;
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="rounded-xl border border-site-border bg-site-surface p-6 text-center">
            <div className="flex justify-center mb-4"><div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30"><Terminal className="w-8 h-8 text-violet-400" /></div></div>
            <h1 className="text-xl font-semibold text-site-text mb-2">{t("sign-in-to-authorize", { defaultValue: "Sign in to authorize rmhcode" })}</h1>
            <p className="text-sm text-site-text-muted mb-6">{t("sign-in-description", { defaultValue: "You need to sign in to your RMH account to authorize the CLI." })}</p>
            <Link to={loginUrl}><Button variant="accent" className="w-full bg-violet-600 hover:bg-violet-500">{t("sign-in-to-continue", { defaultValue: "Sign In to Continue" })}</Button></Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!callback || !sessionId) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
            <X className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-site-text mb-2">{t("invalid-auth-request", { defaultValue: "Invalid Authorization Request" })}</h1>
            <p className="text-sm text-site-text-muted mb-6">{t("invalid-auth-request-description", { defaultValue: "This page should be opened from the rmhcode CLI. Missing required parameters." })}</p>
            <Link to="/rmhcode"><Button variant="secondary">{t("go-to-rmhcode", { defaultValue: "Go to rmhcode" })}</Button></Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center">
            <div className="flex justify-center mb-4"><div className="p-3 rounded-xl bg-green-500/20 border border-green-500/30"><Check className="w-8 h-8 text-green-400" /></div></div>
            <h1 className="text-xl font-semibold text-site-text mb-2">{t("authorization-successful", { defaultValue: "Authorization Successful!" })}</h1>
            <p className="text-sm text-site-text-muted">{t("redirecting", { defaultValue: "Redirecting back to rmhcode CLI..." })}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-site-bg flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
        <div className="rounded-xl border border-site-border bg-site-surface p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30"><Terminal className="w-8 h-8 text-violet-400" /></div>
            <div><h1 className="text-xl font-semibold text-site-text">{t("authorize-rmhcode", { defaultValue: "Authorize rmhcode" })}</h1><p className="text-sm text-site-text-muted">{t("cli-requesting-access", { defaultValue: "CLI is requesting access to your account" })}</p></div>
          </div>
          <div className="p-4 rounded-lg bg-site-bg border border-site-border mb-6">
            <div className="flex items-center gap-3">
              {session.user.image ? <img src={session.user.image} alt={session.user.name || t("user", { defaultValue: "User" })} className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">{(session.user.name?.[0] || 'U').toUpperCase()}</div>}
              <div><p className="font-medium text-site-text">{session.user.name}</p><p className="text-sm text-site-text-muted">{session.user.email}</p></div>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="text-sm font-medium text-site-text mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-violet-400" />{t("permissions-heading", { defaultValue: "This will allow rmhcode to:" })}</h2>
            <ul className="space-y-2 text-sm text-site-text-muted">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{t("perm-account-info", { defaultValue: "Access your account information" })}</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{t("perm-user-builds", { defaultValue: "Create and manage your User Builds" })}</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{t("perm-publish", { defaultValue: "Publish projects on your behalf" })}</li>
            </ul>
          </div>
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400 mb-6">{error}</div>}
          <div className="flex gap-3">
            <Button onClick={handleDeny} variant="secondary" className="flex-1" disabled={authorizing}>{t("deny", { defaultValue: "Deny" })}</Button>
            <Button onClick={handleAuthorize} variant="accent" className="flex-1 bg-violet-600 hover:bg-violet-500" disabled={authorizing || !!error}>
              {authorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : t("authorize", { defaultValue: "Authorize" })}
            </Button>
          </div>
          <p className="text-xs text-site-text-dim text-center mt-4">{t("token-expiry-notice", { defaultValue: "Token expires in 30 days. You can revoke access anytime from your account settings." })}</p>
        </div>
      </motion.div>
    </div>
  );
}

function RmhCodeAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-site-bg flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>}>
      <AuthContent />
    </Suspense>
  );
}

export const Route = createFileRoute('/rmhcode/auth')({
  validateSearch: (search: Record<string, unknown>) => ({
    callback: (search.callback as string) || '',
    session: (search.session as string) || '',
  }),
  component: RmhCodeAuthPage,
});
