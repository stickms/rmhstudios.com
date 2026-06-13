/**
 * /v — Vibe gallery.
 *
 * A public, searchable, lazy-loaded grid of every generated vibe page. Each card
 * shows the server-rendered screenshot, title, description, and when it was made,
 * and links to the full /v/$slug viewer. Rendered as a flat route (outside the
 * _site sidebar) for the same full-bleed look as the homepage and viewer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowLeft, Search } from 'lucide-react';
import { listVibePages, type VibeCard } from '@/lib/rmhvibe/vibe.server';
import '@/components/rmhvibe/vibe.css';

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string }) => data)
  .handler(({ data }) => listVibePages(data));

export const Route = createFileRoute('/v/')({
  head: () => ({
    meta: [
      { title: 'Browse Pages | RMH Studios' },
      { name: 'description', content: 'Browse every page generated on RMH Studios.' },
    ],
  }),
  loader: () => fetchGallery({ data: {} }),
  component: Gallery,
});

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

function Gallery() {
  const initial = Route.useLoaderData();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<VibeCard[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  // Identifies the latest in-flight request so stale responses (e.g. an earlier
  // search) can't clobber newer state.
  const reqId = useRef(0);

  // Debounced search: refetch from the top whenever the query settles.
  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    const t = setTimeout(async () => {
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
    return () => clearTimeout(t);
  }, [query]);

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
  }, [loading, cursor, query]);

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

  return (
    <main className="vibe-screen vibe-gallery min-h-screen">
      <header className="vibe-gallery__head">
        <Link to="/" aria-label="Back to home" className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <h1 className="vibe-gallery__title">Pages</h1>
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages..."
            aria-label="Search pages"
            className="vibe-search__input"
          />
        </div>
      </header>

      {items.length === 0 && !loading ? (
        <p className="vibe-hint vibe-gallery__empty">
          {query.trim() ? 'No pages match that search.' : 'No pages yet — be the first to make one.'}
        </p>
      ) : (
        <div className="vibe-grid">
          {items.map((card, i) => (
            <VibeGridCard key={card.slug} card={card} index={i} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading && <p className="vibe-hint vibe-gallery__loading">Loading…</p>}
    </main>
  );
}

function VibeGridCard({ card, index }: { card: VibeCard; index: number }) {
  const title = card.title || card.prompt;
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // On a hard refresh the SSR'd <img> can finish loading before hydration
  // attaches onLoad, so the event never fires. Catch that by checking
  // `complete` on mount, otherwise the image stays hidden (opacity 0).
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  // Reveal each card once it scrolls into view (and immediately for the cards
  // already on-screen). Falls back to visible if IntersectionObserver is absent.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Link
      ref={ref}
      to="/v/$slug"
      params={{ slug: card.slug }}
      className={`vibe-card ${inView ? 'is-in' : ''}`}
      // Gentle cascade within each visible row; cycles so deep cards never wait long.
      style={{ animationDelay: `${(index % 6) * 55}ms` }}
    >
      <div className="vibe-card__thumb">
        {card.thumbnailUrl ? (
          <img
            ref={imgRef}
            src={card.thumbnailUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`vibe-card__img ${loaded ? 'is-loaded' : ''}`}
          />
        ) : (
          <div className="vibe-card__placeholder" aria-hidden="true">
            <span>{title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="vibe-card__body">
        <p className="vibe-card__title">{title}</p>
        {card.description && <p className="vibe-card__desc">{card.description}</p>}
        <p className="vibe-card__meta">{timeAgo(card.createdAt)}</p>
      </div>
    </Link>
  );
}
