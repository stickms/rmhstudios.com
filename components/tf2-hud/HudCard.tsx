/**
 * A HUD in a list: title, author, counts, tags, and the two things you do with
 * it — open it, or edit your own copy.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { GitFork, Heart, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HudSummary } from '@/lib/tf2-hud/api-types';
import { Pill } from './ui';

export default function HudCard({ hud, actions }: { hud: HudSummary; actions?: React.ReactNode }) {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <article className="flex flex-col gap-2 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="tf2hud-title min-w-0 truncate text-xl">
          <Link
            to="/tf2/hud-editor/h/$slug"
            params={{ slug: hud.slug }}
            className="hover:underline"
          >
            {hud.title}
          </Link>
        </h3>
        {hud.visibility !== 'PUBLIC' ? (
          <Pill tone={hud.visibility === 'PRIVATE' ? 'warning' : 'info'}>
            {hud.visibility === 'PRIVATE'
              ? t('private', { defaultValue: 'Private' })
              : t('unlisted', { defaultValue: 'Unlisted' })}
          </Pill>
        ) : null}
      </div>
      <p className="text-xs text-(--app-text-dim)">
        {hud.author ? t('by', { defaultValue: 'by {{name}}', name: hud.author.name }) : null}
        {hud.forkOf
          ? ` · ${t('fork-of', { defaultValue: 'fork of {{title}}', title: hud.forkOf.title })}`
          : null}
      </p>
      {hud.description ? (
        <p className="line-clamp-2 text-sm text-(--app-text-muted)">{hud.description}</p>
      ) : null}
      {hud.tags.length ? (
        <ul className="flex flex-wrap gap-1" aria-label={t('tags-label', { defaultValue: 'Tags' })}>
          {hud.tags.map((tag) => (
            <li key={tag}>
              <Pill>{tag}</Pill>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-3 text-xs text-(--app-text-muted)">
          <span
            className="inline-flex items-center gap-1"
            title={t('likes', { defaultValue: 'Likes' })}
          >
            <Heart className="size-3.5" aria-hidden />
            {hud.likeCount}
          </span>
          <span
            className="inline-flex items-center gap-1"
            title={t('forks', { defaultValue: 'Forks' })}
          >
            <GitFork className="size-3.5" aria-hidden />
            {hud.forkCount}
          </span>
          <span
            className="inline-flex items-center gap-1"
            title={t('downloads', { defaultValue: 'Downloads' })}
          >
            <Download className="size-3.5" aria-hidden />
            {hud.downloadCount}
          </span>
        </span>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </article>
  );
}
