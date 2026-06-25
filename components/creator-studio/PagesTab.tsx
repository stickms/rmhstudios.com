/**
 * Creator Studio · Pages tab.
 *
 * The page-generation surface: a prompt dock (type anything, get a shareable,
 * collaboratively-editable webpage) above a public, searchable, lazy-loaded grid
 * of every generated page. Ported from the former standalone /v route so the
 * Studio owns it directly. Each card links to the /v/$slug viewer.
 */

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { ArrowRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModelSelect } from '@/components/rmhvibe/ModelSelect';
import { DEFAULT_VIBE_MODEL, type VibeModel } from '@/lib/rmhvibe/vibe-types';
import type { VibeCard } from '@/lib/rmhvibe/vibe.server';

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

export function PagesTab({
  initial,
  fetchGallery,
}: {
  initial: VibeGallery;
  fetchGallery: (opts: { data: { q?: string; cursor?: string } }) => Promise<VibeGallery>;
}) {
  const { t } = useTranslation('v');
  const navigate = useNavigate();

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

  return (
    <div className="vibe-gallery">
      {/* Prompt hero: generate a new page. */}
      <section className="vibe-gallery__hero">
        <p className="vibe-rise vibe-presents mb-3">RMH Studios presents</p>
        <h2 className="vibe-rise-2 vibe-title">{t('hero-headline', { defaultValue: 'The everything platform.' })}</h2>
        <div className="mt-8 flex w-full justify-center">
          <div className="vibe-dock vibe-dock--area vibe-rise-soft">
            <textarea
              ref={inputRef}
              name="prompt"
              rows={3}
              autoComplete="off"
              onKeyDown={handlePromptKeyDown}
              placeholder={t('prompt-placeholder', { defaultValue: 'Where do you want to go?' })}
              aria-label={t('prompt-aria-label', { defaultValue: 'Describe the page you want to create' })}
              className="vibe-dock__textarea"
            />
            <div className="vibe-dock__footer">
              <ModelSelect value={model} onChange={setModel} />
              <button type="button" onClick={submit} aria-label={t('generate-aria-label', { defaultValue: 'Generate' })} className="vibe-dock__submit">
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pages section: searchable grid of everything generated so far. */}
      <header className="vibe-gallery__head">
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
      </header>

      {items.length === 0 && !loading ? (
        <p className="vibe-hint vibe-gallery__empty">
          {query.trim() ? t('no-results', { defaultValue: 'No pages match that search.' }) : t('empty-gallery', { defaultValue: 'No pages yet — be the first to make one.' })}
        </p>
      ) : (
        <div className="vibe-grid">
          {items.map((card, i) => (
            <VibeGridCard key={card.slug} card={card} index={i} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading && <p className="vibe-hint vibe-gallery__loading">{t('loading', { defaultValue: 'Loading…' })}</p>}
    </div>
  );
}

function VibeGridCard({ card, index }: { card: VibeCard; index: number }) {
  const title = card.title || card.prompt;
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

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
