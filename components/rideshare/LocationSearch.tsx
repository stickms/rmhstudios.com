'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X, Star } from 'lucide-react';
import type { RidePlace } from '@/lib/rideshare/geo';

interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export interface SavedPlaceOption extends RidePlace {
  id: string;
  savedLabel: string;
}

interface LocationSearchProps {
  label: string;
  placeholder?: string;
  value: RidePlace | null;
  onSelect: (place: RidePlace | null) => void;
  /** Accent dot colour for the field. */
  dotClassName?: string;
  /** Saved places offered as quick picks before the user types. */
  savedPlaces?: SavedPlaceOption[];
}

export function LocationSearch({
  label,
  placeholder,
  value,
  onSelect,
  dotClassName = 'bg-site-accent',
  savedPlaces,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced geocode search.
  useEffect(() => {
    if (value) return; // already chosen
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rideshare/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'Search failed');
          setResults([]);
        } else {
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setError('Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function choose(r: GeocodeResult) {
    onSelect({ label: r.label, lat: r.lat, lng: r.lng });
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery('');
    setResults([]);
  }

  return (
    <div className="relative" ref={boxRef}>
      <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{label}</label>

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-site-border bg-site-surface px-3 py-2.5 sm:py-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClassName}`} />
          <span className="min-w-0 flex-1 truncate text-sm text-site-text" title={value.label}>
            {value.label}
          </span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-md p-1.5 text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <span className={`absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${dotClassName}`} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setOpen(true)}
              placeholder={placeholder ?? 'Search for an address or place'}
              className="w-full rounded-lg border border-site-border bg-site-surface py-2.5 pl-8 pr-9 text-base text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60 sm:py-2 sm:text-sm"
              autoComplete="off"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-site-text-muted" />
            )}
          </div>

          {/* Saved-place quick picks (before typing) */}
          {savedPlaces && savedPlaces.length > 0 && query.trim().length < 3 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {savedPlaces.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p)}
                  className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1.5 text-xs text-site-text transition-colors hover:border-site-accent/50 hover:text-site-accent"
                >
                  <Star className="h-3 w-3 text-amber-400" /> {p.savedLabel}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      {open && results.length > 0 && !value && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-site-border-bright bg-site-surface shadow-2xl ring-1 ring-black/40">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`} className="border-b border-site-border/60 last:border-0">
              <button
                type="button"
                onClick={() => choose(r)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-site-text transition-colors hover:bg-site-surface-hover"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-site-text-muted" />
                <span className="min-w-0 flex-1">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
