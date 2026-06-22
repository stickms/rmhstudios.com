/**
 * RMH Rideshare — request a ride (/rideshare/ride)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Loader2,
  Navigation,
  Clock,
  Route as RouteIcon,
  CircleDollarSign,
  Car,
  CheckCircle2,
  XCircle,
  LogIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { LocationSearch } from '@/components/rideshare/LocationSearch';
import { RideMap } from '@/components/rideshare/RideMap';
import { RideClassPicker } from '@/components/rideshare/RideClassPicker';
import {
  estimateFareCents,
  formatDistance,
  formatDuration,
  formatUsd,
  type RidePlace,
} from '@/lib/rideshare/geo';
import { RIDE_CLASSES, rideClassName, type RideClassId } from '@/lib/rideshare/classes';

export const Route = createFileRoute('/_site/rideshare/ride')({
  head: () => ({ meta: [{ title: 'Request a ride — RMH Rideshare' }] }),
  component: RequestRidePage,
});

interface RideVehicle {
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: number;
  licensePlate: string;
  seats: number;
}
interface RidePerson {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}
interface Ride {
  id: string;
  rideClass: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  requestedAt: string;
  driver: (RidePerson & { rideshareDriver: RideVehicle | null }) | null;
}

const STATUS_META: Record<Ride['status'], { label: string; className: string }> = {
  REQUESTED: { label: 'Finding a driver', className: 'text-amber-400 bg-amber-400/10' },
  ACCEPTED: { label: 'Driver on the way', className: 'text-sky-400 bg-sky-400/10' },
  IN_PROGRESS: { label: 'On your trip', className: 'text-site-accent bg-site-accent/10' },
  COMPLETED: { label: 'Completed', className: 'text-emerald-400 bg-emerald-400/10' },
  CANCELLED: { label: 'Cancelled', className: 'text-site-text-muted bg-site-surface-hover' },
};

const ACTIVE = new Set<Ride['status']>(['REQUESTED', 'ACCEPTED', 'IN_PROGRESS']);

function RequestRidePage() {
  const { data: session, isPending } = useSession();

  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [rideClass, setRideClass] = useState<RideClassId>('RMH_X');
  const [notes, setNotes] = useState('');

  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [routing, setRouting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [rides, setRides] = useState<Ride[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);

  const loadRides = useCallback(async () => {
    try {
      const res = await fetch('/api/rideshare/rides?scope=mine');
      if (res.ok) {
        const data = await res.json();
        setRides(data.rides ?? []);
      }
    } finally {
      setLoadingRides(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadRides();
    else setLoadingRides(false);
  }, [session, loadRides]);

  // Fetch road distance/duration whenever both endpoints are set.
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRouteInfo(null);
      return;
    }
    let cancelled = false;
    setRouting(true);
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
        if (typeof data.distanceMeters === 'number') {
          setRouteInfo({ distanceMeters: data.distanceMeters, durationSeconds: data.durationSeconds });
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setRouting(false));
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  const fareLabels = useMemo(() => {
    if (!routeInfo) return undefined;
    const out: Partial<Record<RideClassId, string>> = {};
    for (const c of RIDE_CLASSES) {
      out[c.id] = formatUsd(estimateFareCents(routeInfo.distanceMeters, c.id));
    }
    return out;
  }, [routeInfo]);

  const activeRide = rides.find((r) => ACTIVE.has(r.status));

  async function submit() {
    if (!pickup || !dropoff) {
      toast.error('Please set both a pickup and a drop-off.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/rideshare/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rideClass,
          pickupLabel: pickup.label,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLabel: dropoff.label,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not request your ride.');
        return;
      }
      toast.success('Ride requested! Hang tight while we find a driver.');
      setPickup(null);
      setDropoff(null);
      setNotes('');
      setRouteInfo(null);
      loadRides();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRide(id: string) {
    try {
      const res = await fetch(`/api/rideshare/rides/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not cancel the ride.');
        return;
      }
      toast.success('Ride cancelled.');
      loadRides();
    } catch {
      toast.error('Something went wrong.');
    }
  }

  if (isPending) {
    return (
      <PageLayout title="Request a ride" wide>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Request a ride" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <Navigation className="mx-auto h-10 w-10 text-site-accent" />
          <h2 className="mt-4 text-xl font-bold text-site-text">Sign in to request a ride</h2>
          <p className="mt-2 text-site-text-muted">You need an RMH account to use RMH Rideshare.</p>
          <Link
            to="/login"
            search={{ callbackURL: '/rideshare/ride' }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105"
          >
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Request a ride" wide>
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 px-4 py-6 md:px-8 lg:grid-cols-2">
        {/* Left: form */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
            <h2 className="mb-4 text-lg font-bold text-site-text">Where to?</h2>
            <div className="space-y-3">
              <LocationSearch
                label="Pickup"
                value={pickup}
                onSelect={setPickup}
                dotClassName="bg-emerald-400"
                placeholder="Enter pickup location"
              />
              <LocationSearch
                label="Drop-off"
                value={dropoff}
                onSelect={setDropoff}
                dotClassName="bg-site-accent"
                placeholder="Enter destination"
              />
            </div>

            {(routing || routeInfo) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-site-border bg-site-surface px-4 py-3 text-sm">
                {routing && !routeInfo ? (
                  <span className="flex items-center gap-2 text-site-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> Calculating route…
                  </span>
                ) : routeInfo ? (
                  <>
                    <span className="flex items-center gap-1.5 text-site-text">
                      <RouteIcon className="h-4 w-4 text-site-text-muted" />
                      {formatDistance(routeInfo.distanceMeters)}
                    </span>
                    <span className="flex items-center gap-1.5 text-site-text">
                      <Clock className="h-4 w-4 text-site-text-muted" />
                      {formatDuration(routeInfo.durationSeconds)}
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                      <CircleDollarSign className="h-4 w-4" /> Free
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
            <h2 className="mb-3 text-lg font-bold text-site-text">Pick your ride</h2>
            <RideClassPicker value={rideClass} onChange={setRideClass} fareLabels={fareLabels} />
          </div>

          <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">
              Notes for your driver (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. I’ll be by the main entrance"
              className="w-full resize-none rounded-lg border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60"
            />
          </div>

          <button
            onClick={submit}
            disabled={submitting || !pickup || !dropoff || !!activeRide}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Car className="h-4 w-4" />
            )}
            {activeRide ? 'You already have an active ride' : `Request ${rideClassName(rideClass)}`}
          </button>
        </div>

        {/* Right: map + my rides */}
        <div className="space-y-5">
          <RideMap pickup={pickup} dropoff={dropoff} className="h-72" />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-site-text">Your rides</h2>
              <button
                onClick={loadRides}
                className="text-xs text-site-accent hover:underline"
              >
                Refresh
              </button>
            </div>

            {loadingRides ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-site-text-muted" />
              </div>
            ) : rides.length === 0 ? (
              <p className="rounded-xl border border-dashed border-site-border px-4 py-8 text-center text-sm text-site-text-muted">
                No rides yet. Request your first ride!
              </p>
            ) : (
              <ul className="space-y-3">
                {rides.map((ride) => (
                  <motion.li
                    key={ride.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-site-border bg-site-surface/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-site-text">
                        {rideClassName(ride.rideClass)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[ride.status].className}`}>
                        {STATUS_META[ride.status].label}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-site-text-muted">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="truncate" title={ride.pickupLabel}>{ride.pickupLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-site-accent" />
                        <span className="truncate" title={ride.dropoffLabel}>{ride.dropoffLabel}</span>
                      </div>
                    </div>

                    {ride.driver && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-site-surface px-3 py-2 text-xs text-site-text">
                        <Car className="h-4 w-4 text-site-accent" />
                        <span className="font-medium">{ride.driver.name ?? 'Your driver'}</span>
                        {ride.driver.rideshareDriver && (
                          <span className="text-site-text-muted">
                            · {ride.driver.rideshareDriver.vehicleColor} {ride.driver.rideshareDriver.vehicleMake}{' '}
                            {ride.driver.rideshareDriver.vehicleModel} · {ride.driver.rideshareDriver.licensePlate}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <span className="flex items-center gap-3 text-xs text-site-text-dim">
                        {ride.distanceMeters != null && (
                          <span className="flex items-center gap-1">
                            <RouteIcon className="h-3 w-3" /> {formatDistance(ride.distanceMeters)}
                          </span>
                        )}
                        {ride.status === 'COMPLETED' && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        )}
                      </span>
                      {ACTIVE.has(ride.status) && (
                        <button
                          onClick={() => cancelRide(ride.id)}
                          className="flex items-center gap-1 text-xs text-red-400 transition-colors hover:text-red-300"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
