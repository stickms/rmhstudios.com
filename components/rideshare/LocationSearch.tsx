'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X, Star, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
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
  /** Show a "Use current location" button (browser geolocation). */
  allowCurrentLocation?: boolean;
}

export function LocationSearch({
  label,
  placeholder,
  value,
  onSelect,
  dotClassName = 'bg-site-accent',
  savedPlaces,
  allowCurrentLocation,
}: LocationSearchProps) {
  const { t } = useTranslation('c-rideshare');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // The RESULTS are what is held through the close, not just a flag: `choose()`
  // clears the list on the same tick it closes the menu, and a list that emptied
  // itself mid-exit would collapse to a bare pill on the way out.

  function useCurrentLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(t('location-services-unavailable', { defaultValue: "Location services aren't available on this device." }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/rideshare/reverse?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (!res.ok) {
            // Still usable: drop a pin even without a nice label.
            onSelect({ label: data.label ?? `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`, lat: latitude, lng: longitude });
            if (!data.label) toast.message(t('using-current-location', { defaultValue: 'Using your current location.' }));
          } else {
            onSelect({ label: data.label, lat: latitude, lng: longitude });
          }
        } catch {
          toast.error(t('location-lookup-failed', { defaultValue: 'Could not look up your location.' }));
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? t('location-permission-denied', { defaultValue: 'Location permission denied. Enable it in your browser to use this.' })
            : t('location-get-failed', { defaultValue: 'Could not get your location.' }),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

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
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rideshare/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || t('search-failed', { defaultValue: 'Search failed' }));
          setResults([]);
        } else {
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setError(t('search-failed', { defaultValue: 'Search failed' }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value, t]);

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
      <span className="mb-2 block text-sm font-medium text-site-text">{label}</span>

      {value ? (
        <div className="glass-inset flex min-h-11 items-center gap-2 rounded-site-sm px-3 py-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClassName}`} />
          <span className="min-w-0 flex-1 truncate text-sm text-site-text" title={value.label}>
            {value.label}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={clear}
            className="shrink-0 text-site-text-muted"
            aria-label={t('clear-label', { defaultValue: 'Clear {{label}}', label })}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <span className={`absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${dotClassName}`} />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setOpen(true)}
              aria-label={label}
              placeholder={placeholder ?? t('search-placeholder', { defaultValue: 'Search for an address or place' })}
              className="pl-8 pr-9"
              autoComplete="off"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-site-text-muted" />
            )}
          </div>

          {/* Current-location + saved-place quick picks (before typing) */}
          {(allowCurrentLocation || (savedPlaces && savedPlaces.length > 0)) && query.trim().length < 3 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {allowCurrentLocation && (
                <Button
                  type="button"
                  variant="accent-outline"
                  size="sm"
                  className="min-h-11 rounded-full"
                  onClick={useCurrentLocation}
                  disabled={locating}
                >
                  {locating ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />}
                  {t('current-location', { defaultValue: 'Current location' })}
                </Button>
              )}
              {savedPlaces?.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 rounded-full"
                  onClick={() => choose(p)}
                >
                  <Star className="text-site-warning" aria-hidden /> {p.savedLabel}
                </Button>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="mt-1 text-xs text-site-danger">{error}</p>}

      {/* PORTALLED — see the note on the homes LocationSearch. This is the worst
          instance of the same bug: at 360x640 on /rideshare/ride the Drop-off
          list ran into the bottom 76px where the hub orb sits at z-80, and a tap
          on an address behind the accent disc opened the radial navigation
          overlay instead of selecting it. AnchoredMenu portals out of the
          frame's stacking context, flips when the side below has no room, and
          caps its height to the room that side actually has. */}
      <AnchoredMenu
        open={open && results.length > 0 && !value}
        onClose={() => setOpen(false)}
        anchorRef={boxRef}
        role="listbox"
        align="start"
        focusOnOpen={false}
        // Reuses the field's own placeholder key rather than minting a new one:
        // a new key has to land in all 16 locale catalogs to keep the i18n
        // parity gate green, and this string already names exactly this list.
        label={t('search-placeholder', { defaultValue: 'Search for an address or place' })}
        className="w-[var(--anchored-menu-anchor-w)] max-h-64"
      >
        {results.map((r, i) => (
          <button
            key={`${r.lat},${r.lng},${i}`}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => choose(r)}
            data-evert=""
            data-row-glow=""
            data-jelly="off"
            className="flex w-full min-h-9 pointer-coarse:min-h-11 items-start gap-2 px-4 py-2 text-left text-sm text-site-text transition-colors duration-site"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
            <span className="min-w-0 flex-1">{r.label}</span>
          </button>
        ))}
      </AnchoredMenu>
    </div>
  );
}
