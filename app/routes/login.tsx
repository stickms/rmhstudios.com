/**
 * Login Page Route — a full-screen Liquid Glass sign-in card floating on the
 * theme aurora. Sign-in leads with the fastest paths (passkey + a compact
 * provider row) and progressively discloses the email form to keep the first
 * view simple; sign-up shows the full form.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useState, useRef, useEffect } from 'react';
import { FaDiscord, FaGoogle, FaGithub } from 'react-icons/fa';
import { Mail, Lock, User, Camera, Fingerprint, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ImageCropModal } from '@/components/feed/ImageCropModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackURL: (search.callbackURL as string) || (search.callbackUrl as string) || (search.next as string) || undefined,
  }),
  head: () => ({
    meta: [{ title: 'Login | RMH' }],
  }),
  component: LoginPage,
});

/**
 * Only allow a same-site absolute path as a post-login redirect target.
 * Browsers strip control characters and normalize "\" to "/", so a naive
 * `startsWith('/') && !startsWith('//')` guard is bypassed by "/\evil.com" or
 * "/\t//evil.com" — both resolve to an off-site protocol-relative URL when
 * assigned to `window.location.href`. Require a leading "/" NOT followed by "/"
 * or "\", and reject control characters. (SSR-safe: no `window` access.)
 */
function safeInternalPath(raw?: string): string {
  if (!raw) return '/';
  // Reject any control character (U+0000–U+001F or U+007F): browsers strip them
  // before navigating, which would otherwise let "/\t//evil.com" slip past the
  // leading-slash guard below. A char-code scan avoids embedding raw control
  // bytes (or a control-char regex) in source.
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return '/';
  }
  return /^\/(?![/\\])/.test(raw) ? raw : '/';
}

/** Which action is currently in flight (drives per-button spinners + disabling). */
type Pending = 'passkey' | 'discord' | 'google' | 'github' | 'email' | null;

function LoginPage() {
  const { t } = useTranslation('pages');
  const { callbackURL: rawCallback } = Route.useSearch();

  const [callbackURL, setCallbackURL] = useState(() => safeInternalPath(rawCallback));

  useEffect(() => {
    if (!rawCallback?.startsWith('/')) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin && ref.pathname !== '/login') {
          setCallbackURL(ref.pathname + ref.search);
        }
      } catch {}
    }
  }, [rawCallback]);

  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session?.user) {
      window.location.href = callbackURL;
    }
  }, [isPending, session, callbackURL]);

  const [isSignUp, setIsSignUp] = useState(false);
  // Progressive disclosure: on sign-in the email form is hidden behind a button
  // so the first view is just passkey + providers. Sign-up shows it outright.
  const [showEmail, setShowEmail] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const busy = pending !== null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [avatarPreview, cropSrc]);

  const switchMode = () => {
    setIsSignUp((v) => {
      const next = !v;
      // Sign-up is form-centric (reveal it); sign-in starts collapsed.
      setShowEmail(next);
      return next;
    });
    setError(null);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t('image-size-error', { defaultValue: 'Image must be under 5 MB.' }));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    e.target.value = '';
  };

  const handleCropDone = (croppedBlob: Blob) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    const preview = URL.createObjectURL(croppedBlob);
    setAvatarPreview(preview);
    setAvatarFile(new File([croppedBlob], 'avatar.png', { type: 'image/png' }));
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  // Conditional-UI passkey sign-in: when the browser supports it, a saved
  // passkey is offered directly in the email field's autofill dropdown.
  useEffect(() => {
    if (isSignUp) return;
    let cancelled = false;
    (async () => {
      try {
        if (
          typeof window.PublicKeyCredential === 'undefined' ||
          !(await window.PublicKeyCredential.isConditionalMediationAvailable?.())
        ) {
          return;
        }
        const res = await authClient.signIn.passkey({ autoFill: true });
        if (!cancelled && res && 'data' in res && res.data?.session) {
          window.location.href = callbackURL;
        }
      } catch {
        // Conditional mediation aborted (navigation, second call) — ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignUp, callbackURL]);

  const handlePasskeySignIn = async () => {
    setPending('passkey');
    setError(null);
    try {
      const res = await authClient.signIn.passkey();
      if (res && 'data' in res && res.data?.session) {
        window.location.href = callbackURL;
        return;
      }
      if (res?.error?.message) setError(res.error.message);
    } catch {
      setError(t('passkey-error', { defaultValue: 'Passkey sign-in was cancelled or failed.' }));
    } finally {
      setPending(null);
    }
  };

  const handleSocial = (provider: 'discord' | 'google' | 'github') => async () => {
    setPending(provider);
    setError(null);
    await authClient.signIn.social({ provider, callbackURL });
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending('email');
    setError(null);

    try {
      if (isSignUp) {
        await authClient.signUp.email(
          {
            email,
            password,
            name: displayName,
            image: avatarFile ? undefined : '/images/social/default_avatar.png',
            callbackURL,
          } as any,
          {
            onSuccess: async () => {
              if (avatarFile) {
                try {
                  const formData = new FormData();
                  formData.append('avatar', avatarFile);
                  await fetch('/api/profile/avatar', { method: 'POST', body: formData });
                } catch {}
              }
              window.location.href = callbackURL;
            },
            onError: (ctx: any) => {
              setPending(null);
              setError(ctx.error.message);
            },
          }
        );
      } else {
        await authClient.signIn.email(
          { email, password, callbackURL },
          {
            onSuccess: () => {
              window.location.href = callbackURL;
            },
            onError: (ctx: any) => {
              setPending(null);
              setError(ctx.error.message);
            },
          }
        );
      }
    } catch {
      setPending(null);
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    }
  };

  if (isPending || session?.user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-site-accent" aria-label={t('loading', { defaultValue: 'Loading…' })} />
      </div>
    );
  }

  const providers = [
    { id: 'discord' as const, label: t('continue-with-discord', { defaultValue: 'Continue with Discord' }), icon: <FaDiscord className="size-5 text-[#5865F2]" /> },
    { id: 'google' as const, label: t('continue-with-google', { defaultValue: 'Continue with Google' }), icon: <FaGoogle className="size-5 text-[#ea4335]" /> },
    { id: 'github' as const, label: t('continue-with-github', { defaultValue: 'Continue with GitHub' }), icon: <FaGithub className="size-5" /> },
  ];

  // Field glyph shared by the email/password/display-name wells.
  const fieldIcon = 'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-site-text-dim z-10';

  const emailForm = (
    <form onSubmit={handleCredentialsSubmit} className="space-y-3">
      {isSignUp && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('choose-avatar', { defaultValue: 'Choose a profile picture' })}
              className="glass-inset relative flex size-20 items-center justify-center rounded-full border-dashed hover:border-site-border-bright transition-colors"
            >
              <img
                src={avatarPreview || '/images/social/default_avatar.png'}
                alt={t('avatar-preview-alt', { defaultValue: 'Avatar preview' })}
                className="size-full rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-site-accent text-site-accent-fg shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]">
                <Camera className="size-3.5" aria-hidden />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            <p className="text-xs text-site-text-dim">{t('optional-profile-picture', { defaultValue: 'Optional profile picture' })}</p>
          </div>

          <div className="relative">
            <User className={fieldIcon} aria-hidden />
            <Input
              type="text"
              placeholder={t('display-name-placeholder', { defaultValue: 'Display name' })}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              className="h-12 pl-11 pr-4"
            />
          </div>
        </div>
      )}

      <div className="relative">
        <Mail className={fieldIcon} aria-hidden />
        <Input
          type="email"
          placeholder={t('email-placeholder', { defaultValue: 'Email address' })}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          // "webauthn" lets the browser offer saved passkeys in the autofill
          // dropdown (conditional UI, wired above).
          autoComplete={isSignUp ? 'email' : 'username webauthn'}
          className="h-12 pl-11 pr-4"
        />
      </div>

      <div className="relative">
        <Lock className={fieldIcon} aria-hidden />
        <Input
          type="password"
          placeholder={t('password-placeholder', { defaultValue: 'Password' })}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className="h-12 pl-11 pr-4"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-site-sm border border-site-danger/40 bg-site-danger/10 px-3 py-2 text-center text-xs text-site-danger"
        >
          {error}
        </div>
      )}

      <Button type="submit" variant="accent" size="lg" loading={pending === 'email'} disabled={busy} className="w-full">
        {isSignUp ? t('create-account-btn', { defaultValue: 'Create account' }) : t('sign-in-btn', { defaultValue: 'Sign in' })}
      </Button>
    </form>
  );

  return (
    // No opaque full-viewport fill — the body paints the theme aurora and the
    // card floats on it as glass. dvh + safe-area keeps it clear of the notch /
    // home-indicator now that the global body inset is gone.
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Flagship: a singular L2 pane with hero edge-refraction + prism rim
          (1 of ≤2/page). */}
      <div className="glass-pane glass-refract glass-refract--prism relative w-full max-w-sm p-6 sm:p-8">
        {/* Brand + heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="glass-inset mb-3 flex size-12 items-center justify-center rounded-2xl">
            <span className="font-serif text-lg font-bold tracking-tight text-site-text">R</span>
          </div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-site-text-dim">RMH Studios</p>
          <h1 className="mt-1.5 font-(family-name:--site-font-display) text-2xl font-bold tracking-tight text-site-text">
            {isSignUp ? t('create-account-heading', { defaultValue: 'Create your account' }) : t('welcome-back', { defaultValue: 'Welcome back' })}
          </h1>
          <p className="mt-1 text-sm text-site-text-muted">
            {isSignUp ? t('signup-subheading', { defaultValue: 'Make an identity to access the platform.' }) : t('signin-subheading', { defaultValue: 'Sign in to access your profile.' })}
          </p>
        </div>

        <div className="space-y-3">
          {/* Passkey is the promoted primary path: fastest + phishing-resistant.
              (Conditional-UI autofill also offers it in the email field.) */}
          {!isSignUp && (
            <Button
              type="button"
              variant="accent"
              size="lg"
              onClick={handlePasskeySignIn}
              loading={pending === 'passkey'}
              loadingText={t('connecting', { defaultValue: 'Connecting…' })}
              disabled={busy}
              className="w-full"
            >
              <Fingerprint className="size-5" aria-hidden />
              <span>{t('continue-with-passkey', { defaultValue: 'Sign in with a passkey' })}</span>
            </Button>
          )}

          {/* Providers: a compact row of glass chips — brand glyphs keep full
              colour (they are content, not chrome). Labelled for assistive tech. */}
          <div className="grid grid-cols-3 gap-2">
            {providers.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleSocial(p.id)}
                disabled={busy}
                aria-label={p.label}
                title={p.label}
                className="w-full"
              >
                {pending === p.id ? <Loader2 className="size-5 animate-spin" aria-hidden /> : p.icon}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-[0.68rem] uppercase tracking-[0.14em] text-site-text-dim">
              {t('or-with-email', { defaultValue: 'or with email' })}
            </span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          {/* Email: revealed on demand (sign-in) or shown outright (sign-up). */}
          {showEmail ? (
            emailForm
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowEmail(true)}
              disabled={busy}
              className="w-full"
            >
              <Mail className="size-4" aria-hidden />
              <span>{t('continue-with-email', { defaultValue: 'Continue with email' })}</span>
            </Button>
          )}

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={switchMode}
              className={cn('text-sm text-site-text-dim transition-colors hover:text-site-text', busy && 'pointer-events-none opacity-60')}
            >
              {isSignUp ? t('already-have-account', { defaultValue: 'Already have an account? Sign in' }) : t('no-account', { defaultValue: "Don't have an account? Sign up" })}
            </button>
          </div>
        </div>
      </div>

      {/* Back to the site — a quiet escape hatch. */}
      <Link
        to="/"
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-site-text-dim transition-colors hover:text-site-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back-to-home', { defaultValue: 'Back to home' })}
      </Link>

      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} onCropDone={handleCropDone} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
