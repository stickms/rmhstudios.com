'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Eye, Github, ExternalLink, Calendar, ArrowLeft, Edit, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { authClient } from '@/lib/auth-client';
import type { Build } from '@/lib/user-builds-types';
import { TechBadges } from './TechBadges';
import { BuildComments } from './BuildComments';

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

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function BuildDetail({ build: initialBuild, backHref = '/user-builds' }: BuildDetailProps) {
  const { data: session } = authClient.useSession();
  const [build, setBuild] = useState(initialBuild);
  const [liking, setLiking] = useState(false);

  const isOwner = session?.user?.id === build.user.id || !!(session?.user as any)?.isAdmin;

  // Track view on mount
  useEffect(() => {
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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Builds
      </Link>

      {/* Header */}
      <div className="mb-8">
        {/* Category & Status */}
        <div className="flex items-center gap-2 mb-3">
          {build.category && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent">
              {build.category.name}
            </span>
          )}
          {build.featured && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">
              Featured
            </span>
          )}
          {build.visibility !== 'PUBLIC' && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400">
              {build.visibility}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-site-text mb-4">{build.title}</h1>

        {/* Author & Date */}
        <div className="flex items-center gap-4 mb-4">
          <Link href={`/@${build.user.handle || build.user.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {build.user.image ? (
              <img src={build.user.image} alt={build.user.name || 'User'} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">
                {(build.user.name?.[0] || 'U').toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-site-text">{build.user.name || 'Anonymous'}</p>
              {build.user.username && (
                <p className="text-sm text-site-text-muted">@{build.user.username}</p>
              )}
            </div>
          </Link>

          <span className="text-site-text-dim">|</span>

          <span className="flex items-center gap-2 text-sm text-site-text-muted">
            <Calendar className="w-4 h-4" />
            {formatDate(build.publishedAt || build.createdAt)}
          </span>

          {isOwner && (
            <Link
              href={`/user-builds/manage?edit=${build.id}`}
              className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-site-surface border border-site-border text-sm text-site-text-muted hover:text-site-text hover:border-violet-500/50 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </Link>
          )}
        </div>

        {/* Description */}
        <p className="text-site-text-muted mb-6">{build.description}</p>

        {/* Tech Stack */}
        {build.technologies.length > 0 && (
          <div className="mb-6">
            <TechBadges technologies={build.technologies} />
          </div>
        )}

        {/* Tags */}
        {build.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {build.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-full text-xs bg-site-surface border border-site-border text-site-text-muted"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          {build.repoUrl && (
            <a
              href={build.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text hover:border-violet-500/50 transition-colors"
            >
              <Github className="w-4 h-4" />
              View Source
            </a>
          )}
          {build.demoUrl && (
            <a
              href={build.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Live Demo
            </a>
          )}

          <div className="flex items-center gap-4 ml-auto text-site-text-muted">
            <button
              onClick={handleLike}
              disabled={liking || !session}
              className={`flex items-center gap-2 transition-colors ${
                build.liked ? 'text-red-400' : 'hover:text-red-400'
              } disabled:opacity-50`}
              title={session ? '' : 'Sign in to like'}
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
        <div className="mb-8 rounded-xl overflow-hidden border border-site-border">
          <img src={build.thumbnailUrl} alt={build.title} className="w-full" />
        </div>
      )}

      {/* README */}
      {build.readme && (
        <div className="mb-8 p-6 rounded-xl border border-site-border bg-site-surface">
          <h2 className="text-lg font-semibold text-site-text mb-4">README</h2>
          <div className="prose prose-invert prose-violet max-w-none">
            <ReactMarkdown>{build.readme}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Version History */}
      {build.versions && build.versions.length > 0 && (
        <div className="mb-8 p-6 rounded-xl border border-site-border bg-site-surface">
          <h2 className="text-lg font-semibold text-site-text mb-4">Version History</h2>
          <div className="space-y-3">
            {build.versions.map((version) => (
              <div key={version.id} className="flex items-start gap-3 p-3 rounded-lg bg-site-bg">
                <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-sm font-mono">
                  v{version.version}
                </span>
                <div className="flex-1 min-w-0">
                  {version.changelog && (
                    <p className="text-sm text-site-text-muted">{version.changelog}</p>
                  )}
                  <p className="text-xs text-site-text-dim mt-1">
                    {formatDate(version.createdAt)}
                    {version.commitHash && (
                      <span className="ml-2 font-mono">{version.commitHash.slice(0, 7)}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="p-6 rounded-xl border border-site-border bg-site-surface">
        <BuildComments buildId={build.id} />
      </div>
    </div>
  );
}
