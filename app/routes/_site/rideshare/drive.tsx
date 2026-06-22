/**
 * RMH Rideshare — driver application & dashboard (/rideshare/drive)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Loader2,
  Upload,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Car,
  MapPin,
  LogIn,
  Trash2,
  Star,
  Power,
  Route as RouteLucide,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { ActiveRidePanel } from '@/components/rideshare/ActiveRidePanel';
import { RIDE_CLASSES, rideClassName, type RideClassId } from '@/lib/rideshare/classes';
import { formatDistance, formatDuration } from '@/lib/rideshare/geo';

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
  status: 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  notes: string | null;
  rider: RidePerson;
}

const LICENSE_MAX_MB = 8;

function DrivePage() {
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
          <Loader2 className="h-6 w-6 animate-spin text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Drive" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <Car className="mx-auto h-10 w-10 text-site-accent" />
          <h2 className="mt-4 text-xl font-bold text-site-text">Sign in to drive</h2>
          <p className="mt-2 text-site-text-muted">You need an RMH account to apply as a driver.</p>
          <Link
            to="/login"
            search={{ callbackURL: '/rideshare/drive' }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105"
          >
            <LogIn className="h-4 w-4" /> Sign in
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-site-border bg-site-surface/40 p-8 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-400">
        <Clock className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-site-text">Application under review</h2>
      <p className="mx-auto mt-2 max-w-md text-site-text-muted">
        Thanks for applying! Our team is reviewing your details and license. You’ll be able to
        accept rides as soon as you’re approved. We delete your license image right after review.
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    vehicleMake: rejected?.vehicleMake ?? '',
    vehicleModel: rejected?.vehicleModel ?? '',
    vehicleYear: rejected ? String(rejected.vehicleYear) : '',
    vehicleColor: rejected?.vehicleColor ?? '',
    licensePlate: rejected?.licensePlate ?? '',
    seats: rejected ? String(rejected.seats) : '4',
  });
  const [vehicleClass, setVehicleClass] = useState<RideClassId>(
    (rejected?.vehicleClass as RideClassId) ?? 'RMH_X',
  );
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image of your license.');
      return;
    }
    if (file.size > LICENSE_MAX_MB * 1024 * 1024) {
      toast.error(`Image is too large (max ${LICENSE_MAX_MB} MB).`);
      return;
    }
    setLicenseFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!licenseFile) {
      toast.error('Please upload a photo of your driver’s license.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('vehicleMake', form.vehicleMake);
      fd.set('vehicleModel', form.vehicleModel);
      fd.set('vehicleYear', form.vehicleYear);
      fd.set('vehicleColor', form.vehicleColor);
      fd.set('licensePlate', form.licensePlate);
      fd.set('seats', form.seats);
      fd.set('vehicleClass', vehicleClass);
      fd.set('license', licenseFile);

      const res = await fetch('/api/rideshare/driver', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not submit your application.');
        return;
      }
      toast.success('Application submitted! We’ll review it shortly.');
      onApplied();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60';

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-site-accent">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Driver application</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
          Tell us about your ride
        </h2>
        <p className="mt-1 text-site-text-muted">
          We’ll review your details and license. Your license is deleted from our storage as soon
          as the review is complete.
        </p>
      </div>

      {rejected?.rejectionReason && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Your previous application wasn’t approved</p>
            <p className="mt-0.5 text-red-300/90">{rejected.rejectionReason}</p>
            <p className="mt-1 text-red-300/70">You can update your details and re-apply below.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
        <h3 className="mb-4 font-semibold text-site-text">Vehicle details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Make</label>
            <input required maxLength={60} value={form.vehicleMake} onChange={(e) => set('vehicleMake', e.target.value)} placeholder="Toyota" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Model</label>
            <input required maxLength={60} value={form.vehicleModel} onChange={(e) => set('vehicleModel', e.target.value)} placeholder="Camry" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Year</label>
            <input required type="number" min={1980} max={new Date().getFullYear() + 2} value={form.vehicleYear} onChange={(e) => set('vehicleYear', e.target.value)} placeholder="2022" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Color</label>
            <input required maxLength={30} value={form.vehicleColor} onChange={(e) => set('vehicleColor', e.target.value)} placeholder="Silver" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">License plate</label>
            <input required maxLength={16} value={form.licensePlate} onChange={(e) => set('licensePlate', e.target.value.toUpperCase())} placeholder="ABC-1234" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Passenger seats</label>
            <input required type="number" min={1} max={8} value={form.seats} onChange={(e) => set('seats', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
        <h3 className="mb-1 font-semibold text-site-text">Which class will you drive?</h3>
        <p className="mb-4 text-xs text-site-text-muted">Pick the option that best matches your vehicle.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RIDE_CLASSES.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => setVehicleClass(cls.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
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

      <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
        <h3 className="mb-1 font-semibold text-site-text">Driver’s license</h3>
        <p className="mb-4 text-xs text-site-text-muted">
          Upload a clear photo. We use it only to verify you, then delete it after review.
        </p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-site-border">
            <img src={preview} alt="License preview" className="max-h-64 w-full object-contain bg-black/40" />
            <button
              type="button"
              onClick={() => {
                setLicenseFile(null);
                setPreview(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white backdrop-blur transition-colors hover:bg-black/80"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-site-border bg-site-surface px-4 py-8 text-sm text-site-text-muted transition-colors hover:border-site-accent/50 hover:text-site-text"
          >
            <Upload className="h-6 w-6" />
            Click to upload your license photo
            <span className="text-xs text-site-text-dim">PNG, JPEG or WebP · up to {LICENSE_MAX_MB} MB</span>
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Submit application
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
        toast.error('Could not update availability.');
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
        toast.error(data.error || 'Action failed.');
        return;
      }
      toast.success('Ride accepted — head to the pickup!');
      load();
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Approved banner + availability toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-site-text">
              You’re an approved RMH driver
              {driver.ratingAvg != null && (
                <span className="flex items-center gap-0.5 text-xs text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" /> {driver.ratingAvg.toFixed(1)}
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
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
              : 'border-site-border bg-site-surface text-site-text-muted'
          }`}
        >
          <Power className="h-4 w-4" />
          {online ? 'Online' : 'Offline'}
        </button>
      </div>

      {!online && (
        <p className="rounded-xl border border-dashed border-site-border px-4 py-3 text-center text-sm text-site-text-muted">
          You’re offline. Go online to receive new ride requests.
        </p>
      )}

      {/* Active trip — full live panel */}
      {focusRideId && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-site-text">Your active trip</h2>
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
          <h2 className="text-lg font-bold text-site-text">Open ride requests</h2>
          <button onClick={load} className="text-xs text-site-accent hover:underline">Refresh</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-site-text-muted" /></div>
        ) : available.length === 0 ? (
          <p className="rounded-xl border border-dashed border-site-border px-4 py-6 text-center text-sm text-site-text-muted">
            No open requests right now. Check back soon!
          </p>
        ) : (
          <ul className="space-y-3">
            {available.map((ride) => (
              <RideCard key={ride.id} ride={ride} busy={busy === ride.id} showRider>
                <button onClick={() => accept(ride.id)} disabled={busy === ride.id} className="flex items-center gap-1.5 rounded-lg bg-site-accent px-4 py-1.5 text-xs font-semibold text-(--site-accent-fg) disabled:opacity-50">
                  {busy === ride.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Car className="h-3.5 w-3.5" />}
                  Accept
                </button>
              </RideCard>
            ))}
          </ul>
        )}
      </section>
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
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-site-border bg-site-surface/40 p-4 ${busy ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-site-text">{rideClassName(ride.rideClass)}</span>
        {showRider && (
          <span className="text-xs text-site-text-muted">for {ride.rider.name ?? 'a rider'}</span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-xs text-site-text-muted">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate" title={ride.pickupLabel}>{ride.pickupLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-site-accent" />
          <span className="truncate" title={ride.dropoffLabel}>{ride.dropoffLabel}</span>
        </div>
      </div>
      {ride.notes && (
        <p className="mt-2 rounded-lg bg-site-surface px-3 py-2 text-xs text-site-text-muted">“{ride.notes}”</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-3 text-xs text-site-text-dim">
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
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </motion.li>
  );
}
