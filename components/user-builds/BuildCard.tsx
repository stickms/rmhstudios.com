'use client';

import { Link } from '@tanstack/react-router';
import { Heart, MessageCircle, Eye, ExternalLink, Github } from 'lucide-react';
import type { Build } from '@/lib/user-builds-types';
import { TechBadges } from './TechBadges';

interface BuildCardProps {
  build: Build;
  onLike?: (id: string) => void;
}

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function BuildCard({ build, onLike }: BuildCardProps) {
  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onLike?.(build.id);
  };

  return (
    <Link to={`/user-builds/${build.slug}`} className="block h-full">
      <div className="group rounded-xl border border-site-border bg-site-surface hover:border-violet-500/50 transition-all overflow-hidden flex flex-col h-full">
        {/* Thumbnail */}
        {build.thumbnailUrl ? (
          <div className="aspect-video w-full overflow-hidden bg-site-bg">
            <img
              src={build.thumbnailUrl}
              alt={build.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ) : (
          <div className="aspect-video w-full bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 flex items-center justify-center">
            <div className="text-4xl font-bold text-violet-400/50">
              {build.title[0]?.toUpperCase()}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Category & Featured */}
          <div className="flex items-center gap-2 mb-2">
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
          </div>

          {/* Title */}
          <h3 className="font-semibold text-site-text group-hover:text-violet-400 transition-colors line-clamp-1 mb-1">
            {build.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-site-text-muted line-clamp-2 mb-3">
            {build.description}
          </p>

          {/* Tech Stack */}
          {build.technologies.length > 0 && (
            <div className="mb-3">
              <TechBadges technologies={build.technologies.slice(0, 4)} size="sm" />
            </div>
          )}

          {/* Author & Meta */}
          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-2 min-w-0">
              {build.user.image ? (
                <img
                  src={build.user.image}
                  alt={build.user.name || 'User'}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                  {(build.user.name?.[0] || 'U').toUpperCase()}
                </div>
              )}
              <span className="text-sm text-site-text-muted truncate">
                {build.user.name || 'Anonymous'}
              </span>
              <span className="text-xs text-site-text-dim">
                {timeAgo(build.publishedAt || build.createdAt)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 text-site-text-dim">
              {build.repoUrl && (
                <a
                  href={build.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-site-text transition-colors"
                  title="View source"
                >
                  <Github className="w-4 h-4" />
                </a>
              )}
              {build.demoUrl && (
                <a
                  href={build.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-site-text transition-colors"
                  title="View demo"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Engagement Stats */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-site-border text-xs text-site-text-dim">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 transition-colors ${
                build.liked ? 'text-red-400' : 'hover:text-red-400'
              }`}
            >
              <Heart className={`w-4 h-4 ${build.liked ? 'fill-current' : ''}`} />
              {formatCount(build.likeCount)}
            </button>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {formatCount(build.commentCount)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {formatCount(build.viewCount)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
