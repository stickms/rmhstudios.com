'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet, Car, Star, TrendingUp, Gift, Building2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatUsd, formatDistance } from '@/lib/rideshare/geo';
import { rideClassName } from '@/lib/rideshare/classes';

interface RecentTrip {
  id: string;
  rideClass: string;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  estimatedFareCents: number;
  tipCents: number;
  driverEarningsCents: number;
  completedAt: string | null;
  ratingByRider: number | null;
}
interface Earnings {
  totalTrips: number;
  totalDistanceMeters: number;
  grossFaresCents: number;
  tipsCents: number;
  serviceFeeCents: number;
  insuranceCents: number;
  weekTrips: number;
  weekEarningsCents: number;
  earningsCents: number;
  ratingCount: number;
  ratingAvg: number | null;
  recent: RecentTrip[];
}

export function DriverEarnings() {
  const { t: tr } = useTranslation("c-rideshare");
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
      <div className="flex justify-center rounded-site border border-site-border bg-site-surface/80 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-site-text-muted" />
      </div>
    );
  }
  if (!data) return null;

  const stats = [
    { icon: Car, label: tr("trips-completed", { defaultValue: "Trips completed" }), value: String(data.totalTrips), sub: tr("n-this-week", { defaultValue: "{{count}} this week", count: data.weekTrips }) },
    { icon: TrendingUp, label: tr("distance-driven", { defaultValue: "Distance driven" }), value: formatDistance(data.totalDistanceMeters), sub: tr("all-time", { defaultValue: "all time" }) },
    {
      icon: Star,
      label: tr("your-rating", { defaultValue: "Your rating" }),
      value: data.ratingAvg != null ? data.ratingAvg.toFixed(1) : '—',
      sub: tr("n-ratings", { defaultValue: "{{count}} rating", count: data.ratingCount }) + (data.ratingCount === 1 ? '' : 's'),
    },
    { icon: Gift, label: tr("tips-earned", { defaultValue: "Tips earned" }), value: formatUsd(data.tipsCents), sub: tr("paid-out-in-full", { defaultValue: "paid out in full" }) },
  ];

  // How the riders' fares split into your take-home, RMH's fee and insurance.
  const breakdown = [
    { icon: Wallet, label: tr("trip-fares", { defaultValue: "Trip fares" }), value: data.grossFaresCents, tone: 'text-site-text' },
    { icon: Building2, label: tr("rmh-studios-fee", { defaultValue: "RMH Studios fee" }), value: -data.serviceFeeCents, tone: 'text-site-text-muted' },
    { icon: ShieldCheck, label: tr("insurance-safety", { defaultValue: "Insurance & safety" }), value: -data.insuranceCents, tone: 'text-site-text-muted' },
    { icon: Gift, label: tr("tips", { defaultValue: "Tips" }), value: data.tipsCents, tone: 'text-emerald-400' },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-site-text">{tr("earnings", { defaultValue: "Earnings" })}</h2>

      {/* Earnings headline */}
      <div className="flex items-center justify-between rounded-site border border-site-border bg-linear-to-r from-site-surface to-site-bg p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-site bg-emerald-500/15 text-emerald-400">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-site-text">{formatUsd(data.earningsCents)}</div>
            <div className="text-xs text-site-text-muted">{tr("total-take-home", { defaultValue: "Total take-home" })}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-site-text">{formatUsd(data.weekEarningsCents)}</div>
          <div className="text-xs text-site-text-muted">{tr("this-week", { defaultValue: "this week" })}</div>
        </div>
      </div>

      {/* Payout breakdown */}
      <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
        <h3 className="mb-3 text-sm font-semibold text-site-text">{tr("how-your-pay-adds-up", { defaultValue: "How your pay adds up" })}</h3>
        <dl className="space-y-2">
          {breakdown.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <dt className="flex items-center gap-2 text-site-text-muted">
                <r.icon className="h-3.5 w-3.5" /> {r.label}
              </dt>
              <dd className={r.tone}>{r.value < 0 ? `−${formatUsd(-r.value)}` : formatUsd(r.value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center justify-between border-t border-site-border pt-3">
          <span className="text-base font-bold text-site-text">{tr("take-home", { defaultValue: "Take-home" })}</span>
          <span className="text-lg font-bold text-emerald-400">{formatUsd(data.earningsCents)}</span>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-site border border-site-border bg-site-surface/80 p-4">
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
          <h3 className="mb-2 text-sm font-semibold text-site-text">{tr("recent-trips", { defaultValue: "Recent trips" })}</h3>
          <ul className="space-y-2">
            {data.recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-site border border-site-border bg-site-surface/80 p-3">
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
                  <div className="text-sm font-semibold text-emerald-400">{formatUsd(t.driverEarningsCents)}</div>
                  <div className="text-[11px] text-site-text-dim">
                    {tr("fare-amount", { defaultValue: "{{amount}} fare", amount: formatUsd(t.estimatedFareCents) })}{t.tipCents > 0 ? ' · ' + tr("tip-amount", { defaultValue: "+{{amount}} tip", amount: formatUsd(t.tipCents) }) : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
