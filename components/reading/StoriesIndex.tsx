import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ARRIVE } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { listStoriesApi, type StoryIndexRow } from '@/lib/reading/stories.contract';

/**
 * /news/stories (s13-12): the running stories the editors keep, newest activity first, as rows on rules. Each row is
 * one link to the story's timeline with its summary and article count. No primary button: the only control is the
 * secondary "More stories" that appends the next 30.
 */
export function StoriesIndex({ initial }: { initial: { stories: StoryIndexRow[]; nextCursor: string | null } }) {
  const { t } = useTranslation('news-stories');
  const [stories, setStories] = useState(initial.stories);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function more() {
    if (!nextCursor) return;
    setBusy(true);
    setFailed(false);
    try {
      const page = await api(listStoriesApi, { query: { cursor: nextCursor } });
      setStories((rows) => [...rows, ...page.stories]);
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout
      title={t('title', {
        defaultValue: 'Stories',
      })}
      description={t('description', {
        defaultValue: 'Running stories from RMH News: related articles kept together on one dated timeline.',
      })}
      backTo="/news"
      backLabel={t('back-to-news', {
        defaultValue: 'Back to News',
      })}
    >
      <div className="pt-4 pb-12">
        {stories.length === 0 ? (
          <EmptyState
            title={t('empty', {
              defaultValue: 'No stories yet',
            })}
          />
        ) : (
          <ul
            aria-label={t('list-label', {
              defaultValue: 'Stories, newest activity first',
            })}
          >
            {stories.map((story, i) => (
              <li
                key={story.slug}
                className={`border-b border-site-border last:border-b-0${i >= initial.stories.length ? ` ${ARRIVE}` : ''}`}
              >
                <Link to="/news/stories/$slug" params={{ slug: story.slug }} className="group block space-y-1 py-4">
                  <h2 className="t-heading text-site-text group-hover:underline" dir="auto">
                    {story.title}
                  </h2>
                  {story.summary ? (
                    <p className="t-body line-clamp-2 text-site-text-muted" dir="auto">
                      {story.summary}
                    </p>
                  ) : null}
                  <p className="t-meta">
                    {t('story-count', {
                      count: story.count,
                      defaultValue: '{{count}} article',
                      defaultValue_other: '{{count}} articles',
                    })}
                    {' · '}
                    <time dateTime={story.latest}>{story.latest}</time>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {failed ? (
          <p role="alert" className="t-body border-b border-site-border py-3 text-site-danger">
            {t('error-more', {
              defaultValue: 'Could not load more stories. Try again.',
            })}
          </p>
        ) : null}
        {nextCursor ? (
          <div className="pt-4">
            <Button type="button" disabled={busy} aria-busy={busy} onClick={() => void more()}>
              {t('more', {
                defaultValue: 'More stories',
              })}
            </Button>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
