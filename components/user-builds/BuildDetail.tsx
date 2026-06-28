'use client';

import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Heart, Eye, Github, ExternalLink, Calendar, ArrowLeft, Edit, Trash2, Loader2, Lock } from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { BlurImage } from '@/components/ui/BlurImage';
import { UserAvatar } from '@/components/ui/UserAvatar';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import type { Build } from '@/lib/user-builds-types';
import { TechBadges } from './TechBadges';
import { BuildComments } from './BuildComments';
import { formatCount } from '@/lib/utils';

interface BuildDetailProps {
  build: Build;
  backHref?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function BuildDetail({ build: initialBuild, backHref = '/builds' }: BuildDetailProps) {
  const { t } = useTranslation("c-user-builds");
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [build, setBuild] = useState(initialBuild);
  const [liking, setLiking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const isOwner = session?.user?.id === build.user.id || !!(session?.user as any)?.isAdmin;

  const viewTrackedRef = useRef(false);

  // The SSR loader fetches anonymously, so a paid build always arrives locked.
  // Once signed in, re-fetch with credentials to reveal it for the owner or a
  // prior buyer.
  useEffect(() => {
    if (!build.locked || !session) return;
    let active = true;
    fetch(`/api/user-builds/${build.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data && !data.locked) setBuild((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, build.id]);

  const handleUnlock = async () => {
    if (unlocking) return;
    setUnlocking(true);
    try {
      const res = await fetch(`/api/user-builds/${build.id}/unlock`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBuild((prev) => ({
          ...prev,
          locked: false,
          unlocked: true,
          readme: data.readme ?? prev.readme,
          repoUrl: data.repoUrl ?? prev.repoUrl,
          demoUrl: data.demoUrl ?? prev.demoUrl,
        }));
      } else if (data?.error) {
        alert(data.error);
      }
    } finally {
      setUnlocking(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("delete-confirm", { defaultValue: 'Delete "{{title}}"? This cannot be undone.', title: build.title }))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/user-builds/${build.id}`, { method: 'DELETE' });
      if (res.ok) {
        navigate({ to: '/builds' });
      }
    } catch (error) {
      console.error('Error deleting build:', error);
    } finally {
      setDeleting(false);
    }
  };

  // Track view on mount
  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    fetch(`/api/user-builds/${build.id}/view`, { method: 'POST' }).catch(() => {});
  }, [build.id]);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);

    // Optimistic update
    setBuild((prev) => ({
      ...prev,
      liked: !prev.liked,
      likeCount: prev.liked ? prev.likeCount - 1 : prev.likeCount + 1,
    }));

    try {
      const res = await fetch(`/api/user-builds/${build.id}/like`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBuild((prev) => ({ ...prev, liked: data.liked, likeCount: data.likeCount }));
      }
    } catch {
      // Revert on error
      setBuild((prev) => ({
        ...prev,
        liked: !prev.liked,
        likeCount: prev.liked ? prev.likeCount + 1 : prev.likeCount - 1,
      }));
    } finally {
      setLiking(false);
    }
  };

  const chip = 'px-2.5 py-1 rounded-full text-xs border border-white/12 bg-white/[0.05] text-[#a1a1a6]';
  const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-6';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link to={backHref} className="builds-detail__back">
        <ArrowLeft className="w-4 h-4" />
        {t("back-to-builds", { defaultValue: "Back to builds" })}
      </Link>

      {/* Header */}
      <div className="mt-7 mb-8">
        {/* Category & Status */}
        <div className="flex items-center gap-2 mb-4">
          {build.category && <span className={chip}>{build.category.name}</span>}
          {build.featured && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-amber-400/30 bg-amber-400/10 text-amber-300">
              {t("curated", { defaultValue: "Curated" })}
            </span>
          )}
          {build.visibility !== 'PUBLIC' && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-white/12 bg-white/[0.05] text-[#6e6e73]">
              {build.visibility}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="builds-detail__title">{build.title}</h1>

        {/* Author & Date */}
        <div className="flex items-center flex-wrap gap-4 mt-5 mb-5">
          <Link
            to={`/u/${build.user.handle || build.user.id}` as string}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <UserAvatar src={build.user.image ?? undefined} alt={build.user.name || 'User'} size={40} fallbackName={build.user.name ?? undefined} />
            <div>
              <p className="font-medium text-[#f5f5f7]">{build.user.name || t("anonymous", { defaultValue: "Anonymous" })}</p>
              {build.user.username && <p className="text-sm text-[#6e6e73]">@{build.user.username}</p>}
            </div>
          </Link>

          <span className="text-[#3a3a3d]">|</span>

          <span className="flex items-center gap-2 text-sm text-[#a1a1a6]">
            <Calendar className="w-4 h-4" />
            {formatDate(build.publishedAt || build.createdAt)}
          </span>

          {isOwner && (
            <div className="ml-auto flex items-center gap-2">
              <Link
                to={`/user-builds/submit?edit=${build.id}` as string}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/12 text-sm text-[#a1a1a6] hover:text-[#f5f5f7] hover:border-white/25 transition-colors"
              >
                <Edit className="w-4 h-4" />
                {t("edit", { defaultValue: "Edit" })}
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/12 text-sm text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t("delete", { defaultValue: "Delete" })}
              </button>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="builds-detail__lead">{build.description}</p>

        {/* Tech Stack */}
        {build.technologies.length > 0 && (
          <div className="mt-6">
            <TechBadges technologies={build.technologies} />
          </div>
        )}

        {/* Tags */}
        {build.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {build.tags.map((tag) => (
              <span key={tag} className={chip}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center flex-wrap gap-3 mt-7">
          {build.repoUrl && (
            <a
              href={build.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/12 text-[#f5f5f7] hover:border-white/25 transition-colors"
            >
              <Github className="w-4 h-4" />
              {t("view-source", { defaultValue: "View Source" })}
            </a>
          )}
          {build.demoUrl && (
            <a
              href={build.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#f5f5f7] text-[#0a0a0a] font-medium hover:bg-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t("live-demo", { defaultValue: "Live Demo" })}
            </a>
          )}

          <div className="flex items-center gap-5 ml-auto text-[#a1a1a6]">
            <button
              onClick={handleLike}
              disabled={liking || !session}
              className={`flex items-center gap-2 transition-colors ${
                build.liked ? 'text-red-400' : 'hover:text-red-400'
              } disabled:opacity-50`}
              title={session ? '' : t("sign-in-to-like", { defaultValue: "Sign in to like" })}
            >
              {liking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Heart className={`w-5 h-5 ${build.liked ? 'fill-current' : ''}`} />
              )}
              {formatCount(build.likeCount)}
            </button>
            <span className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {formatCount(build.viewCount)}
            </span>
          </div>
        </div>
      </div>

      {/* Thumbnail */}
      {build.thumbnailUrl && (
        <div className="builds-detail__thumb mb-8">
          <BlurImage src={build.thumbnailUrl} alt={build.title} fit="cover" width={1280} quality={85} sizes="100vw" className="w-full" imgClassName="w-full" />
        </div>
      )}

      {/* Paywall — paid build whose content the viewer hasn't unlocked */}
      {build.locked && (
        <div className={`${card} mb-6 text-center`}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
            <Lock className="h-6 w-6 text-[#f5a623]" />
          </div>
          <h2 className="text-lg font-semibold text-[#f5f5f7]">{t("premium-build", { defaultValue: "Premium build" })}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#a1a1a6]">
            {t("premium-build-desc", { defaultValue: "Unlock the README, source, and live demo for this build." })}
          </p>
          <button
            onClick={handleUnlock}
            disabled={unlocking || !session}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f5a623] px-5 py-2.5 font-semibold text-[#0a0a0a] transition-colors hover:bg-[#ffb733] disabled:opacity-50"
          >
            {unlocking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CoinIcon className="h-4 w-4" />
                {session ? t("unlock-for", { defaultValue: "Unlock for {{price}}", price: (build.price ?? 0).toLocaleString() }) : t("sign-in-to-unlock", { defaultValue: "Sign in to unlock" })}
              </>
            )}
          </button>
        </div>
      )}

      {/* README */}
      {!build.locked && build.readme && (
        <div className={`${card} mb-6`}>
          <h2 className="text-lg font-semibold text-[#f5f5f7] mb-4">{t("readme", { defaultValue: "README" })}</h2>
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{build.readme}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Version History */}
      {build.versions && build.versions.length > 0 && (
        <div className={`${card} mb-6`}>
          <h2 className="text-lg font-semibold text-[#f5f5f7] mb-4">{t("version-history", { defaultValue: "Version History" })}</h2>
          <div className="space-y-3">
            {build.versions.map((version) => (
              <div key={version.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04]">
                <span className="px-2 py-0.5 rounded bg-white/10 text-[#f5f5f7] text-sm font-mono">v{version.version}</span>
                <div className="flex-1 min-w-0">
                  {version.changelog && <p className="text-sm text-[#a1a1a6]">{version.changelog}</p>}
                  <p className="text-xs text-[#6e6e73] mt-1">
                    {formatDate(version.createdAt)}
                    {version.commitHash && <span className="ml-2 font-mono">{version.commitHash.slice(0, 7)}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className={card}>
        <BuildComments buildId={build.id} />
      </div>
    </div>
  );
}
