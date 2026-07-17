/**
 * RMH Rideshare — driver application & dashboard (/rideshare/drive)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import {
  Loader2,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Car,
  MapPin,
  LogIn,
  Star,
  Power,
  CalendarClock,
  Route as RouteLucide,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageLayout } from '@/components/feed/PageLayout';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { ActiveRidePanel } from '@/components/rideshare/ActiveRidePanel';
import { DriverEarnings } from '@/components/rideshare/DriverEarnings';
import { RIDE_CLASSES, rideClassName, type RideClassId } from '@/lib/rideshare/classes';
import { formatDistance, formatDuration, formatUsd, payoutBreakdown } from '@/lib/rideshare/geo';

export const Route = createFileRoute('/_site/rideshare/drive')({
  head: () => ({ meta: [{ title: 'Drive with RMH Rideshare' }] }),
  component: DrivePage,
});

interface DriverRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  licensePlate: string;
  vehicleClass: string;
  seats: number;
  isOnline: boolean;
  ratingCount: number;
  ratingAvg: number | null;
  rejectionReason: string | null;
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
  estimatedFareCents: number;
  scheduledFor: string | null;
  notes: string | null;
  rider: RidePerson;
}

function DrivePage() {
  const { t } = useTranslation('rideshare');
  const { data: session, isPending } = useSession();
  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDriver = useCallback(async () => {
    try {
      const res = await fetch('/api/rideshare/driver');
      if (res.ok) {
        const data = await res.json();
        setDriver(data.driver);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadDriver();
    else setLoading(false);
  }, [session, loadDriver]);

  if (isPending || loading) {
    return (
      <PageLayout title="Drive" wide>
        <div className="flex justify-center py-20">
          <Spinner className="text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Drive" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <Car className="mx-auto h-10 w-10 text-site-accent" />
          <h2 className="mt-4 text-xl font-bold text-site-text">{t('sign-in-to-drive', { defaultValue: 'Sign in to drive' })}</h2>
          <p className="mt-2 text-site-text-muted">{t('sign-in-required', { defaultValue: 'You need an RMH account to apply as a driver.' })}</p>
          <Link
            to="/login"
            search={{ callbackURL: '/rideshare/drive' }}
            className="mt-5 inline-flex items-center gap-2 rounded-site bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105"
          >
            <LogIn className="h-4 w-4" /> {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Drive with RMH" wide>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
        {driver?.status === 'APPROVED' ? (
          <DriverDashboard driver={driver} currentUserId={session.user.id} onDriverChange={loadDriver} />
        ) : driver?.status === 'PENDING' ? (
          <PendingState />
        ) : (
          <ApplicationForm
            rejected={driver?.status === 'REJECTED' ? driver : null}
            onApplied={loadDriver}
          />
        )}
      </div>
    </PageLayout>
  );
}

function PendingState() {
  const { t } = useTranslation('rideshare');
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-site border border-site-border bg-site-surface/80 p-8 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-site bg-site-warning/15 text-site-warning">
        <Clock className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-site-text">{t('application-under-review', { defaultValue: 'Application under review' })}</h2>
      <p className="mx-auto mt-2 max-w-md text-site-text-muted">
        {t('application-review-desc', { defaultValue: "Thanks for applying! Our team is reviewing your details and license number. You'll be able to accept rides as soon as you're approved." })}
      </p>
    </motion.div>
  );
}

function ApplicationForm({
  rejected,
  onApplied,
}: {
  rejected: DriverRecord | null;
  onApplied: () => void;
}) {
  const [form, setForm] = useState({
    vehicleMake: rejected?.vehicleMake ?? '',
    vehicleModel: rejected?.vehicleModel ?? '',
    vehicleYear: rejected ? String(rejected.vehicleYear) : '',
    vehicleColor: rejected?.vehicleColor ?? '',
    licensePlate: rejected?.licensePlate ?? '',
    licenseNumber: '',
    seats: rejected ? String(rejected.seats) : '4',
  });
  const [vehicleClass, setVehicleClass] = useState<RideClassId>(
    (rejected?.vehicleClass as RideClassId) ?? 'RMH_X',
  );
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('rideshare');

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.licenseNumber.trim()) {
      toast.error(t('error-license-required', { defaultValue: "Please enter your driver's license number." }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/rideshare/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, vehicleClass }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('error-submit-application', { defaultValue: 'Could not submit your application.' }));
        return;
      }
      toast.success(t('application-submitted', { defaultValue: "Application submitted! We'll review it shortly." }));
      onApplied();
    } catch {
      toast.error(t('error-generic-retry', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-site-sm border border-site-border bg-site-surface px-3 py-2.5 text-base text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60 sm:py-2 sm:text-sm';

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-site-accent">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">{t('driver-application', { defaultValue: 'Driver application' })}</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
          {t('tell-us-about-your-ride', { defaultValue: 'Tell us about your ride' })}
        </h2>
        <p className="mt-1 text-site-text-muted">
          {t('application-form-desc', { defaultValue: "We'll review your vehicle details and license number, then let you know once you're approved to drive." })}
        </p>
      </div>

      {rejected?.rejectionReason && (
        <div className="flex items-start gap-3 rounded-site border border-site-danger/30 bg-site-danger/10 p-4 text-sm text-site-danger">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('previous-application-rejected', { defaultValue: "Your previous application wasn't approved" })}</p>
            <p className="mt-0.5 text-site-danger/90">{rejected.rejectionReason}</p>
            <p className="mt-1 text-site-danger/70">{t('reapply-hint', { defaultValue: 'You can update your details and re-apply below.' })}</p>
          </div>
        </div>
      )}

      <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
        <h3 className="mb-4 font-semibold text-site-text">{t('vehicle-details', { defaultValue: 'Vehicle details' })}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-make', { defaultValue: 'Make' })}</label>
            <input required maxLength={60} value={form.vehicleMake} onChange={(e) => set('vehicleMake', e.target.value)} placeholder={t('placeholder-make', { defaultValue: 'Toyota' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-model', { defaultValue: 'Model' })}</label>
            <input required maxLength={60} value={form.vehicleModel} onChange={(e) => set('vehicleModel', e.target.value)} placeholder={t('placeholder-model', { defaultValue: 'Camry' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-year', { defaultValue: 'Year' })}</label>
            <input required type="number" min={1980} max={new Date().getFullYear() + 2} value={form.vehicleYear} onChange={(e) => set('vehicleYear', e.target.value)} placeholder={t('placeholder-year', { defaultValue: '2022' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-color', { defaultValue: 'Color' })}</label>
            <input required maxLength={30} value={form.vehicleColor} onChange={(e) => set('vehicleColor', e.target.value)} placeholder={t('placeholder-color', { defaultValue: 'Silver' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-license-plate', { defaultValue: 'License plate' })}</label>
            <input required maxLength={16} value={form.licensePlate} onChange={(e) => set('licensePlate', e.target.value.toUpperCase())} placeholder={t('placeholder-license-plate', { defaultValue: 'ABC-1234' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-drivers-license', { defaultValue: "Driver's license #" })}</label>
            <input required maxLength={40} value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value.toUpperCase())} placeholder={t('placeholder-drivers-license', { defaultValue: 'D1234567' })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">{t('label-passenger-seats', { defaultValue: 'Passenger seats' })}</label>
            <input required type="number" min={1} max={8} value={form.seats} onChange={(e) => set('seats', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
        <h3 className="mb-1 font-semibold text-site-text">{t('which-class-drive', { defaultValue: 'Which class will you drive?' })}</h3>
        <p className="mb-4 text-xs text-site-text-muted">{t('class-hint', { defaultValue: 'Pick the option that best matches your vehicle.' })}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RIDE_CLASSES.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => setVehicleClass(cls.id)}
              className={`rounded-site-sm border px-3 py-2 text-sm font-medium transition-all ${
                vehicleClass === cls.id
                  ? 'border-site-accent bg-site-accent/10 text-site-accent'
                  : 'border-site-border bg-site-surface text-site-text hover:border-site-border-bright'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-site bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {t('submit-application', { defaultValue: 'Submit application' })}
      </button>
    </form>
  );
}

function DriverDashboard({
  driver,
  currentUserId,
  onDriverChange,
}: {
  driver: DriverRecord;
  currentUserId: string;
  onDriverChange: () => void;
}) {
  const [available, setAvailable] = useState<Ride[]>([]);
  const [driving, setDriving] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(driver.isOnline);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [focusRideId, setFocusRideId] = useState<string | null>(null);
  const { t } = useTranslation('rideshare');

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([
        fetch('/api/rideshare/rides?scope=available').then((r) => (r.ok ? r.json() : { rides: [] })),
        fetch('/api/rideshare/rides?scope=driving').then((r) => (r.ok ? r.json() : { rides: [] })),
      ]);
      setAvailable(a.rides ?? []);
      setDriving(d.rides ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll open requests + active trips so drivers see new work without refreshing.
  useEffect(() => {
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [load]);

  // Keep the live panel up through completion (so the driver can rate the rider)
  // until they dismiss it.
  useEffect(() => {
    if (driving[0]) setFocusRideId(driving[0].id);
  }, [driving[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleOnline() {
    const next = !online;
    setTogglingOnline(true);
    setOnline(next); // optimistic
    try {
      const res = await fetch('/api/rideshare/driver', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline: next }),
      });
      if (!res.ok) {
        setOnline(!next);
        toast.error(t('error-update-availability', { defaultValue: 'Could not update availability.' }));
      } else {
        onDriverChange();
      }
    } catch {
      setOnline(!next);
    } finally {
      setTogglingOnline(false);
    }
  }

  async function accept(rideId: string) {
    setBusy(rideId);
    try {
      const res = await fetch(`/api/rideshare/rides/${rideId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('error-action-failed', { defaultValue: 'Action failed.' }));
        return;
      }
      toast.success(t('ride-accepted', { defaultValue: 'Ride accepted — head to the pickup!' }));
      load();
    } catch {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Approved banner + availability toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-site border border-site-success/30 bg-site-success/10 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-site-success" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-site-text">
              {t('approved-driver', { defaultValue: "You're an approved RMH driver" })}
              {driver.ratingAvg != null && (
                <span className="flex items-center gap-0.5 text-xs text-site-warning">
                  <Star className="h-3 w-3 fill-site-warning" /> {driver.ratingAvg.toFixed(1)}
                </span>
              )}
            </p>
            <p className="truncate text-sm text-site-text-muted">
              {driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel} · {driver.licensePlate} ·{' '}
              {rideClassName(driver.vehicleClass)}
            </p>
          </div>
        </div>
        <button
          onClick={toggleOnline}
          disabled={togglingOnline}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            online
              ? 'border-site-success/40 bg-site-success/15 text-site-success'
              : 'border-site-border bg-site-surface text-site-text-muted'
          }`}
        >
          <Power className="h-4 w-4" />
          {online ? t('status-online', { defaultValue: 'Online' }) : t('status-offline', { defaultValue: 'Offline' })}
        </button>
      </div>

      {!online && (
        <p className="rounded-site border border-dashed border-site-border px-4 py-3 text-center text-sm text-site-text-muted">
          {t('offline-hint', { defaultValue: "You're offline. Go online to receive new ride requests." })}
        </p>
      )}

      {/* Active trip — full live panel */}
      {focusRideId && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-site-text">{t('your-active-trip', { defaultValue: 'Your active trip' })}</h2>
          <ActiveRidePanel
            key={focusRideId}
            rideId={focusRideId}
            currentUserId={currentUserId}
            onChange={load}
            onClose={() => {
              setFocusRideId(null);
              load();
            }}
          />
        </section>
      )}

      {/* Available requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-site-text">{t('open-ride-requests', { defaultValue: 'Open ride requests' })}</h2>
          <button onClick={load} className="text-xs text-site-accent hover:underline">{t('refresh', { defaultValue: 'Refresh' })}</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={20} className="text-site-text-muted" /></div>
        ) : available.length === 0 ? (
          <p className="rounded-site border border-dashed border-site-border px-4 py-6 text-center text-sm text-site-text-muted">
            {t('no-open-requests', { defaultValue: 'No open requests right now. Check back soon!' })}
          </p>
        ) : (
          <ul className="space-y-3">
            {available.map((ride) => (
              <RideCard key={ride.id} ride={ride} busy={busy === ride.id} showRider>
                <button onClick={() => accept(ride.id)} disabled={busy === ride.id} className="flex items-center gap-1.5 rounded-site-sm bg-site-accent px-4 py-1.5 text-xs font-semibold text-(--site-accent-fg) disabled:opacity-50">
                  {busy === ride.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Car className="h-3.5 w-3.5" />}
                  {t('accept', { defaultValue: 'Accept' })}
                </button>
              </RideCard>
            ))}
          </ul>
        )}
      </section>

      {/* Earnings */}
      <DriverEarnings />
    </div>
  );
}

function RideCard({
  ride,
  busy,
  showRider,
  children,
}: {
  ride: Ride;
  busy: boolean;
  showRider?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('rideshare');
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-site border border-site-border bg-site-surface/80 p-4 ${busy ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-site-text">
          {rideClassName(ride.rideClass)}
          {ride.status === 'SCHEDULED' && ride.scheduledFor && (
            <span className="flex items-center gap-1 rounded-full bg-site-accent/10 px-2 py-0.5 text-xs font-normal text-site-accent">
              <CalendarClock className="h-3 w-3" /> {format(new Date(ride.scheduledFor), 'EEE h:mm a')}
            </span>
          )}
        </span>
        {showRider && (
          <span className="text-xs text-site-text-muted">{t('for-rider', { name: ride.rider.name ?? t('a-rider', { defaultValue: 'a rider' }), defaultValue: 'for {{name}}' })}</span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-xs text-site-text-muted">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-site-success" />
          <span className="truncate" title={ride.pickupLabel}>{ride.pickupLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-site-accent" />
          <span className="truncate" title={ride.dropoffLabel}>{ride.dropoffLabel}</span>
        </div>
      </div>
      {ride.notes && (
        <p className="mt-2 rounded-site-sm bg-site-surface px-3 py-2 text-xs text-site-text-muted">"{ride.notes}"</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-site-border pt-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-site-success">
              {formatUsd(payoutBreakdown(ride.estimatedFareCents).driverEarningsCents)}
            </span>
            <span className="text-[11px] text-site-text-dim">{t('est-pay', { defaultValue: 'est. pay' })}</span>
          </div>
          <span className="mt-1 flex items-center gap-3 text-xs text-site-text-dim">
            {ride.distanceMeters != null && (
              <span className="flex items-center gap-1">
                <RouteLucide className="h-3 w-3" /> {formatDistance(ride.distanceMeters)}
              </span>
            )}
            {ride.durationSeconds != null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDuration(ride.durationSeconds)}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </motion.li>
  );
}
