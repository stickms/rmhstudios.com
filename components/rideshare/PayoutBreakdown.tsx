'use client';

import { Wallet, Building2, ShieldCheck, Gift, CircleDollarSign } from 'lucide-react';
import { payoutBreakdown, formatUsd } from '@/lib/rideshare/geo';

interface PayoutBreakdownProps {
  fareCents: number | null | undefined;
  tipCents?: number | null;
  /** When the trip isn't finished yet, label the figures as an estimate. */
  estimate?: boolean;
}

/**
 * Driver-facing earnings breakdown: how a trip's fare (and any tip) splits into
 * the driver's take-home, RMH Studios' service fee, and the insurance fee.
 */
export function PayoutBreakdown({ fareCents, tipCents, estimate }: PayoutBreakdownProps) {
  const p = payoutBreakdown(fareCents, tipCents);

  const rows = [
    { icon: CircleDollarSign, label: 'Trip fare', value: p.fareCents, tone: 'text-site-text' },
    { icon: Building2, label: 'RMH Studios fee', value: -p.serviceFeeCents, tone: 'text-site-text-muted' },
    { icon: ShieldCheck, label: 'Insurance & safety', value: -p.insuranceCents, tone: 'text-site-text-muted' },
  ];
  if (p.tipCents > 0) {
    rows.push({ icon: Gift, label: 'Rider tip', value: p.tipCents, tone: 'text-emerald-400' });
  }

  return (
    <div className="rounded-site border border-site-border bg-site-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-site-text">
          {estimate ? 'Estimated pay' : 'Your earnings'}
        </h4>
        <span className="text-xs text-site-text-muted">
          {estimate ? 'Before tips' : p.tipCents > 0 ? 'Incl. tip' : 'No tip'}
        </span>
      </div>

      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="flex items-center gap-2 text-site-text-muted">
              <r.icon className="h-3.5 w-3.5" /> {r.label}
            </dt>
            <dd className={r.tone}>
              {r.value < 0 ? `−${formatUsd(-r.value)}` : formatUsd(r.value)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-site-border pt-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <span className="text-base font-bold text-site-text">
            {estimate ? 'You earn' : 'Take-home'}
          </span>
        </div>
        <div className="text-lg font-bold text-emerald-400">{formatUsd(p.driverEarningsCents)}</div>
      </div>
    </div>
  );
}
