'use client';

/** L5 — admin news stories: create a story, link articles, see suggestions. */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Link2, Plus, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiJson } from '@/lib/reading/client';
import type { AdminStory, StorySuggestion as Suggestion } from '@/lib/reading/schema';

const KEY = ['admin-stories'] as const;

export default function AdminStories() {
  const { t } = useTranslation('f-reading');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const { data, isPending } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ stories: AdminStory[] }>('/api/admin/reading/stories'),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: () =>
      apiJson('/api/admin/reading/stories', {
        method: 'POST',
        body: JSON.stringify({ title, summary }),
      }),
    onSuccess: () => {
      setTitle('');
      setSummary('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function removeStory(s: AdminStory) {
    const ok = await confirm({
      title: t('story-delete-title', { defaultValue: 'Delete this story?' }),
      description: t('story-delete-desc', {
        title: s.title,
        defaultValue: '“{{title}}” and its timeline page will be removed. The articles stay.',
      }),
      confirmLabel: t('story-delete', { defaultValue: 'Delete story' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/reading/stories/${s.id}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const stories = data?.stories ?? [];

  return (
    <div className="space-y-6">
      <form
        className="glass-pane space-y-3 rounded-site p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="font-display text-lg font-semibold text-site-text">
          {t('story-new', { defaultValue: 'New story' })}
        </h2>
        <div className="space-y-1">
          <label htmlFor="st-title" className="text-sm text-site-text-muted">
            {t('story-title-label', { defaultValue: 'Title' })}
          </label>
          <Input
            id="st-title"
            required
            minLength={2}
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="st-summary" className="text-sm text-site-text-muted">
            {t('story-summary-label', { defaultValue: 'Summary (optional)' })}
          </label>
          <Input
            id="st-summary"
            maxLength={600}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <Button type="submit" variant="accent" size="sm" loading={create.isPending}>
          <Plus aria-hidden />
          {t('story-create', { defaultValue: 'Create story' })}
        </Button>
      </form>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : stories.length === 0 ? (
        <EmptyState
          title={t('stories-empty', { defaultValue: 'No stories yet' })}
          description={t('stories-empty-hint', {
            defaultValue: 'Create one, then link the related news articles to it.',
          })}
        />
      ) : (
        stories.map((s) => (
          <StoryCard key={s.id} story={s} onChange={refresh} onDelete={() => void removeStory(s)} />
        ))
      )}
    </div>
  );
}

function StoryCard({
  story,
  onChange,
  onDelete,
}: {
  story: AdminStory;
  onChange: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('f-reading');
  const [q, setQ] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  const search = useQuery({
    queryKey: ['admin-story-search', story.id, q],
    queryFn: () =>
      apiJson<{ articles: Array<{ slug: string; title: string; date: string }> }>(
        `/api/admin/reading/stories?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
  const suggest = useQuery({
    queryKey: ['admin-story-suggest', story.id, story.articles.length],
    queryFn: () =>
      apiJson<{ suggestions: Suggestion[] }>(`/api/admin/reading/stories/${story.id}/suggest`),
    enabled: showSuggest,
  });

  const link = useMutation({
    mutationFn: (slug: string) =>
      apiJson(`/api/admin/reading/stories/${story.id}/articles`, {
        method: 'POST',
        body: JSON.stringify({ slug }),
      }),
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });
  const unlink = useMutation({
    mutationFn: (slug: string) =>
      apiJson(`/api/admin/reading/stories/${story.id}/articles?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      }),
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });

  const linked = new Set(story.articles.map((a) => a.slug));

  return (
    <section className="glass-fill space-y-3 rounded-site p-4" aria-label={story.title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-site-text">{story.title}</h3>
          {story.summary ? <p className="text-sm text-site-text-muted">{story.summary}</p> : null}
          <Link
            to="/news/stories/$slug"
            params={{ slug: story.slug }}
            className="text-sm text-site-accent underline-offset-4 hover:underline"
          >
            {t('story-view', { defaultValue: 'View timeline' })}
          </Link>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('story-delete', { defaultValue: 'Delete story' })}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      {story.articles.length === 0 ? (
        <p className="text-sm text-site-text-muted">
          {t('story-no-articles', { defaultValue: 'No articles linked yet.' })}
        </p>
      ) : (
        <ol className="space-y-1 text-sm">
          {story.articles.map((a) => (
            <li key={a.slug} className="flex items-center gap-2">
              <time dateTime={a.date} className="font-mono text-xs text-site-accent">
                {a.date}
              </time>
              <span className="min-w-0 flex-1 truncate text-site-text">{a.title}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('story-unlink', {
                  title: a.title,
                  defaultValue: 'Remove {{title}} from the story',
                })}
                onClick={() => unlink.mutate(a.slug)}
              >
                <Unlink aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-2">
        <label htmlFor={`st-q-${story.id}`} className="text-sm text-site-text-muted">
          {t('story-find', { defaultValue: 'Find an article to add' })}
        </label>
        <Input
          id={`st-q-${story.id}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('story-find-ph', { defaultValue: 'Search news titles…' })}
        />
        {search.data?.articles.length ? (
          <ul className="space-y-1 text-sm">
            {search.data.articles.map((a) => (
              <li key={a.slug} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-site-text-muted">{a.title}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={linked.has(a.slug)}
                  onClick={() => link.mutate(a.slug)}
                >
                  <Link2 aria-hidden />
                  {linked.has(a.slug)
                    ? t('story-added', { defaultValue: 'Added' })
                    : t('story-add', { defaultValue: 'Add' })}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => setShowSuggest((v) => !v)}
          aria-expanded={showSuggest}
        >
          {t('story-suggest', { defaultValue: 'Suggest related articles' })}
        </Button>
        {showSuggest ? (
          suggest.isPending ? (
            <Skeleton className="mt-2 h-10 w-full" />
          ) : (suggest.data?.suggestions.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-site-text-muted">
              {story.articles.length === 0
                ? t('story-suggest-needs-article', {
                    defaultValue:
                      'Link at least one article first; suggestions are based on its tags.',
                  })
                : t('story-suggest-none', { defaultValue: 'No related unlinked articles found.' })}
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {suggest.data!.suggestions.map((s) => (
                <li key={s.slug} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-site-text">{s.title}</span>
                    <span className="block text-xs text-site-text-dim">
                      {s.reason === 'tags'
                        ? t('suggest-tags', {
                            tags: s.overlap.join(', '),
                            defaultValue: 'Shared tags: {{tags}}',
                          })
                        : t('suggest-similar', { defaultValue: 'Similar content' })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => link.mutate(s.slug)}
                  >
                    {t('story-add', { defaultValue: 'Add' })}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  );
}
