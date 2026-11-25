import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { StoryFollowToggle } from '@/components/reading/StoryFollowToggle';
import type { StoryRef } from '@/lib/reading/schema';

/** L5 — "Part of {{story}}" on a news article, linking to the story timeline, with the follow toggle beside it (s13-12). */
export function StoryBanner({ story }: { story: StoryRef }) {
  const { t } = useTranslation('news-stories');
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-site-border">
      <Link
        to="/news/stories/$slug"
        params={{
          slug: story.slug,
        }}
        className="row-hover inline-flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm text-site-text"
      >
        <Layers className="size-4 shrink-0 text-site-accent" aria-hidden />
        <span className="min-w-0 truncate">
          <span className="text-site-text-muted">
            {t('part-of', {
              defaultValue: 'Part of',
            })}
          </span>{' '}
          <bdi className="font-semibold">{story.title}</bdi>
        </span>
        <span className="shrink-0 text-site-text-muted">
          {t('story-count', {
            count: story.count,
            defaultValue: '{{count}} article',
            defaultValue_other: '{{count}} articles',
          })}
        </span>
      </Link>
      <StoryFollowToggle slug={story.slug} className="me-3" />
    </div>
  );
}
