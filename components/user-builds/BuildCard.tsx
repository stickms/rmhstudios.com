'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { Heart, MessageCircle, Eye, ExternalLink, Github, Award } from 'lucide-react';
import type { Build } from '@/lib/user-builds-types';
import { TechBadges } from './TechBadges';
import { BlurImage } from '@/components/ui/BlurImage';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useCardSheen } from '@/hooks/useCardSheen';
import { formatCount } from '@/lib/utils';
import { safeHref } from '@/lib/url-safety';
import { runLiquidOpen, liquidVTName } from '@/lib/view-transition';
import { useTranslation } from 'react-i18next';

interface BuildCardProps {
  build: Build;
  onLike?: (id: string) => void;
}

type TFunc = (key: string, opts: { defaultValue: string; count?: number }) => string;

function timeAgo(dateStr: string, t: TFunc): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return t('just-now', { defaultValue: 'just now' });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('minutes-ago', { defaultValue: '{{count}}m ago', count: minutes }).replace('{{count}}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hours-ago', { defaultValue: '{{count}}h ago', count: hours }).replace('{{count}}', String(hours));
  const days = Math.floor(hours / 24);
  if (days < 30) return t('days-ago', { defaultValue: '{{count}}d ago', count: days }).replace('{{count}}', String(days));
  const months = Math.floor(days / 30);
  if (months < 12) return t('months-ago', { defaultValue: '{{count}}mo ago', count: months }).replace('{{count}}', String(months));
  return t('years-ago', { defaultValue: '{{count}}y ago', count: Math.floor(months / 12) }).replace('{{count}}', String(Math.floor(months / 12)));
}

export function BuildCard({ build, onLike }: BuildCardProps) {
  const { t } = useTranslation("c-user-builds");
  const { cardRef, sheenStyle, handlers: sheenHandlers } = useCardSheen();
  const navigate = useNavigate();
  // §5.48: the card thumbnail liquidly expands into the detail's thumbnail
  // (image↔image). Name set at click time only (never at rest on a list item).
  const thumbRef = useRef<HTMLDivElement>(null);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onLike?.(build.id);
  };

  return (
    <div
      ref={cardRef}
      className="h-full hover:scale-[1.03] transition-transform duration-300"
      {...sheenHandlers}
    >
      <Link
        to={`/user-builds/${build.slug}` as string}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          runLiquidOpen(thumbRef.current, liquidVTName('build', build.id), () =>
            navigate({ to: `/user-builds/${build.slug}` } as never),
          );
        }}
        className="block h-full"
      >
        <div className="group relative rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden flex flex-col h-full">
          {/* Mouse-tracking sheen */}
          <div style={sheenStyle} className="rounded-site" />
        {/* Thumbnail */}
        <div ref={thumbRef} className="relative">
          {build.thumbnailUrl ? (
            <div className="aspect-video w-full overflow-hidden bg-site-bg">
              <BlurImage
                src={build.thumbnailUrl}
                alt={build.title}
                fit="cover"
                width={640}
                quality={75}
                sizes="(max-width: 640px) 100vw, 400px"
                className="w-full h-full"
                imgClassName="w-full h-full group-hover:scale-105 transition-transform duration-300"
              />
            </div>
          ) : (
            <div className="aspect-video w-full bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 flex items-center justify-center">
              <div className="text-4xl font-bold text-site-accent/50">
                {build.title[0]?.toUpperCase()}
              </div>
            </div>
          )}
          {build.featured && (
            <div className="absolute top-2 right-2 p-1.5 rounded-site-sm bg-black/60 backdrop-blur-sm" title={t("curated", { defaultValue: "Curated" })}>
              <Award className="w-4 h-4 text-site-warning" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Category */}
          {build.category && (
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent">
                {build.category.name}
              </span>
            </div>
          )}

          {/* Title */}
          <h3 className="font-semibold text-site-text group-hover:text-site-accent transition-colors line-clamp-1 mb-1">
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
              <UserAvatar src={build.user.image ?? undefined} alt={build.user.name || t("user", { defaultValue: "User" })} size={24} fallbackName={build.user.name ?? undefined} />
              <span className="text-sm text-site-text-muted truncate">
                {build.user.name || t("anonymous", { defaultValue: "Anonymous" })}
              </span>
              <span className="text-xs text-site-text-dim">
                {timeAgo(build.publishedAt || build.createdAt, t)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 text-site-text-dim">
              {build.repoUrl && (
                <a
                  href={safeHref(build.repoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-site-text transition-colors"
                  title={t("view-source", { defaultValue: "View source" })}
                >
                  <Github className="w-4 h-4" />
                </a>
              )}
              {build.demoUrl && (
                <a
                  href={safeHref(build.demoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-site-text transition-colors"
                  title={t("view-demo", { defaultValue: "View demo" })}
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
                build.liked ? 'text-site-danger' : 'hover:text-site-danger'
              }`}
            >
              <Heart className={`w-4 h-4 ${build.liked ? 'fill-current' : ''}`} />
              {formatCount(build.likeCount)}
            </button>
            <span className="flex items-center gap-1 hover:text-site-accent transition-colors">
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
    </div>
  );
}
