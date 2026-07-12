'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import { MapPin, Navigation, Car } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLng, RidePlace } from '@/lib/rideshare/geo';

interface RideMapProps {
  pickup: RidePlace | null;
  dropoff: RidePlace | null;
  /** Live driver position — when set, the map marker tracks the driver. */
  driverLocation?: LatLng | null;
  className?: string;
}

/**
 * Free, key-less raster style backed by the standard OpenStreetMap tiles.
 * MapLibre GL renders these as an interactive map (pan/zoom) onto which we can
 * draw the actual road route — something the old static OSM embed couldn't do.
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
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

type Coord = [number, number];

/**
 * Interactive trip map (react-map-gl + MapLibre + OpenStreetMap tiles). When
 * both endpoints are set it geocodes the road route via the directions API and
 * draws it; otherwise it shows a friendly prompt. No API key required.
 */
export function RideMap({ pickup, dropoff, driverLocation, className }: RideMapProps) {
  const { t } = useTranslation('c-rideshare');
  const ready = Boolean(pickup && dropoff);
  const mapRef = useRef<MapRef | null>(null);
  const [route, setRoute] = useState<Coord[] | null>(null);
  // MapLibre needs a browser; only mount the canvas after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch the road geometry whenever the endpoints change. Falls back to a
  // straight line between the two points if routing returns no geometry.
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      fromLat: String(pickup.lat),
      fromLng: String(pickup.lng),
      toLat: String(dropoff.lat),
      toLng: String(dropoff.lng),
    });
    fetch(`/api/rideshare/directions?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const geo: Coord[] | null = Array.isArray(data.geometry) ? data.geometry : null;
        setRoute(geo ?? [[pickup.lng, pickup.lat], [dropoff.lng, dropoff.lat]]);
      })
      .catch(() => {
        if (!cancelled) setRoute([[pickup.lng, pickup.lat], [dropoff.lng, dropoff.lat]]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  const routeGeoJson = useMemo(
    () =>
      route
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: route },
          }
        : null,
    [route],
  );

  // Frame the trip: fit the route (or just the endpoints) into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickup || !dropoff) return;
    const pts: Coord[] = route ?? [[pickup.lng, pickup.lat], [dropoff.lng, dropoff.lat]];
    if (driverLocation) pts.push([driverLocation.lng, driverLocation.lat]);
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of pts) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 48, duration: 600, maxZoom: 15 },
    );
  }, [route, driverLocation, pickup, dropoff]);

  return (
    <div
      className={`relative overflow-hidden rounded-site border border-site-border bg-site-surface ${className ?? ''}`}
    >
      {ready && mounted ? (
        <div
          className="h-full min-h-56 w-full sm:min-h-64"
          // Desaturate the OSM tiles into a soft, minimal map that blends with
          // the dark UI. Markers/route are SVG/canvas overlays above the tiles.
          style={{ filter: 'grayscale(0.85) contrast(0.95) brightness(0.95)' }}
        >
          <Map
            ref={mapRef}
            mapStyle={OSM_STYLE}
            initialViewState={{
              longitude: (pickup!.lng + dropoff!.lng) / 2,
              latitude: (pickup!.lat + dropoff!.lat) / 2,
              zoom: 11,
            }}
            attributionControl={{ compact: true }}
            dragRotate={false}
            touchZoomRotate
            style={{ width: '100%', height: '100%' }}
          >
            {routeGeoJson && (
              <Source id="route" type="geojson" data={routeGeoJson}>
                <Layer
                  id="route-casing"
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#0b0f17', 'line-width': 7, 'line-opacity': 0.55 }}
                />
                <Layer
                  id="route-line"
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#22d3ee', 'line-width': 4 }}
                />
              </Source>
            )}

            <Marker longitude={pickup!.lng} latitude={pickup!.lat} anchor="center">
              <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 shadow" />
            </Marker>
            <Marker longitude={dropoff!.lng} latitude={dropoff!.lat} anchor="bottom">
              <MapPin className="h-6 w-6 text-site-accent drop-shadow" fill="currentColor" />
            </Marker>
            {driverLocation && (
              <Marker longitude={driverLocation.lng} latitude={driverLocation.lat} anchor="center">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-sky-500 shadow">
                  <Car className="h-3.5 w-3.5 text-white" />
                </span>
              </Marker>
            )}
          </Map>
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center sm:min-h-64">
          <div className="rounded-site bg-site-surface-hover p-3">
            <Navigation className="h-7 w-7 text-site-text-muted" />
          </div>
          <p className="max-w-xs text-sm text-site-text-muted">
            {pickup
              ? t('choose-dropoff-prompt', { defaultValue: "Now choose where you're heading to see your route on the map." })
              : t('set-pickup-dropoff-prompt', { defaultValue: 'Set a pickup and drop-off to preview your route on OpenStreetMap.' })}
          </p>
        </div>
      )}

      {ready && (
        <div className="space-y-1 border-t border-site-border bg-site-bg/95 p-3 backdrop-blur">
          {driverLocation && (
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Car className="h-3.5 w-3.5 shrink-0" />
              <span>{t('driver-location-live', { defaultValue: 'Driver location (live)' })}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-site-text">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate" title={pickup!.label}>{pickup!.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-site-text">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-site-accent" />
            <span className="truncate" title={dropoff!.label}>{dropoff!.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
