import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ensureMaplibreWorker } from '@/lib/maplibre';
import type { Listing, SearchCenter } from '@/lib/homes/types';

/**
 * Free, key-less OSM raster style, desaturated to the same minimalistic
 * black/white look RMH Rideshare's map uses. The desaturation is applied at the
 * GL layer (`raster-saturation`), NOT as a CSS filter on the container, so the
 * coloured price markers layered on top stay vivid and pop off the muted map.
 */
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
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -0.9,
        'raster-contrast': -0.05,
        'raster-brightness-min': 0.05,
        'raster-brightness-max': 0.95,
      },
    },
  ],
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
  // Set when the map itself has loaded. The first fit used to be lost whenever the results arrived before
  // the map did: the effect below ran once with no map, and nothing ran it again, so the map sat on its
  // continent-wide default with every pin off screen.
  const [ready, setReady] = useState(false);
  // Wire MapLibre's worker up before the canvas mounts, or the map never
  // finishes loading — see lib/maplibre.ts.
  useEffect(() => {
    let cancelled = false;
    ensureMaplibreWorker().then(() => {
      if (!cancelled) setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pins = useMemo(
    () => listings.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng)),
    [listings],
  );

  // The box around the pins, or null when there are none.
  const bounds = useMemo(() => {
    if (pins.length === 0) return null;
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
    return { minLng, minLat, maxLng, maxLat, point: minLng === maxLng && minLat === maxLat };
  }, [pins]);

  // Fit to the visible pins whenever the result set changes (and once the map exists: see `ready`).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !bounds) return;
    if (bounds.point) {
      map.easeTo({ center: [bounds.minLng, bounds.minLat], zoom: 13, duration: 500 });
    } else {
      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: 56, duration: 600, maxZoom: 15 },
      );
    }
  }, [bounds, ready]);

  const initialCenter = center ?? { lat: 39.5, lng: -98.35 };

  return (
    <div
      className={`homes-map relative overflow-hidden rounded-site border border-site-border bg-site-bg-subtle ${className ?? ''}`}
    >
      {mounted ? (
        <Map
          ref={mapRef}
          onLoad={() => setReady(true)}
          mapStyle={OSM_STYLE}
          // Open on the pins when the results are already here, so the map never starts on a continent
          // and then travels; the effect above handles every later result set.
          initialViewState={
            bounds && !bounds.point
              ? {
                  bounds: [
                    [bounds.minLng, bounds.minLat],
                    [bounds.maxLng, bounds.maxLat],
                  ],
                  fitBoundsOptions: { padding: 56, maxZoom: 15 },
                }
              : bounds
                ? { longitude: bounds.minLng, latitude: bounds.minLat, zoom: 13 }
                : {
                    longitude: initialCenter.lng,
                    latitude: initialCenter.lat,
                    zoom: center ? 11 : 3.5,
                  }
          }
          attributionControl={{ compact: true }}
          dragRotate={false}
          touchZoomRotate
          style={{ width: '100%', height: '100%' }}
        >
          {pins.map((l) => {
            const active = l.id === activeId;
            return (
              // The lift lives on the MARKER, not on the button inside it.
              // MapLibre writes a `transform` on every marker wrapper and never
              // assigns marker elements a z-index, so each wrapper is its own
              // stacking context and inter-marker order is pure DOM order — a
              // `z-10` on the button was measured inside its OWN marker and
              // could not compete with the marker next to it. In dense results
              // the highlighted pin stayed underneath its neighbours with its
              // grown edge poking out from behind one, which reads as a
              // rendering glitch rather than a selection.
              <Marker
                key={l.id}
                longitude={l.lng}
                latitude={l.lat}
                anchor="bottom"
                style={{ zIndex: active ? 1 : 0 }}
              >
                <button
                  type="button"
                  onMouseEnter={() => onActive(l.id)}
                  onMouseLeave={() => onActive(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(l.id);
                  }}
                  className={`cursor-pointer rounded-site-sm border px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors duration-(--m1) ${
                    active
                      ? 'border-site-accent bg-site-accent text-site-accent-fg'
                      : 'border-site-text bg-site-surface text-site-text hover:bg-site-bg-subtle'
                  }`}
                >
                  {pinLabel(l)}
                </button>
              </Marker>
            );
          })}
        </Map>
      ) : (
        <div className="h-full min-h-64 w-full" />
      )}
    </div>
  );
}
