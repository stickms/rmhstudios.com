'use client';

import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Heart, Eye, Github, ExternalLink, Calendar, ArrowLeft, Edit, Trash2, Loader2, Lock } from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { BlurImage } from '@/components/ui/BlurImage';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import type { Build } from '@/lib/user-builds-types';
import { TechBadges } from './TechBadges';
import { BuildComments } from './BuildComments';
import { formatCount } from '@/lib/utils';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';

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
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [build, setBuild] = useState(initialBuild);
  const { run: runLike, pending: liking } = useOptimisticAction();
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
    if (!(await confirm({ title: t("delete-confirm", { defaultValue: 'Delete "{{title}}"? This cannot be undone.', title: build.title }), danger: true }))) return;

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

  const handleLike = () => {
    const wasLiked = build.liked;
    const prevCount = build.likeCount;
    runLike({
      apply: () =>
        setBuild((prev) => ({
          ...prev,
          liked: !prev.liked,
          likeCount: prev.liked ? prev.likeCount - 1 : prev.likeCount + 1,
        })),
      rollback: () => setBuild((prev) => ({ ...prev, liked: wasLiked, likeCount: prevCount })),
      commit: () => fetch(`/api/user-builds/${build.id}/like`, { method: 'POST' }),
      reconcile: async (res) => {
        const data = await res.json();
        setBuild((prev) => ({ ...prev, liked: data.liked, likeCount: data.likeCount }));
      },
    });
  };

  const chip = 'px-2.5 py-1 rounded-full text-xs border border-site-border bg-site-surface text-site-text-muted';
  const card = 'rounded-site border border-site-border bg-site-surface p-6';

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
            <span className="px-2.5 py-1 rounded-full text-xs border border-site-warning/30 bg-site-warning/10 text-site-warning">
              {t("curated", { defaultValue: "Curated" })}
            </span>
          )}
          {build.visibility !== 'PUBLIC' && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-site-border bg-site-surface text-site-text-dim">
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
              <p className="font-medium text-site-text">{build.user.name || t("anonymous", { defaultValue: "Anonymous" })}</p>
              {build.user.username && <p className="text-sm text-site-text-dim">@{build.user.username}</p>}
            </div>
          </Link>

          <span className="text-site-text-dim">|</span>

          <span className="flex items-center gap-2 text-sm text-site-text-muted">
            <Calendar className="w-4 h-4" />
            {formatDate(build.publishedAt || build.createdAt)}
          </span>

          {isOwner && (
            <div className="ml-auto flex items-center gap-2">
              <Link
                to={`/user-builds/submit?edit=${build.id}` as string}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-site-surface border border-site-border text-sm text-site-text-muted hover:text-site-text hover:border-site-border-bright transition-colors"
              >
                <Edit className="w-4 h-4" />
                {t("edit", { defaultValue: "Edit" })}
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-site-surface border border-site-border text-sm text-site-danger hover:text-site-danger hover:border-site-danger/40 transition-colors disabled:opacity-50"
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
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-site-surface border border-site-border text-site-text hover:border-site-border-bright transition-colors"
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
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-site-accent text-site-accent-fg font-medium hover:bg-site-accent-hover transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t("live-demo", { defaultValue: "Live Demo" })}
            </a>
          )}

          <div className="flex items-center gap-5 ml-auto text-site-text-muted">
            <button
              onClick={handleLike}
              disabled={liking || !session}
              className={`flex items-center gap-2 transition-colors ${
                build.liked ? 'text-site-danger' : 'hover:text-site-danger'
              } disabled:opacity-50`}
              title={session ? '' : t("sign-in-to-like", { defaultValue: "Sign in to like" })}
            >
              {liking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Heart className={`w-5 h-5 ${build.liked ? 'fill-current' : ''}`} />
              )}
              <AnimatedCount value={build.likeCount} format={formatCount} />
            </button>
            <span className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              <AnimatedCount value={build.viewCount} format={formatCount} />
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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-site-surface">
            <Lock className="h-6 w-6 text-site-warning" />
          </div>
          <h2 className="text-lg font-semibold text-site-text">{t("premium-build", { defaultValue: "Premium build" })}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-site-text-muted">
            {t("premium-build-desc", { defaultValue: "Unlock the README, source, and live demo for this build." })}
          </p>
          <button
            onClick={handleUnlock}
            disabled={unlocking || !session}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-site-accent px-5 py-2.5 font-semibold text-site-accent-fg transition-colors hover:bg-site-accent-hover disabled:opacity-50"
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
          <h2 className="text-lg font-semibold text-site-text mb-4">{t("readme", { defaultValue: "README" })}</h2>
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{build.readme}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Version History */}
      {build.versions && build.versions.length > 0 && (
        <div className={`${card} mb-6`}>
          <h2 className="text-lg font-semibold text-site-text mb-4">{t("version-history", { defaultValue: "Version History" })}</h2>
          <div className="space-y-3">
            {build.versions.map((version) => (
              <div key={version.id} className="flex items-start gap-3 p-3 rounded-site bg-site-surface">
                <span className="px-2 py-0.5 rounded bg-site-surface text-site-text text-sm font-mono">v{version.version}</span>
                <div className="flex-1 min-w-0">
                  {version.changelog && <p className="text-sm text-site-text-muted">{version.changelog}</p>}
                  <p className="text-xs text-site-text-dim mt-1">
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
