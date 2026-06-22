/**
 * Admin — RMH Rideshare driver applications (/admin/rideshare)
 *
 * Review pending driver applications (vehicle details + self-reported licence
 * number) and approve or reject.
 */
import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, ArrowLeft, ShieldCheck, Car, Check, X, MapPin, Search, Route as RouteIcon } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { rideClassName } from '@/lib/rideshare/classes';
import { formatDistance, formatUsd } from '@/lib/rideshare/geo';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/rideshare')({
  head: () => ({ meta: [{ title: 'Rideshare Applications | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminRidesharePage,
});

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
const TABS: Status[] = ['PENDING', 'APPROVED', 'REJECTED'];

interface Application {
  id: string;
  status: Status;
  user: { id: string; name: string | null; handle: string | null; image: string | null; email: string | null };
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  licensePlate: string;
  vehicleClass: string;
  seats: number;
  licenseNumber: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

type View = 'applications' | 'rides';

type RideStatus = 'SCHEDULED' | 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
const RIDE_STATUS_FILTERS: ('ALL' | RideStatus)[] = [
  'ALL', 'REQUESTED', 'SCHEDULED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
];
const RIDE_STATUS_META: Record<RideStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Scheduled', className: 'text-sky-400 bg-sky-400/10' },
  REQUESTED: { label: 'Awaiting driver', className: 'text-amber-400 bg-amber-400/10' },
  ACCEPTED: { label: 'Accepted', className: 'text-sky-400 bg-sky-400/10' },
  IN_PROGRESS: { label: 'In progress', className: 'text-site-accent bg-site-accent/10' },
  COMPLETED: { label: 'Completed', className: 'text-emerald-400 bg-emerald-400/10' },
  CANCELLED: { label: 'Cancelled', className: 'text-site-text-muted bg-site-surface-hover' },
};

interface RidePerson {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  email?: string | null;
}
interface AdminRide {
  id: string;
  rideClass: string;
  status: RideStatus;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  estimatedFareCents: number | null;
  scheduledFor: string | null;
  requestedAt: string;
  rider: RidePerson | null;
  driver: RidePerson | null;
}

function AdminRidesharePage() {
  const [view, setView] = useState<View>('applications');
  const [status, setStatus] = useState<Status>('PENDING');
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/rideshare/applications?status=${status}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (view === 'applications') load();
  }, [load, view]);

  // Ride history
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [rideStatus, setRideStatus] = useState<'ALL' | RideStatus>('ALL');
  const [query, setQuery] = useState('');

  const loadRides = useCallback(async () => {
    setRidesLoading(true);
    try {
      const params = new URLSearchParams();
      if (rideStatus !== 'ALL') params.set('status', rideStatus);
      if (query.trim()) params.set('q', query.trim());
      const res = await fetch(`/api/admin/rideshare/rides?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRides(data.rides ?? []);
      }
    } finally {
      setRidesLoading(false);
    }
  }, [rideStatus, query]);

  useEffect(() => {
    if (view !== 'rides') return;
    const t = setTimeout(loadRides, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [view, loadRides, query]);

  async function decide(id: string, action: 'approve' | 'reject', rejectionReason?: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/rideshare/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, rejectionReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Action failed.');
        return;
      }
      toast.success(action === 'approve' ? 'Driver approved.' : 'Application rejected.');
      setRejecting(null);
      setReason('');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageLayout title="Rideshare Applications" wide>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-8">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-site-text-muted hover:text-site-text">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-site-accent" />
            <h1 className="text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
              Driver Applications
            </h1>
          </div>
          <p className="mt-1 text-site-text-muted">
            Review and verify community drivers, and browse every ride placed across the community.
          </p>
        </div>

        {/* View switcher */}
        <div className="flex gap-1 rounded-xl border border-site-border bg-site-surface/80 p-1">
          {([['applications', 'Driver applications'], ['rides', 'Ride history']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === v ? 'bg-site-accent text-(--site-accent-fg)' : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'rides' ? (
          <RideHistory
            rides={rides}
            loading={ridesLoading}
            status={rideStatus}
            onStatus={setRideStatus}
            query={query}
            onQuery={setQuery}
          />
        ) : (
        <>
        <div className="flex gap-1 rounded-xl border border-site-border bg-site-surface/80 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                status === t ? 'bg-site-accent text-(--site-accent-fg)' : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              {t.toLowerCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-site-text-muted" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-site-border px-4 py-16 text-center text-site-text-muted">
            No {status.toLowerCase()} applications.
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((app) => (
              <li key={app.id} className="rounded-2xl border border-site-border bg-site-surface/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar src={app.user.image} alt={app.user.name ?? 'User'} size={40} />
                    <div>
                      <p className="font-semibold text-site-text">{app.user.name ?? 'Unknown'}</p>
                      <p className="text-xs text-site-text-muted">
                        {app.user.handle ? `@${app.user.handle}` : app.user.email ?? app.user.id}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-site-text-dim">
                    {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true })}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Vehicle */}
                  <div className="rounded-xl border border-site-border bg-site-surface p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-site-text">
                      <Car className="h-4 w-4 text-site-accent" /> Vehicle
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      <Row label="Vehicle" value={`${app.vehicleColor} ${app.vehicleMake} ${app.vehicleModel}`} />
                      <Row label="Year" value={String(app.vehicleYear)} />
                      <Row label="Plate" value={app.licensePlate} />
                      <Row label="Class" value={rideClassName(app.vehicleClass)} />
                      <Row label="Seats" value={String(app.seats)} />
                    </dl>
                  </div>

                  {/* License */}
                  <div className="rounded-xl border border-site-border bg-site-surface p-4">
                    <div className="mb-2 text-sm font-semibold text-site-text">Driver’s license</div>
                    <dl className="space-y-1.5">
                      <Row label="License #" value={app.licenseNumber || '—'} />
                    </dl>
                  </div>
                </div>

                {app.status === 'REJECTED' && app.rejectionReason && (
                  <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    Reason: {app.rejectionReason}
                  </p>
                )}

                {app.status === 'PENDING' && (
                  <div className="mt-4">
                    {rejecting === app.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Reason for rejection (shared with the applicant)"
                          className="w-full resize-none rounded-lg border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent/60"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => decide(app.id, 'reject', reason.trim() || undefined)}
                            disabled={busy === app.id}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            Confirm reject
                          </button>
                          <button
                            onClick={() => { setRejecting(null); setReason(''); }}
                            className="rounded-lg border border-site-border px-4 py-1.5 text-sm text-site-text-muted hover:text-site-text"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(app.id, 'approve')}
                          disabled={busy === app.id}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Approve
                        </button>
                        <button
                          onClick={() => setRejecting(app.id)}
                          disabled={busy === app.id}
                          className="flex items-center gap-1.5 rounded-lg border border-site-border px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        </>
        )}
      </div>
    </PageLayout>
  );
}

function RideHistory({
  rides,
  loading,
  status,
  onStatus,
  query,
  onQuery,
}: {
  rides: AdminRide[];
  loading: boolean;
  status: 'ALL' | RideStatus;
  onStatus: (s: 'ALL' | RideStatus) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-muted" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search rider, driver, or address…"
          className="w-full rounded-xl border border-site-border bg-site-surface/80 py-2.5 pl-9 pr-3 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60"
        />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {RIDE_STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => onStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              status === s
                ? 'bg-site-accent text-(--site-accent-fg)'
                : 'border border-site-border bg-site-surface/80 text-site-text-muted hover:text-site-text'
            }`}
          >
            {s === 'ALL' ? 'All' : RIDE_STATUS_META[s].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-site-text-muted" /></div>
      ) : rides.length === 0 ? (
        <p className="rounded-xl border border-dashed border-site-border px-4 py-16 text-center text-site-text-muted">
          No rides found.
        </p>
      ) : (
        <ul className="space-y-3">
          {rides.map((ride) => {
            const meta = RIDE_STATUS_META[ride.status];
            return (
              <li key={ride.id} className="rounded-2xl border border-site-border bg-site-surface/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar src={ride.rider?.image ?? null} alt={ride.rider?.name ?? 'Rider'} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-site-text">{ride.rider?.name ?? 'Unknown rider'}</p>
                      <p className="text-xs text-site-text-muted">
                        {ride.rider?.handle ? `@${ride.rider.handle}` : ride.rider?.email ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-site-text-muted">{rideClassName(ride.rideClass)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-site-text-muted">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate" title={ride.pickupLabel}>{ride.pickupLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0 text-site-accent" />
                    <span className="truncate" title={ride.dropoffLabel}>{ride.dropoffLabel}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-site-border pt-3 text-xs text-site-text-dim">
                  {ride.distanceMeters != null && (
                    <span className="flex items-center gap-1">
                      <RouteIcon className="h-3 w-3" /> {formatDistance(ride.distanceMeters)}
                    </span>
                  )}
                  {ride.estimatedFareCents != null && (
                    <span>{formatUsd(ride.estimatedFareCents)} est.</span>
                  )}
                  <span>
                    {ride.driver ? `Driver: ${ride.driver.name ?? 'Unknown'}` : 'No driver matched'}
                  </span>
                  <span className="ml-auto">
                    {formatDistanceToNow(new Date(ride.scheduledFor ?? ride.requestedAt), { addSuffix: true })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-site-text-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-site-text" title={value}>{value}</dd>
    </div>
  );
}
