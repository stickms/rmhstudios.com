'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AnchoredMenu } from '@/components/ui/anchored-menu';

export interface HomesPlace {
  label: string;
  lat: number;
  lng: number;
}

interface LocationSearchProps {
  value: string;
  onQueryChange: (q: string) => void;
  onSelect: (place: HomesPlace) => void;
  /** Called when the user submits free text without picking a suggestion. */
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Debounced location autocomplete backed by /api/homes/geocode (OSM Nominatim).
 * Picking a suggestion resolves precise coordinates; submitting raw text lets
 * the server geocode it.
 */
export function LocationSearch({
  value,
  onQueryChange,
  onSelect,
  onSubmit,
  placeholder = 'City, neighborhood, or ZIP',
  autoFocus,
}: LocationSearchProps) {
  const [results, setResults] = useState<HomesPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The RESULTS are what is held through the close, not just a flag: choosing a
  // suggestion clears the list on the same tick it closes the menu, and a list
  // that emptied itself mid-exit would collapse to a bare pill on the way out.

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function handleChange(q: string) {
    onQueryChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/homes/geocode?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch {
        // ignore transient errors — user can retry
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function choose(place: HomesPlace) {
    onQueryChange(place.label);
    onSelect(place);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
        <Input
          type="text"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setOpen(false);
              onSubmit?.();
            }
          }}
          placeholder={placeholder}
          className="h-11 pl-9 pr-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-site-text-dim" />
        ) : (
          value && (
            <button
              type="button"
              aria-label="Clear location"
              onClick={() => {
                onQueryChange('');
                setResults([]);
                setOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-site-text-dim hover:text-site-text"
            >
              <X className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      {/* The suggestion list PORTALS, and on this screen that is a functional
          fix rather than a tidy-up. It used to be `absolute z-30` inside the
          page, i.e. inside `.radial-frame`'s stacking context (pinned at 1),
          with no collision flip and no viewport fit — so on a short viewport
          the list ran down into the bottom 76px where the hub orb lives at
          z-80, and a tap on an address behind the orb's accent disc did not
          select the address: it OPENED THE RADIAL NAVIGATION OVERLAY.

          `focusOnOpen={false}` because this is an autocomplete: the panel opens
          while the user is still typing, and pulling focus out of the field on
          the first keystroke would make it impossible to type in. */}
      <AnchoredMenu
        open={open && results.length > 0}
        onClose={() => setOpen(false)}
        anchorRef={boxRef}
        role="listbox"
        align="start"
        focusOnOpen={false}
        label={placeholder ?? 'Location suggestions'}
        className="w-[var(--anchored-menu-anchor-w)] max-h-72"
      >
        {results.map((r, i) => (
          <button
            key={`${r.lat},${r.lng},${i}`}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => choose(r)}
            className="flex w-full min-h-9 pointer-coarse:min-h-11 items-start gap-2.5 rounded-site-sm px-3 py-2 text-left text-sm text-site-text transition-colors duration-site hover:bg-site-surface-hover focus-visible:bg-site-surface-hover"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
            <span className="line-clamp-2">{r.label}</span>
          </button>
        ))}
      </AnchoredMenu>
    </div>
  );
}
