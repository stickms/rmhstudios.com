'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Coins, Gift, Package, Banknote } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  COINS_PER_SUB_MONTH,
  MIN_PAYOUT_COINS,
  MIN_REDEMPTION_COINS,
} from '@/lib/creator/redemption-schema';

interface Earnings {
  lifetimeEarned: number;
  redeemed: number;
  redeemable: number;
  spendable: number;
}
interface RedemptionRow {
  id: string;
  kind: 'SUB_CREDIT' | 'MERCH' | 'PAYOUT';
  amountCoins: number;
  status: 'PENDING' | 'APPROVED' | 'FULFILLED' | 'REJECTED';
  tierGranted: string | null;
  monthsGranted: number | null;
  createdAt: string;
}

export function EarningsTab() {
  const { t } = useTranslation('c-creator');
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [requests, setRequests] = useState<RedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<'SUB_CREDIT' | 'MERCH' | 'PAYOUT'>('SUB_CREDIT');
  const [tier, setTier] = useState<'starter' | 'pro'>('starter');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(MIN_REDEMPTION_COINS);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/creator/redeem');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEarnings(data.earnings);
        setRequests(data.requests ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cost = kind === 'SUB_CREDIT' ? COINS_PER_SUB_MONTH[tier] * months : amount;

  const submit = async () => {
    setSubmitting(true);
    try {
      const body =
        kind === 'SUB_CREDIT'
          ? { kind, tier, months }
          : { kind, amountCoins: amount, note: note || undefined };
      const res = await fetch('/api/creator/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('redeem-failed', { defaultValue: 'Could not submit request' }));
        return;
      }
      toast.success(t('redeem-submitted', { defaultValue: 'Redemption requested — an admin will review it' }));
      setNote('');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (s: RedemptionRow['status']) => {
    if (s === 'FULFILLED') return <Badge variant="success">{t('fulfilled', { defaultValue: 'Fulfilled' })}</Badge>;
    if (s === 'APPROVED') return <Badge variant="accent">{t('approved', { defaultValue: 'Approved' })}</Badge>;
    if (s === 'REJECTED') return <Badge variant="danger">{t('rejected', { defaultValue: 'Declined' })}</Badge>;
    return <Badge variant="outline">{t('pending', { defaultValue: 'Pending' })}</Badge>;
  };

  const overMax = cost > (earnings?.redeemable ?? 0);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5 py-2">
      <div>
        <h2 className="text-lg font-semibold">{t('earnings', { defaultValue: 'Creator earnings' })}</h2>
        <p className="text-sm text-site-text-dim">
          {t('earnings-desc', {
            defaultValue:
              'Coins you earned from tips, memberships and sales can be redeemed for subscription credit, merch, or a payout.',
          })}
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4" pane>
          <div className="text-xs uppercase tracking-wide text-site-text-dim">
            {t('redeemable', { defaultValue: 'Redeemable' })}
          </div>
          <div className="text-2xl font-bold flex items-center gap-1.5 tabular-nums">
            <Coins className="size-5 text-yellow-500" />
            {loading ? '—' : earnings?.redeemable ?? 0}
          </div>
        </Card>
        <Card className="p-4" pane>
          <div className="text-xs uppercase tracking-wide text-site-text-dim">
            {t('lifetime', { defaultValue: 'Lifetime earned' })}
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? '—' : earnings?.lifetimeEarned ?? 0}
          </div>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1" pane>
          <div className="text-xs uppercase tracking-wide text-site-text-dim">
            {t('balance', { defaultValue: 'Coin balance' })}
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? '—' : earnings?.spendable ?? 0}
          </div>
        </Card>
      </div>

      {/* Redeem form */}
      <Card className="p-4 space-y-4" pane>
        <h3 className="font-semibold">{t('redeem', { defaultValue: 'Redeem coins' })}</h3>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { k: 'SUB_CREDIT', label: t('sub-credit', { defaultValue: 'Sub credit' }), icon: Gift },
              { k: 'MERCH', label: t('merch', { defaultValue: 'Merch' }), icon: Package },
              { k: 'PAYOUT', label: t('payout', { defaultValue: 'Payout' }), icon: Banknote },
            ] as const
          ).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex flex-col items-center gap-1 rounded-site px-2 py-3 text-sm font-medium transition-colors ${
                kind === k
                  ? 'bg-site-accent-dim text-site-accent'
                  : 'glass-inset text-site-text-dim hover:text-site-text'
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {kind === 'SUB_CREDIT' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-tier">{t('tier', { defaultValue: 'Tier' })}</Label>
              <Select id="r-tier" value={tier} onChange={(e) => setTier(e.target.value as 'starter' | 'pro')}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-months">{t('months', { defaultValue: 'Months' })}</Label>
              <Input
                id="r-months"
                type="number"
                min={1}
                max={12}
                value={months}
                onChange={(e) => setMonths(Math.min(12, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
              />
            </div>
          </div>
        )}

        {kind !== 'SUB_CREDIT' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-amount">{t('amount', { defaultValue: 'Amount (coins)' })}</Label>
              <Input
                id="r-amount"
                type="number"
                min={kind === 'PAYOUT' ? MIN_PAYOUT_COINS : MIN_REDEMPTION_COINS}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-note">{t('note', { defaultValue: 'Details' })}</Label>
              <Input
                id="r-note"
                value={note}
                maxLength={500}
                placeholder={
                  kind === 'MERCH'
                    ? t('merch-ph', { defaultValue: 'What you’d like + size' })
                    : t('payout-ph', { defaultValue: 'Payout account reference' })
                }
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {kind === 'PAYOUT' && (
              <p className="text-xs text-site-text-dim">
                {t('payout-note', {
                  defaultValue:
                    'Payouts require a verified creator account and admin review (min {{n}} coins).',
                  n: MIN_PAYOUT_COINS,
                })}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="text-sm text-site-text-dim">
            {t('cost', { defaultValue: 'Cost' })}:{' '}
            <span className={`font-semibold ${overMax ? 'text-site-danger' : 'text-site-text'}`}>
              {cost} 🪙
            </span>
          </div>
          <Button onClick={submit} loading={submitting} disabled={overMax || cost < MIN_REDEMPTION_COINS}>
            {t('request', { defaultValue: 'Request redemption' })}
          </Button>
        </div>
        {overMax && (
          <p className="text-xs text-site-danger">
            {t('over-max', { defaultValue: 'That exceeds your redeemable earnings.' })}
          </p>
        )}
      </Card>

      {/* History */}
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-site-text-dim mb-2">
            {t('history', { defaultValue: 'Requests' })}
          </h3>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between glass-fill rounded-site px-3 py-2 text-sm">
                <span>
                  {r.kind === 'SUB_CREDIT'
                    ? t('sub-summary', {
                        defaultValue: '{{months}}mo {{tier}}',
                        months: r.monthsGranted ?? 1,
                        tier: r.tierGranted ?? '',
                      })
                    : r.kind === 'MERCH'
                      ? t('merch', { defaultValue: 'Merch' })
                      : t('payout', { defaultValue: 'Payout' })}
                  {' · '}
                  <span className="text-site-text-dim">{r.amountCoins} 🪙</span>
                </span>
                {statusBadge(r.status)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
