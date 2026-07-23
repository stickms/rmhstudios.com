/**
 * RMH Rideshare — request a ride (/rideshare/ride)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import {
  Loader2,
  Navigation,
  Route as RouteIcon,
  Car,
  CheckCircle2,
  LogIn,
  CalendarClock,
  Clock,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageLayout } from '@/components/feed/PageLayout';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { LocationSearch, type SavedPlaceOption } from '@/components/rideshare/LocationSearch';
import { RideMap } from '@/components/rideshare/RideMap';
import { RideClassPicker } from '@/components/rideshare/RideClassPicker';
import { FareBreakdown } from '@/components/rideshare/FareBreakdown';
import { ActiveRidePanel } from '@/components/rideshare/ActiveRidePanel';
import { SavedPlaces } from '@/components/rideshare/SavedPlaces';
import { estimateFareCents, formatDistance, formatUsd, type RidePlace } from '@/lib/rideshare/geo';
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
  status: 'SCHEDULED' | 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  requestedAt: string;
  scheduledFor: string | null;
  driver: (RidePerson & { rideshareDriver: RideVehicle | null }) | null;
}

const STATUS_META: Record<Ride['status'], { label: string; className: string }> = {
  SCHEDULED: { label: 'Scheduled', className: 'text-site-accent bg-site-accent/10' },
  REQUESTED: { label: 'Finding a driver', className: 'text-site-warning bg-site-warning/10' },
  ACCEPTED: { label: 'Driver on the way', className: 'text-site-accent bg-site-accent/10' },
  IN_PROGRESS: { label: 'On your trip', className: 'text-site-accent bg-site-accent/10' },
  COMPLETED: { label: 'Completed', className: 'text-site-success bg-site-success/10' },
  CANCELLED: { label: 'Cancelled', className: 'text-site-text-muted bg-site-surface-hover' },
};

const ACTIVE = new Set<Ride['status']>(['REQUESTED', 'ACCEPTED', 'IN_PROGRESS']);

/** Minimum selectable datetime-local value (now + 5 min), in local time. */
function minScheduleValue(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000 - new Date().getTimezoneOffset() * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

function RequestRidePage() {
  const { t } = useTranslation('rideshare');
  const { data: session, isPending } = useSession();

  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [rideClass, setRideClass] = useState<RideClassId>('RMH_X');
  const [notes, setNotes] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');

  const [routeInfo, setRouteInfo] = useState<{
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);
  const [routing, setRouting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [rides, setRides] = useState<Ride[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceOption[]>([]);

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

  const loadPlaces = useCallback(async () => {
    const res = await fetch('/api/rideshare/places');
    if (res.ok) {
      const data = await res.json();
      setSavedPlaces(
        (data.places ?? []).map(
          (p: { id: string; label: string; address: string; lat: number; lng: number }) => ({
            id: p.id,
            savedLabel: p.label,
            label: p.address,
            lat: p.lat,
            lng: p.lng,
          }),
        ),
      );
    }
  }, []);

  useEffect(() => {
    if (session) {
      loadRides();
      loadPlaces();
    } else {
      setLoadingRides(false);
    }
  }, [session, loadRides, loadPlaces]);

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
          setRouteInfo({
            distanceMeters: data.distanceMeters,
            durationSeconds: data.durationSeconds,
          });
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

  // Keep the live panel mounted through completion (so the rider can rate) until
  // they dismiss it; a fresh active ride re-focuses automatically.
  const [focusRideId, setFocusRideId] = useState<string | null>(null);
  useEffect(() => {
    if (activeRide) setFocusRideId(activeRide.id);
  }, [activeRide?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!pickup || !dropoff) {
      toast.error(
        t('error-missing-locations', { defaultValue: 'Please set both a pickup and a drop-off.' }),
      );
      return;
    }
    if (scheduleMode && !scheduledFor) {
      toast.error(
        t('error-missing-schedule-time', {
          defaultValue: 'Pick a date and time for your scheduled ride.',
        }),
      );
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
          scheduledFor:
            scheduleMode && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data.error || t('error-request-failed', { defaultValue: 'Could not request your ride.' }),
        );
        return;
      }
      toast.success(
        scheduleMode
          ? t('success-ride-scheduled', {
              defaultValue: "Ride scheduled! We'll match a driver near your pickup time.",
            })
          : t('success-ride-requested', {
              defaultValue: 'Ride requested! Hang tight while we find a driver.',
            }),
      );
      setPickup(null);
      setDropoff(null);
      setNotes('');
      setRouteInfo(null);
      setScheduleMode(false);
      setScheduledFor('');
      loadRides();
    } catch {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelScheduled(id: string) {
    const res = await fetch(`/api/rideshare/rides/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    if (res.ok) {
      toast.success(t('success-ride-cancelled', { defaultValue: 'Scheduled ride cancelled.' }));
      loadRides();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || t('error-cancel-failed', { defaultValue: 'Could not cancel.' }));
    }
  }

  if (isPending) {
    return (
      <PageLayout title={t('page-title', { defaultValue: 'Request a ride' })} wide>
        <div className="flex justify-center py-20">
          <Spinner className="text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={t('page-title', { defaultValue: 'Request a ride' })} wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <Navigation className="mx-auto h-10 w-10 text-site-accent" />
          <h2 className="mt-4 text-xl font-bold text-site-text">
            {t('sign-in-heading', { defaultValue: 'Sign in to request a ride' })}
          </h2>
          <p className="mt-2 text-site-text-muted">
            {t('sign-in-description', {
              defaultValue: 'You need an RMH account to use RMH Rideshare.',
            })}
          </p>
          <Link
            to="/login"
            search={{ callbackURL: '/rideshare/ride' }}
            className="mt-5 inline-flex items-center gap-2 rounded-site bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105"
          >
            <LogIn className="h-4 w-4" /> {t('sign-in-button', { defaultValue: 'Sign in' })}
          </Link>
        </div>
      </PageLayout>
    );
  }

  const upcomingRides = rides.filter((r) => r.status === 'SCHEDULED');
  const pastRides = rides.filter((r) => r.id !== focusRideId && r.status !== 'SCHEDULED');

  return (
    <PageLayout title={t('page-title', { defaultValue: 'Request a ride' })} wide>
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-8">
        {focusRideId ? (
          /* Live trip takes over the page while a ride is in flight. */
          <ActiveRidePanel
            rideId={focusRideId}
            currentUserId={session.user.id}
            onChange={loadRides}
            onClose={() => {
              setFocusRideId(null);
              loadRides();
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: form */}
            <div className="space-y-5">
              <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
                <h2 className="mb-4 text-lg font-bold text-site-text">
                  {t('where-to-heading', { defaultValue: 'Where to?' })}
                </h2>
                <div className="space-y-3">
                  <LocationSearch
                    label={t('pickup-label', { defaultValue: 'Pickup' })}
                    value={pickup}
                    onSelect={setPickup}
                    dotClassName="bg-site-success"
                    placeholder={t('pickup-placeholder', { defaultValue: 'Enter pickup location' })}
                    savedPlaces={savedPlaces}
                    allowCurrentLocation
                  />
                  <LocationSearch
                    label={t('dropoff-label', { defaultValue: 'Drop-off' })}
                    value={dropoff}
                    onSelect={setDropoff}
                    dotClassName="bg-site-accent"
                    placeholder={t('dropoff-placeholder', { defaultValue: 'Enter destination' })}
                    savedPlaces={savedPlaces}
                    allowCurrentLocation
                  />
                </div>

                {routing && !routeInfo && (
                  <div className="mt-4 flex items-center gap-2 rounded-site border border-site-border bg-site-surface px-4 py-3 text-sm text-site-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />{' '}
                    {t('calculating-route', { defaultValue: 'Calculating route…' })}
                  </div>
                )}
              </div>

              <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
                <h2 className="mb-3 text-lg font-bold text-site-text">
                  {t('pick-your-ride-heading', { defaultValue: 'Pick your ride' })}
                </h2>
                <RideClassPicker
                  value={rideClass}
                  onChange={setRideClass}
                  fareLabels={fareLabels}
                />
              </div>

              {routeInfo && (
                <FareBreakdown
                  distanceMeters={routeInfo.distanceMeters}
                  durationSeconds={routeInfo.durationSeconds}
                  classId={rideClass}
                />
              )}

              <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
                <label className="mb-1.5 block text-xs font-medium text-site-text-muted">
                  {t('notes-label', { defaultValue: 'Notes for your driver (optional)' })}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={t('notes-placeholder', {
                    defaultValue: "e.g. I'll be by the main entrance",
                  })}
                  className="w-full resize-none rounded-site-sm border border-site-border bg-site-surface px-3 py-2.5 text-base text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60 sm:py-2 sm:text-sm"
                />
              </div>

              {/* Schedule for later */}
              <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-site-text">
                    <CalendarClock className="h-4 w-4 text-site-accent" />{' '}
                    {t('schedule-for-later', { defaultValue: 'Schedule for later' })}
                  </span>
                  <input
                    type="checkbox"
                    checked={scheduleMode}
                    onChange={(e) => setScheduleMode(e.target.checked)}
                    className="h-4 w-4 accent-(--site-accent)"
                  />
                </label>
                {scheduleMode && (
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    min={minScheduleValue()}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="mt-3 w-full rounded-site-sm border border-site-border bg-site-surface px-3 py-2.5 text-base text-site-text outline-none transition-colors focus:border-site-accent/60 sm:py-2 sm:text-sm"
                  />
                )}
              </div>

              <button
                onClick={submit}
                disabled={submitting || !pickup || !dropoff}
                className="flex w-full items-center justify-center gap-2 rounded-site bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : scheduleMode ? (
                  <CalendarClock className="h-4 w-4" />
                ) : (
                  <Car className="h-4 w-4" />
                )}
                {scheduleMode
                  ? t('schedule-ride-button', {
                      rideClass: rideClassName(rideClass),
                      defaultValue: 'Schedule {{rideClass}}',
                    })
                  : t('request-ride-button', {
                      rideClass: rideClassName(rideClass),
                      defaultValue: 'Request {{rideClass}}',
                    })}
              </button>
            </div>

            {/* Right: live map preview + saved places */}
            <div className="space-y-5 lg:sticky lg:top-[var(--site-sticky-secondary-top)] lg:self-start">
              <RideMap pickup={pickup} dropoff={dropoff} className="h-80" />
              <SavedPlaces places={savedPlaces} onChanged={loadPlaces} />
            </div>
          </div>
        )}

        {/* Upcoming scheduled rides */}
        {upcomingRides.length > 0 && (
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-site-text">
              <CalendarClock className="h-5 w-5 text-site-accent" />{' '}
              {t('upcoming-rides-heading', { defaultValue: 'Upcoming rides' })}
            </h2>
            <ul className="space-y-3">
              {upcomingRides.map((ride) => (
                <motion.li
                  key={ride.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between gap-3 rounded-site border border-site-border bg-site-surface/80 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-site-text">
                      {rideClassName(ride.rideClass)}
                      {ride.scheduledFor && (
                        <span className="flex items-center gap-1 text-xs font-normal text-site-accent">
                          <Clock className="h-3 w-3" />{' '}
                          {format(new Date(ride.scheduledFor), 'EEE d MMM, h:mm a')}
                        </span>
                      )}
                    </div>
                    <div
                      className="truncate text-xs text-site-text-muted"
                      title={`${ride.pickupLabel} → ${ride.dropoffLabel}`}
                    >
                      {ride.pickupLabel} → {ride.dropoffLabel}
                    </div>
                  </div>
                  <button
                    onClick={() => cancelScheduled(ride.id)}
                    className="flex shrink-0 items-center gap-1 text-xs text-site-danger transition-colors hover:text-site-danger"
                  >
                    <XCircle className="h-3.5 w-3.5" />{' '}
                    {t('cancel-button', { defaultValue: 'Cancel' })}
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* Ride history */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-site-text">
              {t('ride-history-heading', { defaultValue: 'Ride history' })}
            </h2>
            <button onClick={loadRides} className="text-xs text-site-accent hover:underline">
              {t('refresh-button', { defaultValue: 'Refresh' })}
            </button>
          </div>

          {loadingRides ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} className="text-site-text-muted" />
            </div>
          ) : pastRides.length === 0 ? (
            <p className="rounded-site border border-dashed border-site-border px-4 py-8 text-center text-sm text-site-text-muted">
              {focusRideId || upcomingRides.length > 0
                ? t('past-trips-placeholder', { defaultValue: 'Your past trips will appear here.' })
                : t('no-rides-placeholder', {
                    defaultValue: 'No rides yet. Request your first ride!',
                  })}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pastRides.map((ride) => (
                <motion.li
                  key={ride.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-site border border-site-border bg-site-surface/80 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-site-text">
                      {rideClassName(ride.rideClass)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[ride.status].className}`}
                    >
                      {STATUS_META[ride.status].label}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-site-text-muted">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-site-success" />
                      <span className="truncate" title={ride.pickupLabel}>
                        {ride.pickupLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-site-accent" />
                      <span className="truncate" title={ride.dropoffLabel}>
                        {ride.dropoffLabel}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-site-text-dim">
                    {ride.distanceMeters != null && (
                      <span className="flex items-center gap-1">
                        <RouteIcon className="h-3 w-3" /> {formatDistance(ride.distanceMeters)}
                      </span>
                    )}
                    {ride.status === 'COMPLETED' && (
                      <span className="flex items-center gap-1 text-site-success">
                        <CheckCircle2 className="h-3 w-3" />{' '}
                        {t('done-label', { defaultValue: 'Done' })}
                      </span>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
