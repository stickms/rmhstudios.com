'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Quote } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { relativeTimeShort } from '@/lib/utils';
import { UserAvatar } from './UserAvatar';
import type { FeedItem } from '@/lib/feed-types';
import type { QuotesPage } from '@/lib/feed/quotes';

/**
 * X10 — the "Quotes" view for a post: every quote-post of it, newest first,
 * 20 at a time, with quotes of those quotes nested one level beneath. Opened
 * from the repost menu; nothing loads until it is opened.
 */

function postHref(item: FeedItem): string {
  return `/u/${item.user?.handle || item.user?.id || '_'}/post/${item.id}`;
}

function QuoteRow({
  item,
  nested = false,
  onNavigate,
}: {
  item: FeedItem;
  nested?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={postHref(item)}
      onClick={onNavigate}
      className={`flex gap-3 px-5 py-3 transition-colors hover:bg-site-surface-hover ${nested ? 'py-2' : ''}`}
    >
      <UserAvatar user={item.user} size={nested ? 'xs' : 'sm'} linkToProfile={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-bold text-site-text">{item.user?.name || item.user?.handle}</span>
          {item.user?.handle && <span className="text-site-text-dim"> @{item.user.handle}</span>}
          <span className="text-site-text-dim">
            {' · '}
            <RelativeTime date={item.createdAt} format={relativeTimeShort} />
          </span>
        </p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-sm text-site-text">
          {item.content}
        </p>
      </div>
    </Link>
  );
}

export function QuotesDialog({
  open,
  onClose,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
}) {
  const { t } = useTranslation('f-feed-plus');
  const [page, setPage] = useState<QuotesPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setFailed(false);
      try {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const res = await fetch(`/api/rmharks/${postId}/quotes${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as QuotesPage;
        setPage((prev) =>
          cursor && prev
            ? { items: [...prev.items, ...next.items], nextCursor: next.nextCursor }
            : next,
        );
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    if (open) void load(null);
  }, [open, load]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="flex max-h-[80dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 border-b border-site-border px-5 py-4">
          <DialogTitle className="font-display text-lg font-bold text-site-text">
            {t('quotes-title', { defaultValue: 'Quotes' })}
          </DialogTitle>
        </div>

        <div className="flex-1 overflow-y-auto">
          {page && page.items.length === 0 && !loading && (
            <EmptyState
              icon={Quote}
              title={t('quotes-empty', { defaultValue: 'No quotes yet' })}
              description={t('quotes-empty-hint', {
                defaultValue: 'When someone quotes this post, it shows up here.',
              })}
            />
          )}

          <ul className="divide-y divide-site-border/50">
            {page?.items.map(({ item, quotes }) => (
              <li key={item.id}>
                <QuoteRow item={item} onNavigate={onClose} />
                {quotes.length > 0 && (
                  <ul className="ml-10 border-l-2 border-site-border">
                    {quotes.map((q) => (
                      <li key={q.id}>
                        <QuoteRow item={q} nested onNavigate={onClose} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {loading && (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          )}

          {failed && (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm text-site-text-muted">
                {t('quotes-error', { defaultValue: 'Could not load quotes.' })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(page?.nextCursor ?? null)}
              >
                {t('quotes-retry', { defaultValue: 'Try again' })}
              </Button>
            </div>
          )}

          {page?.nextCursor && !loading && !failed && (
            <div className="flex justify-center px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => void load(page.nextCursor)}>
                {t('quotes-more', { defaultValue: 'Load more quotes' })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
