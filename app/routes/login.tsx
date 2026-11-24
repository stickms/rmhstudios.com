/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
/**
 * Login Page Route — a full-screen Liquid Glass sign-in card floating on the
 * theme aurora. Sign-in leads with the fastest paths (passkey + a compact
 * provider row) and progressively discloses the email form to keep the first
 * view simple; sign-up shows the full form.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/components/Providers';
import { useState, useRef, useEffect } from 'react';
import {
  DiscordIcon,
  GithubIcon,
  GitlabIcon,
  MicrosoftIcon,
  SteamIcon,
  TwitchIcon,
  XIcon,
} from '@/components/ui/brand-icons';
import type { SignInProviderId } from '@/lib/auth/providers';
import { getLoginConfig } from '@/lib/auth/sign-in-providers.functions';
import { CAPTCHA_HEADER } from '@/lib/auth/turnstile';
import { safeInternalPath } from '@/lib/auth/redirect';
import { Mail, Lock, User, Camera, Fingerprint, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ImageCropModal } from '@/components/feed/ImageCropModal';
import { TwoFactorSetup } from '@/components/settings/TwoFactorSetup';
import { Switch } from '@/components/ui/switch';
import { TurnstileWidget, type TurnstileHandle } from '@/components/site/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { CookieConsent } from '@/components/site/CookieConsent';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { uploadAvatarApi } from '@/lib/profile.contract';
import { useArrival } from '@/components/ui/arrive';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { callbackURL?: string; error?: string } => ({
    callbackURL:
      (search.callbackURL as string) ||
      (search.callbackUrl as string) ||
      (search.next as string) ||
      undefined,
    // Set by Better Auth when a sign-in or an email link did not finish.
    error: typeof search.error === 'string' ? search.error.slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Login | RMH' }],
  }),
  // Which provider buttons to draw depends on which providers this deploy has
  // credentials for (lib/auth/provider-config.server.ts).
  loader: () => getLoginConfig(),
  component: LoginPage,
});

/** Which action is currently in flight (drives per-button spinners + disabling). */
type Pending = 'passkey' | SignInProviderId | 'email' | null;

function LoginPage() {
  const { t } = useTranslation('pages');
  const { callbackURL: rawCallback, error: linkError } = Route.useSearch();
  const { providers: enabledProviders, turnstileSiteKey } = Route.useLoaderData();
  // Cloudflare Turnstile on sign-up and "Forgot password?", when the server has keys for it (null otherwise).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);

  const [callbackURL, setCallbackURL] = useState(() => safeInternalPath(rawCallback));

  useEffect(() => {
    if (!rawCallback?.startsWith('/')) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin && ref.pathname !== '/login') {
          setCallbackURL(ref.pathname + ref.search);
        }
      } catch {
        // A missing or malformed referrer simply leaves the safe default route.
      }
    }
  }, [rawCallback]);

  const { data: session, isPending } = useSession();
  // Right after an email sign-up the page stays (signed in) to offer two-step verification once: `hold` from the
  // moment the code is sent until the answer is known, then `offer` or `setup`. Optional; "Not now" moves on.
  const [offer2fa, setOffer2fa] = useState<'hold' | 'offer' | 'setup' | null>(null);
  const forwarding = (isPending || !!session?.user) && offer2fa === null;
  const arrival = useArrival(!forwarding);

  useEffect(() => {
    if (!isPending && session?.user && offer2fa === null) {
      window.location.href = callbackURL;
    }
  }, [isPending, session, callbackURL, offer2fa]);

  // Two-step verification: a correct password on an account with it on asks for a code next (`backup` when the
  // person uses one of their backup codes instead of the app).
  const [twoFactor, setTwoFactor] = useState<{ backup: boolean } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false);

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
  // Email/password accounts confirm their address before they can sign in
  // (when the site can send email). Set once we know a link is on its way.
  const [awaitingEmail, setAwaitingEmail] = useState<{ email: string; after: 'sign-up' | 'sign-in' } | null>(
    null,
  );
  const [resending, setResending] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  // Forgot password: `form` asks for the address, `sent` says a link is on its way. The answer is the same whether or
  // not the address has an account (Better Auth sends nothing for an unknown one), so it never reveals who is signed up.
  const [forgot, setForgot] = useState<'form' | 'sent' | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
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

  // Email links and provider errors come back to this page (which forwards a
  // signed-in visitor to `callbackURL`, or explains what went wrong).
  const returnHere = `/login?callbackURL=${encodeURIComponent(callbackURL)}`;
  // A sign-in that creates a brand-new account goes through /account/connect,
  // which offers to join it to an existing account instead.
  const newUserCallbackURL = `/account/connect?next=${encodeURIComponent(callbackURL)}`;

  const resendVerification = async () => {
    if (!awaitingEmail) return;
    setResending(true);
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: awaitingEmail.email,
        type: 'email-verification',
      });
      if (res.error) setError(res.error.message ?? t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
      else {
        setError(null);
        setCode('');
      }
    } finally {
      setResending(false);
    }
  };

  // The account is confirmed and signed in by the code (autoSignInAfterVerification). A picture chosen at sign-up is
  // uploaded now that there is a session to put it on.
  const verifyCode = async (value: string) => {
    if (!awaitingEmail || verifying) return;
    if (!/^\d{6}$/.test(value)) {
      setError(t('code-invalid-format', { defaultValue: 'Enter the 6-digit code from the email.' }));
      return;
    }
    setVerifying(true);
    setError(null);
    const afterSignUp = awaitingEmail.after === 'sign-up';
    // The code signs the new account in; keep the page here for the two-step offer instead of forwarding.
    if (afterSignUp) setOffer2fa('hold');
    try {
      const res = await authClient.emailOtp.verifyEmail({ email: awaitingEmail.email, otp: value });
      if (res.error) {
        if (afterSignUp) setOffer2fa(null);
        setError(
          res.error.code === 'OTP_EXPIRED' || res.error.code === 'TOO_MANY_ATTEMPTS'
            ? t('code-expired', { defaultValue: 'That code has expired. Send a new one.' })
            : t('code-wrong', { defaultValue: 'That code is not right. Check the email and try again.' }),
        );
        setVerifying(false);
        return;
      }
      if (avatarFile) {
        try {
          const formData = new FormData();
          formData.append('avatar', avatarFile);
          await api(uploadAvatarApi, { body: formData });
        } catch {
          // The account is confirmed; the picture is best-effort.
        }
      }
      if (afterSignUp) {
        setVerifying(false);
        setOffer2fa('offer');
        return;
      }
      window.location.href = callbackURL;
    } catch {
      if (afterSignUp) setOffer2fa(null);
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
      setVerifying(false);
    }
  };

  /**
   * The bot-check header for a protected request, or null (and a message) while the check has not finished.
   * Without Turnstile configured it is an empty set of headers.
   */
  const captchaHeaders = (): Record<string, string> | null => {
    if (!turnstileSiteKey) return {};
    if (captchaToken) return { [CAPTCHA_HEADER]: captchaToken };
    setError(t('captcha-wait', { defaultValue: 'Checking your browser. Try again in a moment.' }));
    return null;
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(t('validation-email', { defaultValue: 'Enter a valid email address.' }));
      return;
    }
    const headers = captchaHeaders();
    if (!headers) return;
    setSendingReset(true);
    try {
      const res = await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: '/reset-password',
        fetchOptions: { headers },
      });
      if (res.error) {
        setError(res.error.message ?? t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
      } else {
        setForgot('sent');
      }
    } catch {
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setSendingReset(false);
      turnstile.current?.reset();
    }
  };

  const handleSocial = (provider: SignInProviderId) => async () => {
    setPending(provider);
    setError(null);
    const failed = (message?: string | null) => {
      setPending(null);
      setError(
        message || t('social-error', { defaultValue: 'Could not start sign-in. Try again.' }),
      );
    };
    try {
      if (provider === 'steam') {
        // Steam is OpenID 2.0, served by our own Better Auth plugin
        // (lib/auth/steam.server.ts) rather than `signIn.social`.
        const res = await authClient.$fetch<{ url: string }>('/sign-in/steam', {
          method: 'POST',
          body: { callbackURL, newUserCallbackURL, errorCallbackURL: returnHere },
        });
        if (res.error || !res.data?.url) return failed(res.error?.message);
        window.location.href = res.data.url;
        return;
      }
      const res = await authClient.signIn.social({
        provider,
        callbackURL,
        newUserCallbackURL,
        errorCallbackURL: returnHere,
      });
      // On success the client is already navigating to the provider; stay
      // pending so the page doesn't unlock in the moment before it unloads.
      if (res?.error) failed(res.error.message);
    } catch {
      failed();
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // The form is noValidate, so validate here and surface the failure through
    // the page's own error region instead of the browser's native bubble.
    const trimmedEmail = email.trim();
    if (isSignUp && !displayName.trim()) {
      setError(t('validation-display-name', { defaultValue: 'Enter a display name.' }));
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(t('validation-email', { defaultValue: 'Enter a valid email address.' }));
      return;
    }
    if (password.length < 8) {
      setError(
        t('validation-password', { defaultValue: 'Password must be at least 8 characters.' }),
      );
      return;
    }

    const headers = isSignUp ? captchaHeaders() : {};
    if (!headers) return;
    setPending('email');

    try {
      if (isSignUp) {
        // Without email confirmation the sign-up signs in at once: hold the page for the two-step offer.
        setOffer2fa('hold');
        await authClient.signUp.email(
          {
            email,
            password,
            name: displayName,
            image: avatarFile ? undefined : '/images/social/default_avatar.png',
            // Where the confirmation link lands (this page, then on to callbackURL).
            callbackURL: returnHere,
          },
          {
            headers,
            onResponse: () => turnstile.current?.reset(),
            onSuccess: async (ctx) => {
              // No session yet means the address has to be confirmed first.
              if (!(ctx.data as { token?: string | null } | null)?.token) {
                setPending(null);
                setOffer2fa(null);
                setAwaitingEmail({ email: email.trim(), after: 'sign-up' });
                return;
              }
              if (avatarFile) {
                try {
                  const formData = new FormData();
                  formData.append('avatar', avatarFile);
                  await api(uploadAvatarApi, { body: formData });
                } catch {
                  // Account creation succeeded; avatar upload is best-effort.
                }
              }
              setPending(null);
              setOffer2fa('offer');
            },
            onError: (ctx) => {
              setPending(null);
              setOffer2fa(null);
              setError(ctx.error.message);
            },
          },
        );
      } else {
        await authClient.signIn.email(
          { email, password, callbackURL: returnHere },
          {
            onSuccess: (ctx) => {
              // Two-step verification is on for this account: the password was right, now the code.
              if ((ctx.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
                setPending(null);
                setTwoFactorCode('');
                setTwoFactor({ backup: false });
                return;
              }
              window.location.href = callbackURL;
            },
            onError: (ctx) => {
              setPending(null);
              if (ctx.error.code === 'EMAIL_NOT_VERIFIED') {
                // The server has just sent a fresh link (sendOnSignIn).
                setAwaitingEmail({ email: email.trim(), after: 'sign-in' });
                return;
              }
              setError(ctx.error.message);
            },
          },
        );
      }
    } catch {
      setPending(null);
      setOffer2fa(null);
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    }
  };

  /** The second step of a password sign-in: a code from the app, or a backup code. */
  const verifyTwoFactor = async (value: string) => {
    if (!twoFactor || verifyingTwoFactor) return;
    const clean = twoFactor.backup ? value.trim() : value.replace(/\D/g, '');
    if (!twoFactor.backup && !/^\d{6}$/.test(clean)) {
      setError(t('two-factor-code-format', { defaultValue: 'Enter the 6-digit code from your app.' }));
      return;
    }
    if (twoFactor.backup && clean.length < 10) {
      setError(t('two-factor-backup-format', { defaultValue: 'Enter one of your backup codes, like abcde-12345.' }));
      return;
    }
    setVerifyingTwoFactor(true);
    setError(null);
    try {
      const res = twoFactor.backup
        ? await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: clean, trustDevice });
      if (res.error) {
        const c = res.error.code;
        if (c === 'INVALID_TWO_FACTOR_COOKIE' || c === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') {
          // The challenge is over (ten minutes passed, or five wrong codes): start again from the password.
          setTwoFactor(null);
          setPassword('');
          setError(
            t('two-factor-restart', {
              defaultValue: 'That sign-in timed out or had too many wrong codes. Sign in again.',
            }),
          );
        } else if (c === 'ACCOUNT_TEMPORARILY_LOCKED') {
          setError(t('two-factor-locked', { defaultValue: 'Too many wrong codes. Try again in 15 minutes.' }));
        } else {
          setError(
            twoFactor.backup
              ? t('two-factor-backup-wrong', { defaultValue: 'That backup code is not right, or it was already used.' })
              : t('two-factor-sign-in-wrong', { defaultValue: 'That code is not right. Try the newest code in your app.' }),
          );
        }
        setVerifyingTwoFactor(false);
        return;
      }
      window.location.href = callbackURL;
    } catch {
      setVerifyingTwoFactor(false);
      setError(t('generic-error', { defaultValue: 'Something went wrong. Please try again.' }));
    }
  };

  const finishSignUp = () => {
    window.location.href = callbackURL;
  };

  if (forwarding) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Spinner label={t('loading', { defaultValue: 'Loading…' })} />
      </div>
    );
  }

  const providerButtons: Record<SignInProviderId, { label: string; icon: React.ReactNode }> = {
    discord: {
      label: t('continue-with-discord', { defaultValue: 'Continue with Discord' }),
      icon: <DiscordIcon className="size-5" />,
    },
    github: {
      label: t('continue-with-github', { defaultValue: 'Continue with GitHub' }),
      icon: <GithubIcon className="size-5" />,
    },
    steam: {
      label: t('continue-with-steam', { defaultValue: 'Continue with Steam' }),
      icon: <SteamIcon className="size-5" />,
    },
    twitch: {
      label: t('continue-with-twitch', { defaultValue: 'Continue with Twitch' }),
      icon: <TwitchIcon className="size-5" />,
    },
    microsoft: {
      label: t('continue-with-microsoft', { defaultValue: 'Continue with Microsoft' }),
      icon: <MicrosoftIcon className="size-5" />,
    },
    gitlab: {
      label: t('continue-with-gitlab', { defaultValue: 'Continue with GitLab' }),
      icon: <GitlabIcon className="size-5" />,
    },
    twitter: {
      label: t('continue-with-x', { defaultValue: 'Continue with X' }),
      icon: <XIcon className="size-5" />,
    },
  };
  const providers = enabledProviders.map((id) => ({ id, ...providerButtons[id] }));
  // Two or three in one row; from four up, rows of four.
  const providerGrid =
    providers.length <= 2 ? 'grid-cols-2' : providers.length === 3 ? 'grid-cols-3' : 'grid-cols-4';

  // A sign-in or an email link that came back here without finishing.
  const linkNotice = !linkError
    ? null
    : linkError === 'account_not_linked'
      ? t('notice-account-not-linked', {
          defaultValue:
            'An RMH account already uses that email, but it was not connected automatically because the email is not confirmed on both sides. Sign in the way you did before, then connect it in Settings, Security.',
        })
      : linkError === 'TOKEN_EXPIRED' || linkError === 'INVALID_TOKEN'
        ? t('notice-link-expired', {
            defaultValue: 'That link has expired or was already used. Sign in to get a new one.',
          })
        : linkError === 'access_denied'
          ? t('notice-cancelled', { defaultValue: 'Sign-in was cancelled.' })
          : t('notice-sign-in-failed', { defaultValue: 'Sign-in did not finish. Try again.' });

  // Field glyph shared by the email/password/display-name wells.
  const fieldIcon =
    'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-site-text-muted z-10';

  const emailForm = (
    <form onSubmit={handleCredentialsSubmit} noValidate className="space-y-3">
      {isSignUp && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('choose-avatar', { defaultValue: 'Choose a profile picture' })}
              className="surface-field relative flex size-20 items-center justify-center rounded-full border-dashed hover:border-site-text transition-colors"
            >
              <img
                src={avatarPreview || '/images/social/default_avatar.png'}
                alt={t('avatar-preview-alt', { defaultValue: 'Avatar preview' })}
                className="size-full rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
                }}
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-site-accent text-site-accent-fg">
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
            <p className="text-xs text-site-text-muted">
              {t('optional-profile-picture', { defaultValue: 'Optional profile picture' })}
            </p>
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className="h-12 pl-11 pr-4"
        />
      </div>

      {!isSignUp && (
        <div className="text-end">
          <button
            type="button"
            onClick={() => {
              setForgot('form');
              setError(null);
            }}
            className="inline-flex min-h-11 items-center px-1 text-sm text-site-text-muted underline underline-offset-4 hover:text-site-text"
          >
            {t('forgot-password-link', { defaultValue: 'Forgot password?' })}
          </button>
        </div>
      )}

      {isSignUp && turnstileSiteKey ? (
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action="sign-up" onToken={setCaptchaToken} />
      ) : null}

      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="polite"
          className="rounded-site-sm border border-site-danger/40 bg-site-danger/10 px-3 py-2 text-center text-xs text-site-danger"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="default"
        size="lg"
        loading={pending === 'email'}
        disabled={busy}
        className="w-full"
      >
        {isSignUp
          ? t('create-account-btn', { defaultValue: 'Create account' })
          : t('sign-in-btn', { defaultValue: 'Sign in' })}
      </Button>
    </form>
  );

  return (
    // Phones get one calm, edge-to-edge auth surface; larger screens retain the
    // floating flagship card over the aurora. The card owns mobile safe areas so
    // long sign-up content can scroll naturally without clipped controls.
    // <main> because /login renders outside the _site shell, which is where the
    // site's landmark and skip link live; a deep-linked visit had neither.
    <main
      className={cn('flex min-h-dvh flex-col items-center justify-center sm:px-4 sm:py-8', arrival)}
    >
      {/* The sign-in form: a plain block, full-viewport on a phone and a narrow column from the sm breakpoint. */}
      <div className="relative flex min-h-dvh w-full max-w-none flex-col justify-center rounded-none px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:min-h-0 sm:max-w-sm sm:px-0 sm:py-8">
        {/* Brand + heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" width={48} height={48} className="mb-3 size-12" />
          <p className="site-kicker">RMH Studios</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-site-text">
            {isSignUp
              ? t('create-account-heading', { defaultValue: 'Create your account' })
              : t('welcome-back', { defaultValue: 'Welcome back' })}
          </h1>
          <p className="mt-1 text-sm text-site-text-muted">
            {isSignUp
              ? t('signup-subheading', { defaultValue: 'Make an identity to access the platform.' })
              : t('signin-subheading', { defaultValue: 'Sign in to access your profile.' })}
          </p>
        </div>

        {linkNotice ? (
          <p role="status" className="mb-4 text-center text-sm text-site-text">
            {linkNotice}
          </p>
        ) : null}

        {offer2fa === 'offer' || offer2fa === 'setup' ? (
          <div className="space-y-3">
            <h2 className="t-heading text-center">
              {t('two-factor-offer-title', { defaultValue: 'Add two-step verification?' })}
            </h2>
            {offer2fa === 'offer' ? (
              <>
                <p className="text-center text-sm text-site-text-muted">
                  {t('two-factor-offer-body', {
                    defaultValue:
                      'When you sign in with your password, we also ask for a code from an authenticator app on your phone. It is optional, and you can turn it on later in Settings, Security.',
                  })}
                </p>
                <Button type="button" variant="primary" size="lg" className="w-full" onClick={() => setOffer2fa('setup')}>
                  {t('two-factor-offer-set-up', { defaultValue: 'Set up' })}
                </Button>
                <Button type="button" size="lg" className="w-full" onClick={finishSignUp}>
                  {t('two-factor-offer-skip', { defaultValue: 'Not now' })}
                </Button>
              </>
            ) : (
              <TwoFactorSetup
                password={password}
                onDone={finishSignUp}
                onCancel={finishSignUp}
                cancelLabel={t('two-factor-offer-skip', { defaultValue: 'Not now' })}
                layout="page"
              />
            )}
          </div>
        ) : twoFactor ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyTwoFactor(twoFactorCode);
            }}
            noValidate
            className="space-y-3 text-center"
          >
            <h2 className="t-heading">
              {twoFactor.backup
                ? t('two-factor-backup-title', { defaultValue: 'Enter a backup code' })
                : t('two-factor-code-title', { defaultValue: 'Enter your code' })}
            </h2>
            <p className="text-sm text-site-text-muted">
              {twoFactor.backup
                ? t('two-factor-backup-body', {
                    defaultValue: 'Use one of the backup codes you saved when you turned on two-step verification. Each works once.',
                  })
                : t('two-factor-code-body', {
                    defaultValue: 'Open your authenticator app and enter the 6-digit code for RMH Studios.',
                  })}
            </p>
            <label htmlFor="two-factor-code" className="sr-only">
              {twoFactor.backup
                ? t('two-factor-backup-label', { defaultValue: 'Backup code' })
                : t('two-factor-code-label', { defaultValue: 'Authenticator code' })}
            </label>
            <Input
              id="two-factor-code"
              name={twoFactor.backup ? 'backup-code' : 'otp'}
              type="text"
              inputMode={twoFactor.backup ? 'text' : 'numeric'}
              autoComplete={twoFactor.backup ? 'off' : 'one-time-code'}
              autoCapitalize="off"
              spellCheck={false}
              maxLength={twoFactor.backup ? 11 : 6}
              autoFocus
              value={twoFactorCode}
              onChange={(e) => {
                if (twoFactor.backup) {
                  setTwoFactorCode(e.target.value.slice(0, 11));
                  return;
                }
                // Six digits submit on their own, as the email code does.
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                setTwoFactorCode(digits);
                if (digits.length === 6) void verifyTwoFactor(digits);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'two-factor-error' : undefined}
              className="h-12 text-center font-mono text-lg tracking-[0.3em]"
            />
            {error && (
              <p id="two-factor-error" role="alert" className="text-sm text-site-danger">
                {error}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <Switch
                checked={trustDevice}
                onCheckedChange={setTrustDevice}
                aria-labelledby="trust-device-label"
              />
              <span id="trust-device-label" className="text-sm text-site-text">
                {t('two-factor-trust', { defaultValue: 'Trust this device for 30 days' })}
              </span>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={verifyingTwoFactor} className="w-full">
              {t('two-factor-verify', { defaultValue: 'Verify' })}
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <button
                type="button"
                onClick={() => {
                  setTwoFactor({ backup: !twoFactor.backup });
                  setTwoFactorCode('');
                  setError(null);
                }}
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted underline underline-offset-4 hover:text-site-text"
              >
                {twoFactor.backup
                  ? t('two-factor-use-app', { defaultValue: 'Use your authenticator app' })
                  : t('two-factor-use-backup', { defaultValue: 'Use a backup code' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFactor(null);
                  setTwoFactorCode('');
                  setError(null);
                }}
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted hover:text-site-text"
              >
                {t('check-inbox-back', { defaultValue: 'Back to sign in' })}
              </button>
            </div>
          </form>
        ) : forgot ? (
          forgot === 'sent' ? (
            <div className="space-y-3 text-center">
              <h2 className="t-heading">{t('check-inbox-title', { defaultValue: 'Check your inbox' })}</h2>
              <p className="text-sm text-site-text-muted">
                {t('forgot-sent', {
                  defaultValue:
                    'If {{email}} has an account, we sent it a link to choose a new password. The link expires in an hour.',
                  email: email.trim(),
                })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setForgot(null);
                  setError(null);
                }}
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted transition-colors hover:text-site-text"
              >
                {t('check-inbox-back', { defaultValue: 'Back to sign in' })}
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} noValidate className="space-y-3">
              <h2 className="t-heading text-center">
                {t('forgot-title', { defaultValue: 'Reset your password' })}
              </h2>
              <p className="text-center text-sm text-site-text-muted">
                {t('forgot-desc', {
                  defaultValue: 'Enter the email you sign in with and we will send you a link to choose a new password.',
                })}
              </p>
              <div className="relative">
                <Mail className={fieldIcon} aria-hidden />
                <Input
                  type="email"
                  placeholder={t('email-placeholder', { defaultValue: 'Email address' })}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'forgot-error' : undefined}
                  autoComplete="email"
                  className="h-12 pl-11 pr-4"
                />
              </div>
              {error && (
                <p id="forgot-error" role="alert" className="text-center text-sm text-site-danger">
                  {error}
                </p>
              )}
              {turnstileSiteKey ? (
                <TurnstileWidget
                  ref={turnstile}
                  siteKey={turnstileSiteKey}
                  action="password-reset"
                  onToken={setCaptchaToken}
                />
              ) : null}
              <Button type="submit" variant="primary" size="lg" loading={sendingReset} className="w-full">
                {t('forgot-submit', { defaultValue: 'Send reset link' })}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setForgot(null);
                    setError(null);
                  }}
                  className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted transition-colors hover:text-site-text"
                >
                  {t('check-inbox-back', { defaultValue: 'Back to sign in' })}
                </button>
              </div>
            </form>
          )
        ) : awaitingEmail ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode(code);
            }}
            noValidate
            className="space-y-3 text-center"
          >
            <h2 className="t-heading">{t('check-inbox-title', { defaultValue: 'Check your inbox' })}</h2>
            <p className="text-sm text-site-text-muted">
              {awaitingEmail.after === 'sign-up'
                ? t('code-sent-sign-up', {
                    defaultValue: 'We sent a 6-digit code to {{email}}. Enter it to confirm your email and finish signing up.',
                    email: awaitingEmail.email,
                  })
                : t('code-sent-sign-in', {
                    defaultValue: 'Confirm your email before you sign in. We sent a 6-digit code to {{email}}.',
                    email: awaitingEmail.email,
                  })}
            </p>
            <label htmlFor="verify-code" className="sr-only">
              {t('code-label', { defaultValue: 'Verification code' })}
            </label>
            {/* one-time-code + numeric keypad: iOS and macOS offer the code from Mail above the keyboard, Android's
                keyboard and Chrome offer it from Gmail, and a pasted "123 456" is cleaned to digits. Six digits submit
                on their own, so an autofilled code finishes without another tap. */}
            <Input
              id="verify-code"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (digits.length === 6) void verifyCode(digits);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'verify-error' : undefined}
              className="h-12 text-center font-mono text-lg tracking-[0.3em]"
            />
            {error && (
              <p id="verify-error" role="alert" className="text-sm text-site-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={verifying} className="w-full">
              {t('code-submit', { defaultValue: 'Confirm email' })}
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted underline underline-offset-4 hover:text-site-text"
              >
                {t('code-resend', { defaultValue: 'Send a new code' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAwaitingEmail(null);
                  setCode('');
                  setError(null);
                }}
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-site-text-muted hover:text-site-text"
              >
                {t('check-inbox-back', { defaultValue: 'Back to sign in' })}
              </button>
            </div>
          </form>
        ) : (
        <div className="space-y-3">
          {/* Passkey is the promoted primary path: fastest + phishing-resistant.
              (Conditional-UI autofill also offers it in the email field.) */}
          {!isSignUp && (
            <Button
              type="button"
              variant="default"
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
          <div className={cn('grid gap-2', providerGrid)}>
            {providers.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="default"
                size="lg"
                onClick={handleSocial(p.id)}
                disabled={busy}
                aria-label={p.label}
                title={p.label}
                className="w-full"
              >
                {pending === p.id ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  p.icon
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs text-site-text-muted">
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
              variant="default"
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
              className={cn(
                'inline-flex min-h-11 max-w-full flex-wrap items-center justify-center gap-1.5 px-3 text-sm text-site-text-muted transition-colors hover:text-site-text',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              {/* Two spans, not one sentence: nothing used to mark which part
                  of "Don't have an account? Sign up" was the control. */}
              <span>
                {isSignUp
                  ? t('already-have-account-prompt', { defaultValue: 'Already have an account?' })
                  : t('no-account-prompt', { defaultValue: "Don't have an account?" })}
              </span>
              <span className="font-semibold text-site-accent underline underline-offset-4">
                {isSignUp
                  ? t('sign-in-action', { defaultValue: 'Sign in' })
                  : t('sign-up-action', { defaultValue: 'Sign up' })}
              </span>
            </button>
          </div>
        </div>
        )}
        {/* Back to the site — kept inside the mobile full-screen surface so it
            participates in the same spacing and never creates a second viewport. */}
        <Link
          to="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-1.5 text-sm text-site-text-muted transition-colors hover:text-site-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('back-to-home', { defaultValue: 'Back to home' })}
        </Link>
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onCropDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}

      {/* Consent is mounted by the _site shell, which this route renders
          outside of — so a visitor who deep-links to /login (the most common
          first-touch after an OAuth bounce) got no consent prompt at all. */}
      <CookieConsent />
    </main>
  );
}
