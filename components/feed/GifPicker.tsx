'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ImageOff } from 'lucide-react';
import type { KlipyGif } from '@/lib/klipy.server';
import { buildGifSearchPath } from '@/lib/gif-search';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose?: () => void;
  className?: string;
}

export function GifPicker({ onSelect, onClose, className = '' }: GifPickerProps) {
  const { t } = useTranslation('feed');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KlipyGif[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch a page. pos === null starts a fresh result set.
  // Stable: reads no outer state; only calls setState setters (stable identities).
  const fetchPage = useCallback(async (q: string, pos: string | null) => {
    setLoading(true);
    if (pos === null) setError(null);
    try {
      const res = await fetch(buildGifSearchPath(q, pos));
      if (res.status === 503) { setError('unavailable'); setResults([]); setNext(null); return; }
      if (!res.ok) { setError('failed'); return; }
      const data: { results: KlipyGif[]; next: string | null } = await res.json();
      setResults((prev) => (pos === null ? data.results : [...prev, ...data.results]));
      setNext(data.next);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced query → fresh fetch (trending when empty).
  useEffect(() => {
    const id = setTimeout(() => { void fetchPage(query, null); }, 300);
    return () => clearTimeout(id);
  }, [query, fetchPage]);

  // Infinite scroll: load the next page when the sentinel enters view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !next || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchPage(query, next);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loading, query, fetchPage]);

  if (error === 'unavailable') return null; // feature off → hide entirely

  return (
    <div className={`border border-site-border rounded-site bg-site-bg p-2 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('gif-search-placeholder', { defaultValue: 'Search GIFs...' })}
            className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm pl-8 pr-2 py-2 border border-site-border outline-none focus:border-site-accent transition-colors"
          />
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}
            className="p-1.5 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {error === 'failed' && (
          <div className="flex items-center justify-center gap-2 py-6 text-site-text-dim text-xs">
            <ImageOff className="w-4 h-4" />
            {t('gif-search-failed', { defaultValue: 'Could not load GIFs. Try again.' })}
          </div>
        )}
        {!error && results.length === 0 && !loading && (
          <div className="py-6 text-center text-xs text-site-text-dim">
            {t('gif-search-empty', { defaultValue: 'No GIFs found' })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1">
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onSelect(g.url); onClose?.(); }}
              className="block rounded-site-sm overflow-hidden border border-site-border hover:border-site-accent transition-colors"
            >
              <img src={g.preview} alt={g.description || t('gif-alt', { defaultValue: 'GIF' })} loading="lazy" className="w-full h-auto" />
            </button>
          ))}
        </div>
        {loading && (
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div className="h-24 rounded-site-sm bg-site-surface animate-pulse" />
            <div className="h-24 rounded-site-sm bg-site-surface animate-pulse" />
          </div>
        )}
        <div ref={sentinelRef} className="h-2" />
      </div>

      <div className="pt-1.5 text-[10px] text-site-text-dim text-right">
        {t('powered-by-klipy', { defaultValue: 'Powered by KLIPY' })}
      </div>
    </div>
  );
}

export default GifPicker;
