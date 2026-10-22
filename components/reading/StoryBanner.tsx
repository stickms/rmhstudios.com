'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import type { StoryRef } from '@/lib/reading/schema';

/** L5 — "Part of story: X" on a news article, linking to the story timeline. */
export function StoryBanner({ story }: { story: StoryRef }) {
  const { t } = useTranslation('f-reading');
  return (
    <Link
      to="/news/stories/$slug"
      params={{ slug: story.slug }}
      className="glass-fill glass-interactive mt-5 inline-flex max-w-full items-center gap-2 rounded-site-sm px-3 py-2 text-sm text-site-text"
    >
      <Layers className="size-4 shrink-0 text-site-accent" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="text-site-text-muted">
          {t('part-of-story', { defaultValue: 'Part of story:' })}
        </span>{' '}
        <span className="font-semibold">{story.title}</span>
      </span>
      <span className="shrink-0 text-site-text-dim">
        {t('story-count', {
          count: story.count,
          defaultValue: '{{count}} article',
          defaultValue_other: '{{count}} articles',
        })}
      </span>
    </Link>
  );
}
