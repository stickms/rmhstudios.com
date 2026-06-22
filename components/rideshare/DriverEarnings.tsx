'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet, Car, Star, TrendingUp, Gift } from 'lucide-react';
import { formatUsd, formatDistance } from '@/lib/rideshare/geo';
import { rideClassName } from '@/lib/rideshare/classes';

interface RecentTrip {
  id: string;
  rideClass: string;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  estimatedFareCents: number;
  completedAt: string | null;
  ratingByRider: number | null;
}
interface Earnings {
  totalTrips: number;
  totalDistanceMeters: number;
  grossWaivedCents: number;
  weekTrips: number;
  weekWaivedCents: number;
  earningsCents: number;
  ratingCount: number;
  ratingAvg: number | null;
  recent: RecentTrip[];
}

export function DriverEarnings() {
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rideshare/earnings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-site-border bg-site-surface/40 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-site-text-muted" />
      </div>
    );
  }
  if (!data) return null;

  const stats = [
    { icon: Car, label: 'Trips completed', value: String(data.totalTrips), sub: `${data.weekTrips} this week` },
    { icon: TrendingUp, label: 'Distance driven', value: formatDistance(data.totalDistanceMeters), sub: 'all time' },
    {
      icon: Star,
      label: 'Your rating',
      value: data.ratingAvg != null ? data.ratingAvg.toFixed(1) : '—',
      sub: `${data.ratingCount} rating${data.ratingCount === 1 ? '' : 's'}`,
    },
    { icon: Gift, label: 'Value delivered', value: formatUsd(data.grossWaivedCents), sub: 'fares waived for riders' },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-site-text">Earnings</h2>

      {/* Earnings headline (free for now) */}
      <div className="flex items-center justify-between rounded-2xl border border-site-border bg-gradient-to-r from-site-surface to-site-bg p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-site-accent/15 text-site-accent">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-site-text">{formatUsd(data.earningsCents)}</div>
            <div className="text-xs text-site-text-muted">Total earnings</div>
          </div>
        </div>
        <p className="max-w-[14rem] text-right text-xs text-site-text-muted">
          Rides are free during preview — driver payouts begin when fares go live.
        </p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-site-border bg-site-surface/40 p-4">
            <s.icon className="h-4 w-4 text-site-accent" />
            <div className="mt-2 text-lg font-bold text-site-text">{s.value}</div>
            <div className="text-xs text-site-text-muted">{s.label}</div>
            <div className="text-[11px] text-site-text-dim">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent trips */}
      {data.recent.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-site-text">Recent trips</h3>
          <ul className="space-y-2">
            {data.recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-site-border bg-site-surface/40 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-site-text">
                    {rideClassName(t.rideClass)}
                    {t.ratingByRider != null && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" /> {t.ratingByRider}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-site-text-muted" title={`${t.pickupLabel} → ${t.dropoffLabel}`}>
                    {t.pickupLabel} → {t.dropoffLabel}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-emerald-400">Free</div>
                  <div className="text-[11px] text-site-text-dim line-through">{formatUsd(t.estimatedFareCents)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
