/**
 * Login Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useState, useRef, useEffect } from 'react';
import { FaDiscord, FaGoogle, FaGithub } from 'react-icons/fa';
import { MdEmail, MdLock, MdPerson, MdCameraAlt } from 'react-icons/md';
import { ImageCropModal } from '@/components/feed/ImageCropModal';
import '@/components/rmhvibe/vibe.css';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackURL: (search.callbackURL as string) || (search.callbackUrl as string) || (search.next as string) || undefined,
  }),
  head: () => ({
    meta: [{ title: 'Login | RMH' }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("pages");
  const { callbackURL: rawCallback } = Route.useSearch();

  const [callbackURL, setCallbackURL] = useState(() =>
    rawCallback?.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/'
  );

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
  const [loading, setLoading] = useState(false);
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

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t("image-size-error", { defaultValue: "Image must be under 5 MB." }));
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

  const handleDiscordSignIn = async () => {
    setLoading(true);
    await authClient.signIn.social({ provider: 'discord', callbackURL });
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    await authClient.signIn.social({ provider: 'google', callbackURL });
  };

  const handleGitHubSignIn = async () => {
    setLoading(true);
    await authClient.signIn.social({ provider: 'github', callbackURL });
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
            onRequest: () => setLoading(true),
            onSuccess: async () => {
              if (avatarFile) {
                try {
                  const formData = new FormData();
                  formData.append('avatar', avatarFile);
                  await fetch('/api/profile/avatar', { method: 'POST', body: formData });
                } catch {}
              }
              setLoading(false);
              window.location.href = callbackURL;
            },
            onError: (ctx: any) => {
              setLoading(false);
              setError(ctx.error.message);
            },
          }
        );
      } else {
        await authClient.signIn.email(
          { email, password, callbackURL },
          {
            onRequest: () => setLoading(true),
            onSuccess: () => {
              setLoading(false);
              window.location.href = callbackURL;
            },
            onError: (ctx: any) => {
              setLoading(false);
              setError(ctx.error.message);
            },
          }
        );
      }
    } catch {
      setLoading(false);
      setError(t("generic-error", { defaultValue: "Something went wrong. Please try again." }));
    }
  };

  if (isPending || session?.user) {
    return (
      <div className="vibe-screen min-h-screen flex items-center justify-center">
        <p className="vibe-hint">{t("loading", { defaultValue: "Loading…" })}</p>
      </div>
    );
  }

  const socialBtn =
    'w-full flex items-center justify-center gap-3 h-12 rounded-full bg-white/[0.05] border border-white/12 text-[#f5f5f7] font-medium transition-all hover:bg-white/[0.09] hover:border-white/25 disabled:opacity-50';
  const field =
    'w-full h-12 rounded-2xl bg-white/[0.05] border border-white/12 pl-11 pr-4 text-[#f5f5f7] placeholder-[#6e6e73] outline-none focus:border-white/30 transition-colors';
  const fieldIcon = 'absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6e6e73]';

  return (
    <div className="vibe-screen min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-7 sm:p-9 shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
        <div className="text-center mb-7">
          <p className="vibe-presents mb-2">RMH Studios</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f7]">
            {isSignUp ? t("create-account-heading", { defaultValue: "Create your account" }) : t("welcome-back", { defaultValue: "Welcome back" })}
          </h1>
          <p className="text-sm text-[#a1a1a6] mt-1.5">
            {isSignUp ? t("signup-subheading", { defaultValue: "Make an identity to access the platform." }) : t("signin-subheading", { defaultValue: "Sign in to access your profile." })}
          </p>
        </div>

        <div className="space-y-3">
          <button onClick={handleDiscordSignIn} disabled={loading} className={socialBtn}>
            {loading ? (
              <span className="animate-pulse text-[#a1a1a6]">{t("connecting", { defaultValue: "Connecting…" })}</span>
            ) : (
              <>
                <FaDiscord className="text-xl text-[#5865F2]" />
                <span>{t("continue-with-discord", { defaultValue: "Continue with Discord" })}</span>
              </>
            )}
          </button>

          <button onClick={handleGoogleSignIn} disabled={loading} className={socialBtn}>
            {loading ? (
              <span className="animate-pulse text-[#a1a1a6]">{t("connecting", { defaultValue: "Connecting…" })}</span>
            ) : (
              <>
                <FaGoogle className="text-xl text-[#ea4335]" />
                <span>{t("continue-with-google", { defaultValue: "Continue with Google" })}</span>
              </>
            )}
          </button>

          <button onClick={handleGitHubSignIn} disabled={loading} className={socialBtn}>
            {loading ? (
              <span className="animate-pulse text-[#a1a1a6]">{t("connecting", { defaultValue: "Connecting…" })}</span>
            ) : (
              <>
                <FaGithub className="text-xl" />
                <span>{t("continue-with-github", { defaultValue: "Continue with GitHub" })}</span>
              </>
            )}
          </button>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-[0.68rem] uppercase tracking-[0.14em] text-[#6e6e73] bg-[#0c0c0d]">
                {t("or-with-email", { defaultValue: "or with email" })}
              </span>
            </div>
          </div>

          <form onSubmit={handleCredentialsSubmit} className="space-y-3">
            {isSignUp && (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-20 h-20 rounded-full bg-white/[0.04] border-2 border-dashed border-white/15 hover:border-white/35 flex items-center justify-center transition-colors"
                  >
                    <img
                      src={avatarPreview || '/images/social/default_avatar.png'}
                      alt={t("avatar-preview-alt", { defaultValue: "Avatar preview" })}
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 bg-[#f5f5f7] rounded-full flex items-center justify-center border-2 border-[#0c0c0d]">
                      <MdCameraAlt className="w-3.5 h-3.5 text-[#0a0a0a]" />
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                  <p className="text-xs text-[#6e6e73]">{t("optional-profile-picture", { defaultValue: "Optional profile picture" })}</p>
                </div>

                <div className="relative">
                  <MdPerson className={fieldIcon} />
                  <input
                    type="text"
                    placeholder={t("display-name-placeholder", { defaultValue: "Display name" })}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className={field}
                  />
                </div>
              </div>
            )}

            <div className="relative">
              <MdEmail className={fieldIcon} />
              <input
                type="email"
                placeholder={t("email-placeholder", { defaultValue: "Email address" })}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={field}
              />
            </div>

            <div className="relative">
              <MdLock className={fieldIcon} />
              <input
                type="password"
                placeholder={t("password-placeholder", { defaultValue: "Password" })}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={field}
              />
            </div>

            {error && (
              <div className="text-red-400 text-xs text-center bg-red-500/10 py-2 rounded-lg border border-red-500/25">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-[#f5f5f7] text-[#0a0a0a] font-semibold transition-all hover:bg-white disabled:opacity-50"
            >
              {loading ? t("processing", { defaultValue: "Processing…" }) : isSignUp ? t("create-account-btn", { defaultValue: "Create account" }) : t("sign-in-btn", { defaultValue: "Sign in" })}
            </button>
          </form>

          <div className="text-center pt-1">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-[#6e6e73] hover:text-[#f5f5f7] text-sm transition-colors"
            >
              {isSignUp ? t("already-have-account", { defaultValue: "Already have an account? Sign in" }) : t("no-account", { defaultValue: "Don't have an account? Sign up" })}
            </button>
          </div>
        </div>
      </div>

      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} onCropDone={handleCropDone} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
