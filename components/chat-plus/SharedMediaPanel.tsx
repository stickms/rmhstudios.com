import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ExternalLink, FileAudio, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatRef } from '@/lib/chat-plus/types';
import { api } from '@/lib/contract/client';
import { getChatSharedLinksApi, getChatSharedMediaApi } from '@/lib/chat-plus/chat.contract';
import type { LinkItem, MediaItem, MediaPage } from '@/lib/chat-plus/media.server';

function usePages<T>(
  chat: ChatRef,
  tab: 'media' | 'links',
  load: (cursor: string | null) => Promise<MediaPage<T>>,
) {
  return useInfiniteQuery({
    queryKey: ['chat-shared', chat.kind, chat.id, tab],
    initialPageParam: null as string | null,
    staleTime: 30_000,
    queryFn: ({ pageParam }) => load(pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** M6 — "Media & links": every image, GIF, voice note and link, newest first. */
export function SharedMediaPanel({ chat, tab }: { chat: ChatRef; tab: 'media' | 'links' }) {
  const { t } = useTranslation('f-messaging');
  const params = { kind: chat.kind, id: chat.id };
  const media = usePages(chat, 'media', (cursor) =>
    api(getChatSharedMediaApi, {
      params,
      query: cursor ? { tab: 'media', cursor } : { tab: 'media' },
    }),
  );
  const links = usePages(chat, 'links', (cursor) =>
    api(getChatSharedLinksApi, {
      params,
      query: cursor ? { tab: 'links', cursor } : { tab: 'links' },
    }),
  );
  const q = tab === 'media' ? media : links;
  const items = (q.data?.pages ?? []).flatMap((p) => p.items as (MediaItem | LinkItem)[]);

  if (q.isLoading) {
    return (
      <div className={tab === 'media' ? 'grid grid-cols-3 gap-1.5' : 'flex flex-col gap-2'}>
        {Array.from({ length: tab === 'media' ? 6 : 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className={tab === 'media' ? 'aspect-square rounded-site-sm' : 'h-12 rounded-site-sm'}
          />
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <p className="py-8 text-center text-sm text-site-text-muted">
        {t('media-error', { defaultValue: 'Could not load this right now.' })}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-site-text-muted">
        {tab === 'media'
          ? t('media-empty', {
              defaultValue: 'No photos, GIFs or voice notes have been shared yet.',
            })
          : t('links-empty', { defaultValue: 'No links have been shared yet.' })}
      </p>
    );
  }

  return (
    <div>
      {tab === 'media' ? (
        <ul className="grid grid-cols-3 gap-1.5">
          {(items as MediaItem[]).map((m, i) => (
            <li
              key={`${m.messageId}-${i}`}
              className="aspect-square overflow-hidden rounded-site-sm bg-site-surface"
            >
              {m.type === 'voice' ? (
                <a
                  href={m.url}
                  className="flex size-full flex-col items-center justify-center gap-1 text-xs text-site-text-muted hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <FileAudio className="size-6" aria-hidden />
                  {t('media-voice', { defaultValue: 'Voice note' })}
                </a>
              ) : (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block size-full focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <img
                    src={m.url}
                    alt={t('media-alt', { defaultValue: 'Shared image' })}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y divide-site-border">
          {(items as LinkItem[]).map((l, i) => {
            let host = l.url;
            try {
              host = new URL(l.url).hostname;
            } catch {
              /* keep the raw string */
            }
            return (
              <li key={`${l.messageId}-${i}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-h-12 items-center gap-3 py-2 hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <Link2 className="size-4 shrink-0 text-site-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-site-text">{host}</span>
                    <span className="block truncate text-xs text-site-text-muted">{l.url}</span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-site-text-muted" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {t('media-load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
}
