'use client';

/** L1 — "My highlights": every highlight and note, newest first, across all documents. */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Globe, Highlighter, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { apiJson } from '@/lib/reading/client';
import type { MyHighlightRow, MyHighlightsPage } from '@/lib/reading/schema';

type Row = MyHighlightRow;

export default function MyHighlightsPanel() {
  const { t } = useTranslation('f-reading');
  const { data: session } = useSession();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['reading-my-highlights'],
    enabled: !!session,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiJson<MyHighlightsPage>(
        `/api/reading/highlights${pageParam ? `?cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });

  if (!session) {
    return (
      <SignedOutPrompt
        icon={Highlighter}
        title={t('highlights-signed-out-title', { defaultValue: 'Sign in to see your highlights' })}
        callbackURL="/reading"
      />
    );
  }
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  const items: Row[] = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Highlighter}
        title={t('no-highlights', { defaultValue: 'No highlights yet' })}
        description={t('no-highlights-hint', {
          defaultValue:
            'Select text in a blog post, news article or library book to highlight it or add a note.',
        })}
      />
    );
  }

  async function remove(row: Row) {
    try {
      await apiJson(`/api/reading/highlights/${row.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['reading-my-highlights'] });
      void qc.invalidateQueries({ queryKey: ['reading-doc', row.kind, row.key] });
    } catch {
      toast.error(t('highlight-failed', { defaultValue: 'Could not save that. Try again.' }));
    }
  }

  const kindLabel = (k: Row['kind']) =>
    k === 'blog'
      ? t('kind-blog', { defaultValue: 'Blog' })
      : k === 'news'
        ? t('kind-news', { defaultValue: 'News' })
        : t('kind-library', { defaultValue: 'Library' });

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((row) => (
          <li key={row.id} className="glass-fill rounded-site p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-site-text-dim">
                  {kindLabel(row.kind)}
                </p>
                <Link to={row.href} className="font-medium text-site-text hover:underline">
                  {row.title}
                </Link>
                <blockquote className="border-s-4 border-site-accent ps-3 text-site-text">
                  “{row.exact}”
                </blockquote>
                {row.note ? <p className="text-sm text-site-text-muted">{row.note}</p> : null}
              </div>
              <span className="mt-1 text-site-text-dim">
                {row.isPublic ? (
                  <Globe className="size-4" aria-hidden />
                ) : (
                  <Lock className="size-4" aria-hidden />
                )}
                <span className="sr-only">
                  {row.isPublic
                    ? t('public', { defaultValue: 'Public' })
                    : t('private', { defaultValue: 'Private' })}
                </span>
              </span>
              <IconButton
                label={t('remove-highlight', { defaultValue: 'Remove highlight' })}
                onClick={() => void remove(row)}
              >
                <Trash2 aria-hidden />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      {q.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
