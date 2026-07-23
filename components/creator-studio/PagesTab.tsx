/**
 * Creator Studio · Pages tab.
 *
 * The page-generation surface: a prompt dock (type anything, get a shareable,
 * collaboratively-editable webpage) above a public, searchable, lazy-loaded
 * gallery of every generated page — now laid out as a Steam-style storefront
 * (rotating hero + spotlight rail + varied mosaic) via the shared `Storefront`.
 * Each card links to the /v/$slug viewer.
 */

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, CloudUpload, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { ModelSelect } from '@/components/rmhvibe/ModelSelect';
import { DEFAULT_VIBE_MODEL, type VibeModel } from '@/lib/rmhvibe/vibe-types';
import type { VibeCard } from '@/lib/rmhvibe/vibe.server';
import { Storefront, type StoreItem } from '@/components/creator-studio/storefront';

export type VibeGallery = { items: VibeCard[]; nextCursor: string | null };

/** Compact relative time ("just now", "3h ago", "2d ago") via Intl. */
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
function timeAgo(iso: string): string {
  const diffMs = Date.parse(iso) - Date.now();
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return 'just now';
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(sec / secs), unit);
  }
  return 'just now';
}

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function PagesTab({
  initial,
  seed,
  fetchGallery,
}: {
  initial: VibeGallery;
  seed: number;
  fetchGallery: (opts: { data: { q?: string; cursor?: string } }) => Promise<VibeGallery>;
}) {
  const { t } = useTranslation('v');
  const navigate = useNavigate();

  // Admins get a one-click "backfill all thumbnails" control next to the search.
  const session = useSession();
  const isAdmin = Boolean((session.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const [backfilling, setBackfilling] = useState(false);

  const backfillThumbs = useCallback(async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const res = await fetch('/api/admin/vibe/backfill-thumbs', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { count?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Request failed');
      window.alert(
        t('backfill-thumbs-done', {
          defaultValue:
            'Queued {{count}} page(s) for thumbnail re-render. They will refresh as the worker processes them.',
          count: data.count ?? 0,
        }),
      );
    } catch {
      window.alert(
        t('backfill-thumbs-failed', {
          defaultValue: 'Failed to queue thumbnail backfill. Try again.',
        }),
      );
    } finally {
      setBackfilling(false);
    }
  }, [backfilling, t]);

  // Prompt dock: type a prompt and stream a new page at /v/new.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<VibeModel>(DEFAULT_VIBE_MODEL);

  function submit() {
    const prompt = inputRef.current?.value.trim();
    if (!prompt) return;
    navigate({ to: '/v/new', search: { prompt, model } });
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<VibeCard[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // Debounced search: refetch from the top whenever the query settles.
  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchGallery({ data: { q } });
        if (reqId.current !== id) return;
        setItems(res.items);
        setCursor(res.nextCursor);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchGallery]);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    const id = reqId.current;
    setLoading(true);
    try {
      const res = await fetchGallery({ data: { q: query.trim(), cursor } });
      if (reqId.current !== id) return; // a search superseded us
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } finally {
      if (reqId.current === id) setLoading(false);
    }
  }, [loading, cursor, query, fetchGallery]);

  // Infinite scroll: fetch the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loadMore]);

  const storeItems: StoreItem[] = useMemo(
    () =>
      items.map((card) => {
        const title = card.title || card.prompt;
        return {
          id: card.slug,
          title,
          description: card.description || undefined,
          coverUrl: card.thumbnailUrl,
          hue: hueFor(card.slug),
          cta: t('open-page', { defaultValue: 'Open page' }),
          meta: timeAgo(card.createdAt),
          to: `/v/${card.slug}`,
        };
      }),
    [items, t],
  );

  const toolbar = (
    <header className="vibe-gallery__head store-pages__head glass-chrome">
      <h3 className="vibe-gallery__title">{t('pages-title', { defaultValue: 'Pages' })}</h3>
      <div className="vibe-search">
        <Search size={16} className="vibe-search__icon" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search-placeholder', { defaultValue: 'Search pages...' })}
          aria-label={t('search-aria-label', { defaultValue: 'Search pages' })}
          className="vibe-search__input"
        />
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={backfillThumbs}
          disabled={backfilling}
          aria-busy={backfilling}
          className="vibe-backfill"
          title={t('backfill-thumbs', { defaultValue: 'Backfill all page thumbnails' })}
          aria-label={t('backfill-thumbs', { defaultValue: 'Backfill all page thumbnails' })}
        >
          <CloudUpload size={18} aria-hidden="true" />
        </button>
      )}
    </header>
  );

  return (
    <div className="vibe-gallery">
      {/* Prompt hero: generate a new page. */}
      <section className="vibe-gallery__hero">
        <p className="vibe-rise vibe-presents mb-3">RMH Studios presents</p>
        <h2 className="vibe-rise-2 vibe-title">
          {t('hero-headline', { defaultValue: 'The everything platform.' })}
        </h2>
        <div className="mt-8 flex w-full justify-center">
          <div className="vibe-dock vibe-dock--area vibe-rise-soft">
            <textarea
              ref={inputRef}
              name="prompt"
              rows={3}
              autoComplete="off"
              onKeyDown={handlePromptKeyDown}
              placeholder={t('prompt-placeholder', { defaultValue: 'Where do you want to go?' })}
              aria-label={t('prompt-aria-label', {
                defaultValue: 'Describe the page you want to create',
              })}
              className="vibe-dock__textarea"
            />
            <div className="vibe-dock__footer">
              <ModelSelect value={model} onChange={setModel} />
              <button
                type="button"
                onClick={submit}
                aria-label={t('generate-aria-label', { defaultValue: 'Generate' })}
                className="vibe-dock__submit"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pages storefront: searchable, rotating showcase of everything generated. */}
      <div className="store-pages">
        <Storefront
          items={storeItems}
          seed={seed}
          featured={!query.trim()}
          toolbar={toolbar}
          emptyLabel={
            query.trim()
              ? t('no-results', { defaultValue: 'No pages match that search.' })
              : t('empty-gallery', { defaultValue: 'No pages yet — be the first to make one.' })
          }
        />
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading && (
        <p className="vibe-hint vibe-gallery__loading">
          {t('loading', { defaultValue: 'Loading…' })}
        </p>
      )}
    </div>
  );
}
