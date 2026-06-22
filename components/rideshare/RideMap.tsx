'use client';

import { MapPin, Navigation, Car } from 'lucide-react';
import { osmEmbedUrl, type LatLng, type RidePlace } from '@/lib/rideshare/geo';

interface RideMapProps {
  pickup: RidePlace | null;
  dropoff: RidePlace | null;
  /** Live driver position — when set, the map marker tracks the driver. */
  driverLocation?: LatLng | null;
  className?: string;
}

/**
 * Lightweight, key-less map preview using the OpenStreetMap embed. When both
 * endpoints are set it frames the trip; otherwise it shows a friendly prompt.
 */
export function RideMap({ pickup, dropoff, driverLocation, className }: RideMapProps) {
  const ready = pickup && dropoff;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-site-border bg-site-surface ${className ?? ''}`}
    >
      {ready ? (
        <iframe
          title="Trip map"
          className="h-full min-h-64 w-full"
          src={osmEmbedUrl(pickup, dropoff, driverLocation)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-2xl bg-site-surface-hover p-3">
            <Navigation className="h-7 w-7 text-site-text-muted" />
          </div>
          <p className="max-w-xs text-sm text-site-text-muted">
            {pickup
              ? 'Now choose where you’re heading to see your route on the map.'
              : 'Set a pickup and drop-off to preview your route on OpenStreetMap.'}
          </p>
        </div>
      )}

      {ready && (
        <div className="space-y-1 border-t border-site-border bg-site-bg/80 p-3 backdrop-blur">
          {driverLocation && (
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Car className="h-3.5 w-3.5 shrink-0" />
              <span>Driver location (live)</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-site-text">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate" title={pickup.label}>{pickup.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-site-text">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-site-accent" />
            <span className="truncate" title={dropoff.label}>{dropoff.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
