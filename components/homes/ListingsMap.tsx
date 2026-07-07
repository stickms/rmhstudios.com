'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Listing, SearchCenter } from '@/lib/homes/types';

/** Free, key-less OSM raster style (same approach as RMH Rideshare's map). */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

interface ListingsMapProps {
  listings: Listing[];
  center: SearchCenter | null;
  activeId: string | null;
  onActive: (id: string | null) => void;
  onSelect?: (id: string) => void;
  className?: string;
}

/** Compact currency for map price pins ("$1.9k", "$389k"). */
function pinLabel(listing: Listing): string {
  const p = listing.price;
  if (!p || p <= 0) return 'Ask';
  if (p >= 1000) return `$${(p / 1000).toFixed(p >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(p)}`;
}

/**
 * Interactive results map. Renders a price pin for every listing with
 * coordinates; hovering a pin syncs with the results grid via `onActive`.
 * SSR-safe (mounts client-side only, like the rideshare map).
 */
export function ListingsMap({
  listings,
  center,
  activeId,
  onActive,
  onSelect,
  className,
}: ListingsMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pins = useMemo(
    () => listings.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng)),
    [listings],
  );

  // Fit to the visible pins whenever the result set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pins.length === 0) return;
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const l of pins) {
      minLng = Math.min(minLng, l.lng);
      maxLng = Math.max(maxLng, l.lng);
      minLat = Math.min(minLat, l.lat);
      maxLat = Math.max(maxLat, l.lat);
    }
    if (minLng === maxLng && minLat === maxLat) {
      map.easeTo({ center: [minLng, minLat], zoom: 13, duration: 500 });
    } else {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 56, duration: 600, maxZoom: 15 },
      );
    }
  }, [pins]);

  const initialCenter = center ?? { lat: 39.5, lng: -98.35 };

  return (
    <div
      className={`relative overflow-hidden rounded-site border border-site-border bg-site-surface ${className ?? ''}`}
    >
      {mounted ? (
        <Map
          ref={mapRef}
          mapStyle={OSM_STYLE}
          initialViewState={{
            longitude: initialCenter.lng,
            latitude: initialCenter.lat,
            zoom: center ? 11 : 3.5,
          }}
          attributionControl={{ compact: true }}
          dragRotate={false}
          touchZoomRotate
          style={{ width: '100%', height: '100%' }}
        >
          {pins.map((l) => {
            const active = l.id === activeId;
            return (
              <Marker key={l.id} longitude={l.lng} latitude={l.lat} anchor="bottom">
                <button
                  type="button"
                  onMouseEnter={() => onActive(l.id)}
                  onMouseLeave={() => onActive(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(l.id);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold shadow transition ${
                    active
                      ? 'z-10 scale-110 border-site-accent bg-site-accent text-white'
                      : 'border-site-border bg-site-surface text-site-text hover:border-site-accent'
                  }`}
                >
                  {pinLabel(l)}
                </button>
              </Marker>
            );
          })}
        </Map>
      ) : (
        <div className="h-full min-h-64 w-full animate-pulse bg-site-bg" />
      )}
    </div>
  );
}
