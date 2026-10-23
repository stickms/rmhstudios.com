/**
 * RMH Rideshare — driver application & dashboard (/rideshare/drive)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Car,
  MapPin,
  Star,
  Power,
  CalendarClock,
  Route as RouteLucide,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useSession } from '@/components/Providers';
import { ActiveRidePanel } from '@/components/rideshare/ActiveRidePanel';
import { DriverEarnings } from '@/components/rideshare/DriverEarnings';
import { RIDE_CLASSES, rideClassName, type RideClassId } from '@/lib/rideshare/classes';
import { formatDistance, formatDuration, formatUsd, payoutBreakdown } from '@/lib/rideshare/geo';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

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
      <PageLayout title={t('drive-page-title', { defaultValue: 'Drive with RMH' })} wide>
        <div className="flex justify-center py-20">
          <Spinner className="text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={t('drive-page-title', { defaultValue: 'Drive with RMH' })} wide>
        <SignedOutPrompt
          icon={Car}
          callbackURL="/rideshare/drive"
          title={t('sign-in-to-drive', { defaultValue: 'Sign in to drive' })}
          description={t('sign-in-required', {
            defaultValue: 'You need an RMH account to apply as a driver.',
          })}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('drive-page-title', { defaultValue: 'Drive with RMH' })} wide>
      <div className="w-full max-w-4xl px-4 pt-4 pb-12">
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
      className="glass-fill rounded-site"
    >
      <EmptyState
        icon={Clock}
        title={t('application-under-review', { defaultValue: 'Application under review' })}
        description={t('application-review-desc', {
          defaultValue:
            "Thanks for applying! Our team is reviewing your details and license number. You'll be able to accept rides as soon as you're approved.",
        })}
      />
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

  const field = (
    id: string,
    label: string,
    input: React.ReactNode,
  ) => (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-site-text">
        {label}
      </label>
      {input}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="site-section-label">
          {t('tell-us-about-your-ride', { defaultValue: 'Tell us about your ride' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('application-form-desc', { defaultValue: "We'll review your vehicle details and license number, then let you know once you're approved to drive." })}
        </p>
      </div>

      {rejected?.rejectionReason && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-site border border-site-danger/30 bg-site-danger/10 p-4 text-sm text-site-danger"
        >
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">{t('previous-application-rejected', { defaultValue: "Your previous application wasn't approved" })}</p>
            <p>{rejected.rejectionReason}</p>
            <p>{t('reapply-hint', { defaultValue: 'You can update your details and re-apply below.' })}</p>
          </div>
        </div>
      )}

      <div className="glass-fill rounded-site p-4">
        <h3 className="site-section-label mb-3">{t('vehicle-details', { defaultValue: 'Vehicle details' })}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('drv-make', t('label-make', { defaultValue: 'Make' }),
            <Input id="drv-make" required maxLength={60} value={form.vehicleMake} onChange={(e) => set('vehicleMake', e.target.value)} placeholder={t('placeholder-make', { defaultValue: 'Toyota' })} />)}
          {field('drv-model', t('label-model', { defaultValue: 'Model' }),
            <Input id="drv-model" required maxLength={60} value={form.vehicleModel} onChange={(e) => set('vehicleModel', e.target.value)} placeholder={t('placeholder-model', { defaultValue: 'Camry' })} />)}
          {field('drv-year', t('label-year', { defaultValue: 'Year' }),
            <Input id="drv-year" required type="number" min={1980} max={new Date().getFullYear() + 2} value={form.vehicleYear} onChange={(e) => set('vehicleYear', e.target.value)} placeholder={t('placeholder-year', { defaultValue: '2022' })} />)}
          {field('drv-color', t('label-color', { defaultValue: 'Color' }),
            <Input id="drv-color" required maxLength={30} value={form.vehicleColor} onChange={(e) => set('vehicleColor', e.target.value)} placeholder={t('placeholder-color', { defaultValue: 'Silver' })} />)}
          {field('drv-plate', t('label-license-plate', { defaultValue: 'License plate' }),
            <Input id="drv-plate" required maxLength={16} value={form.licensePlate} onChange={(e) => set('licensePlate', e.target.value.toUpperCase())} placeholder={t('placeholder-license-plate', { defaultValue: 'ABC-1234' })} />)}
          {field('drv-license', t('label-drivers-license', { defaultValue: "Driver's license #" }),
            <Input id="drv-license" required maxLength={40} value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value.toUpperCase())} placeholder={t('placeholder-drivers-license', { defaultValue: 'D1234567' })} />)}
          {field('drv-seats', t('label-passenger-seats', { defaultValue: 'Passenger seats' }),
            <Input id="drv-seats" required type="number" min={1} max={8} value={form.seats} onChange={(e) => set('seats', e.target.value)} />)}
        </div>
      </div>

      <div className="glass-fill space-y-3 rounded-site p-4">
        <div>
          <h3 className="site-section-label">{t('which-class-drive', { defaultValue: 'Which class will you drive?' })}</h3>
          <p className="mt-2 text-xs text-site-text-muted">{t('class-hint', { defaultValue: 'Pick the option that best matches your vehicle.' })}</p>
        </div>
        <LiquidTabs
          size="sm"
          tabs={RIDE_CLASSES.map((cls) => ({ id: cls.id, label: cls.name }))}
          value={vehicleClass}
          onChange={(id) => setVehicleClass(id as RideClassId)}
          aria-label={t('which-class-drive', { defaultValue: 'Which class will you drive?' })}
        />
      </div>

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        <ShieldCheck aria-hidden />
        {t('submit-application', { defaultValue: 'Submit application' })}
      </Button>
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
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Please try again.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
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
        <div className="flex items-center gap-3">
          <span
            id="drv-online-label"
            className={`flex items-center gap-2 text-sm font-semibold ${online ? 'text-site-success' : 'text-site-text-muted'}`}
          >
            <Power className="h-4 w-4" aria-hidden />
            {online ? t('status-online', { defaultValue: 'Online' }) : t('status-offline', { defaultValue: 'Offline' })}
          </span>
          <Switch
            checked={online}
            disabled={togglingOnline}
            onCheckedChange={() => void toggleOnline()}
            aria-labelledby="drv-online-label"
          />
        </div>
      </div>

      {!online && (
        <p className="glass-inset rounded-site px-4 py-3 text-center text-sm text-site-text-muted">
          {t('offline-hint', { defaultValue: "You're offline. Go online to receive new ride requests." })}
        </p>
      )}

      {/* Active trip — full live panel */}
      {focusRideId && (
        <section className="space-y-3">
          <h2 className="site-section-label">{t('your-active-trip', { defaultValue: 'Your active trip' })}</h2>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="site-section-label">{t('open-ride-requests', { defaultValue: 'Open ride requests' })}</h2>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={load}>
            {t('refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={20} className="text-site-text-muted" /></div>
        ) : available.length === 0 ? (
          <EmptyState
            icon={Car}
            title={t('no-open-requests', { defaultValue: 'No open requests right now. Check back soon!' })}
          />
        ) : (
          <ul className="space-y-3">
            {available.map((ride) => (
              <RideCard key={ride.id} ride={ride} busy={busy === ride.id} showRider>
                <Button size="sm" className="min-h-11" onClick={() => accept(ride.id)} loading={busy === ride.id}>
                  {busy !== ride.id && <Car aria-hidden />}
                  {t('accept', { defaultValue: 'Accept' })}
                </Button>
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
      className={`glass-fill rounded-site p-4 ${busy ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-site-text">
          {rideClassName(ride.rideClass)}
          {ride.status === 'SCHEDULED' && ride.scheduledFor && (
            <Badge variant="accent" icon={<CalendarClock aria-hidden />}>
              {format(new Date(ride.scheduledFor), 'EEE h:mm a')}
            </Badge>
          )}
        </span>
        {showRider && (
          <span className="text-xs text-site-text-muted">{t('for-rider', { name: ride.rider.name ?? t('a-rider', { defaultValue: 'a rider' }), defaultValue: 'for {{name}}' })}</span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-xs text-site-text-muted">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-site-success" />
          <span className="truncate" title={ride.pickupLabel}>{ride.pickupLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-site-accent" />
          <span className="truncate" title={ride.dropoffLabel}>{ride.dropoffLabel}</span>
        </div>
      </div>
      {ride.notes && (
        <p className="glass-inset mt-3 rounded-site-sm px-3 py-2 text-xs text-site-text-muted">"{ride.notes}"</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-site-border pt-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-site-success">
              {formatUsd(payoutBreakdown(ride.estimatedFareCents).driverEarningsCents)}
            </span>
            <span className="text-xs text-site-text-dim">{t('est-pay', { defaultValue: 'est. pay' })}</span>
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
