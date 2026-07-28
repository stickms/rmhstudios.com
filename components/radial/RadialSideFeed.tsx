'use client';

/**
 * The home deck's second feed.
 *
 * A wide window can show more than one timeline, so desktop home runs the main
 * "For You" wheel next to this compact secondary stream with its own surface
 * picker (Following · News · Games). It is deliberately **not** wired to the
 * shared `feedStore` — that store is a singleton driving the primary wheel, and
 * two feeds writing to it would fight over the same items, cursor and live SSE
 * buffer. This one owns a tiny local cache instead: one page per surface, kept
 * between mounts so switching tabs (or navigating away and back) is instant.
 *
 * It renders only where there is room for it (`--rad-deck` in radial.css hides
 * it below the deck breakpoint), and it fetches only when visible, so phones
 * never pay for a column they cannot see.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useSession } from '@/components/Providers';
import type { FeedItem } from '@/lib/feed-types';

type SurfaceId = 'following' | 'news' | 'game';

interface Surface {
  id: SurfaceId;
  tKey: string;
  label: string;
  /** Query string for /api/rmharks. */
  query: string;
  requiresAuth?: boolean;
}

const SURFACES: Surface[] = [
  {
    id: 'following',
    tKey: 'feed-following',
    label: 'Following',
    query: 'feed=following&filter=all',
    requiresAuth: true,
  },
  { id: 'news', tKey: 'feed-news', label: 'News', query: 'filter=news' },
  { id: 'game', tKey: 'feed-games', label: 'Games', query: 'filter=game' },
];

const PAGE_SIZE = 8;

/**
 * The exact range in which radial.css renders the deck. The gap is deliberate:
 * between 1440 and 1600 the site-wide live rail has appeared but the window is
 * not yet wide enough for four columns, so the home-only deck yields to it.
 * Keep in step with the media queries around `.rad-deck`.
 */
const DECK_QUERY = '(min-width: 1280px) and (max-width: 1439.98px), (min-width: 1600px)';

/** Deterministic tab/panel dom ids so `aria-controls`/`aria-labelledby` line up. */
const TAB_ID_BASE = 'rad-deck';

/** One cached page per surface, shared across mounts. */
const cache = new Map<SurfaceId, { items: FeedItem[]; at: number }>();
const CACHE_TTL = 2 * 60_000;

function snippet(item: FeedItem): string {
  const text = item.content || item.description || item.title || '';
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

function hrefFor(item: FeedItem): string {
  if (item.href) return item.href;
  if (item.type === 'rmhark' && item.user) {
    return `/u/${item.user.handle || item.user.id}/post/${item.actualId || item.id}`;
  }
  return '/';
}

export function RadialSideFeed() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const visible = useMediaQuery(DECK_QUERY);
  const idle = useIdleReady();

  const surfaces = useMemo(() => SURFACES.filter((s) => !s.requiresAuth || session), [session]);
  const [active, setActive] = useState<SurfaceId>(surfaces[0]?.id ?? 'news');
  const [items, setItems] = useState<FeedItem[] | null>(cache.get(active)?.items ?? null);

  // Keep the selection valid when auth state resolves after the first render
  // (signing out must not leave "Following" selected).
  useEffect(() => {
    if (!surfaces.some((s) => s.id === active)) setActive(surfaces[0]?.id ?? 'news');
  }, [surfaces, active]);

  useEffect(() => {
    if (!visible || !idle) return;
    const cached = cache.get(active);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setItems(cached.items);
      return;
    }
    const surface = SURFACES.find((s) => s.id === active);
    if (!surface) return;
    const controller = new AbortController();
    setItems(null);
    (async () => {
      try {
        const res = await fetch(`/api/rmharks?limit=${PAGE_SIZE}&${surface.query}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { items: FeedItem[] };
        const next = body.items ?? [];
        cache.set(active, { items: next, at: Date.now() });
        setItems(next);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      }
    })();
    return () => controller.abort();
  }, [active, visible, idle]);

  return (
    <aside className="rad-deck" aria-label={t('more-feeds', { defaultValue: 'More feeds' })}>
      {/* §16.2: one tab-strip grammar site-wide — the shared renderer owns the
          tablist semantics, roving arrow keys and the morphing capsule. */}
      <LiquidTabs
        className="rad-deck__tabs"
        size="sm"
        fullWidth
        idBase={`${TAB_ID_BASE}-${surfaces.length}`}
        aria-label={t('more-feeds', { defaultValue: 'More feeds' })}
        value={active}
        onChange={(id) => setActive(id as SurfaceId)}
        tabs={surfaces.map((surface) => ({
          id: surface.id,
          label: t(surface.tKey, { defaultValue: surface.label }),
        }))}
      />

      <div
        className="rad-deck__list"
        role="tabpanel"
        id={`${TAB_ID_BASE}-${surfaces.length}-panel-${active}`}
        aria-labelledby={`${TAB_ID_BASE}-${surfaces.length}-tab-${active}`}
      >
        {items === null ? (
          // Skeleton rows matching the deck's own geometry, not a bare
          // "Loading…" string. On wide screens this panel could sit on that
          // string indefinitely when the fetch failed — no skeleton, no error,
          // no retry — so the rail simply looked broken.
          <div className="rad-deck__skeletons" aria-busy="true" aria-live="polite">
            <span className="sr-only">{t('loading', { defaultValue: 'Loading…' })}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rad-deck__row rad-deck__row--skeleton" aria-hidden>
                <Skeleton className="h-[26px] w-[26px] shrink-0 rounded-full" />
                <span className="rad-deck__row-main flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </span>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            className="px-2 py-6"
            title={t('feed-empty-surface-title', { defaultValue: 'Nothing here yet' })}
            description={t('feed-empty-surface', {
              defaultValue: 'New posts on this surface will show up here.',
            })}
          />
        ) : (
          items.map((item) => (
            <Link key={item.id} to={hrefFor(item)} className="rad-deck__row">
              {item.user ? (
                <UserAvatar
                  src={item.user.image ?? undefined}
                  alt={item.user.name || item.user.handle || 'User'}
                  size={26}
                  fallbackName={item.user.name || item.user.handle || undefined}
                />
              ) : (
                <span className="rad-deck__glyph" aria-hidden>
                  RMH
                </span>
              )}
              <span className="rad-deck__row-main">
                <strong>
                  {item.user?.name || item.user?.handle || item.title || 'RMH Studios'}
                </strong>
                <small>{snippet(item)}</small>
              </span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
