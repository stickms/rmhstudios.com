'use client';

import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Heart, Eye, GitBranch, ExternalLink, Calendar, Edit, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { BlurImage } from '@/components/ui/BlurImage';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import type { Build } from '@/lib/user-builds-types';
import { liquidVTName } from '@/lib/view-transition';
import { TechBadges } from './TechBadges';
import { BuildComments } from './BuildComments';
import { PostAwards } from '@/components/awards/PostAwards';
import { formatCount } from '@/lib/utils';
import { safeHref } from '@/lib/url-safety';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';

interface BuildDetailProps {
  build: Build;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Body of a build detail page. The title, lede and back link belong to the
 * route's `PageLayout` header — this renders everything below it.
 */
export function BuildDetail({ build: initialBuild }: BuildDetailProps) {
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
        toast.error(data.error);
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

  const hasStatusChips = !!build.category || build.featured || build.visibility !== 'PUBLIC';

  return (
    <div className="space-y-[var(--site-section-gap)]">
      <header className="space-y-5">
        {/* Category & status */}
        {hasStatusChips && (
          <div className="flex flex-wrap items-center gap-2">
            {build.category && <Badge>{build.category.name}</Badge>}
            {build.featured && (
              <Badge variant="warning">{t("curated", { defaultValue: "Curated" })}</Badge>
            )}
            {build.visibility !== 'PUBLIC' && <Badge variant="outline">{build.visibility}</Badge>}
          </div>
        )}

        {/* Author & date */}
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to={`/u/${build.user.handle || build.user.id}` as string}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <UserAvatar src={build.user.image ?? undefined} alt={build.user.name || 'User'} size={40} fallbackName={build.user.name ?? undefined} />
            <div>
              <p className="font-medium text-site-text">{build.user.name || t("anonymous", { defaultValue: "Anonymous" })}</p>
              {build.user.username && <p className="text-sm text-site-text-dim">@{build.user.username}</p>}
            </div>
          </Link>

          <span aria-hidden className="text-site-text-dim">|</span>

          <span className="flex items-center gap-2 text-sm text-site-text-muted">
            <Calendar className="size-4" aria-hidden />
            {formatDate(build.publishedAt || build.createdAt)}
          </span>

          {isOwner && (
            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link to={`/user-builds/submit?edit=${build.id}` as string}>
                  <Edit aria-hidden />
                  {t("edit", { defaultValue: "Edit" })}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                loading={deleting}
                className="text-site-danger hover:text-site-danger hover:bg-site-danger/10"
              >
                <Trash2 aria-hidden />
                {t("delete", { defaultValue: "Delete" })}
              </Button>
            </div>
          )}
        </div>

        {/* Post awards (§7): public paid recognition on the build. */}
        <PostAwards entityType="build" entityId={build.id} canGive={!isOwner} />

        {/* Tech stack */}
        {build.technologies.length > 0 && <TechBadges technologies={build.technologies} />}

        {/* Tags */}
        {build.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {build.tags.map((tag) => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {build.repoUrl && (
            <Button asChild variant="secondary">
              <a href={safeHref(build.repoUrl)} target="_blank" rel="noopener noreferrer">
                <GitBranch aria-hidden />
                {t("view-source", { defaultValue: "View Source" })}
              </a>
            </Button>
          )}
          {build.demoUrl && (
            <Button asChild variant="accent">
              <a href={safeHref(build.demoUrl)} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t("live-demo", { defaultValue: "Live Demo" })}
              </a>
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2 text-site-text-muted">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              disabled={!session}
              loading={liking}
              loadingText={<AnimatedCount value={build.likeCount} format={formatCount} />}
              className={build.liked ? 'text-site-danger' : 'hover:text-site-danger'}
              aria-pressed={!!build.liked}
              title={session ? undefined : t("sign-in-to-like", { defaultValue: "Sign in to like" })}
            >
              <Heart className={build.liked ? 'fill-current' : undefined} aria-hidden />
              <AnimatedCount value={build.likeCount} format={formatCount} />
            </Button>
            <span className="flex items-center gap-2 px-2 text-sm">
              <Eye className="size-4" aria-hidden />
              <AnimatedCount value={build.viewCount} format={formatCount} />
            </span>
          </div>
        </div>
      </header>

      {/* Thumbnail — §5.48 liquid-open hero the build card's thumbnail morphs into. */}
      {build.thumbnailUrl && (
        <div
          className="overflow-hidden rounded-site border border-site-border shadow-site"
          style={{ viewTransitionName: liquidVTName('build', build.id) }}
        >
          <BlurImage src={build.thumbnailUrl} alt={build.title} fit="cover" width={1280} quality={85} sizes="100vw" className="w-full" imgClassName="w-full" />
        </div>
      )}

      {/* Paywall — paid build whose content the viewer hasn't unlocked */}
      {build.locked && (
        <Card>
          <CardContent className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-site-surface">
              <Lock className="size-6 text-site-warning" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-site-text">{t("premium-build", { defaultValue: "Premium build" })}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-site-text-muted">
              {t("premium-build-desc", { defaultValue: "Unlock the README, source, and live demo for this build." })}
            </p>
            <Button
              variant="accent"
              onClick={handleUnlock}
              disabled={!session}
              loading={unlocking}
              className="mt-4"
            >
              <CoinIcon className="size-4" aria-hidden />
              {session ? t("unlock-for", { defaultValue: "Unlock for {{price}}", price: (build.price ?? 0).toLocaleString() }) : t("sign-in-to-unlock", { defaultValue: "Sign in to unlock" })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* README */}
      {!build.locked && build.readme && (
        <Card>
          <CardContent>
            <h2 className="mb-4 text-lg font-semibold text-site-text">{t("readme", { defaultValue: "README" })}</h2>
            <div className="prose max-w-none prose-headings:text-site-text prose-p:text-site-text-muted prose-li:text-site-text-muted prose-strong:text-site-text prose-code:text-site-text prose-a:text-site-accent hover:prose-a:text-site-accent-hover prose-img:rounded-site prose-img:border prose-img:border-site-border">
              <ReactMarkdown>{build.readme}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Version History */}
      {build.versions && build.versions.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="mb-4 text-lg font-semibold text-site-text">{t("version-history", { defaultValue: "Version History" })}</h2>
            <div className="space-y-3">
              {build.versions.map((version) => (
                <div key={version.id} className="flex items-start gap-3 rounded-site-sm bg-site-surface p-3">
                  <Badge className="font-mono">v{version.version}</Badge>
                  <div className="min-w-0 flex-1">
                    {version.changelog && <p className="text-sm text-site-text-muted">{version.changelog}</p>}
                    <p className="mt-1 text-xs text-site-text-dim">
                      {formatDate(version.createdAt)}
                      {version.commitHash && <span className="ml-2 font-mono">{version.commitHash.slice(0, 7)}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <CardContent>
          <BuildComments buildId={build.id} />
        </CardContent>
      </Card>
    </div>
  );
}
