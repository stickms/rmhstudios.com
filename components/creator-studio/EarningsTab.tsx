import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Coins, Gift, Package, Banknote } from 'lucide-react';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { creatorRedemptionsQuery } from '@/lib/creator/earnings.queries';
import { requestRedemptionApi, type RedemptionRow } from '@/lib/creator/earnings.contract';
import { Card } from '@/components/ui/card';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  COINS_PER_SUB_MONTH,
  MIN_PAYOUT_COINS,
  MIN_REDEMPTION_COINS,
} from '@/lib/creator/redemption';

export function EarningsTab() {
  const { t } = useTranslation('c-creator');
  const { data, isPending: loading, refetch } = useQuery(creatorRedemptionsQuery());
  const earnings = data?.earnings ?? null;
  const requests: RedemptionRow[] = data?.requests ?? [];
  // The figures replace their dash placeholders, and the history lands below the form.
  const arrival = useArrival(!loading);
  const [kind, setKind] = useState<'SUB_CREDIT' | 'MERCH' | 'PAYOUT'>('SUB_CREDIT');
  const [tier, setTier] = useState<'starter' | 'pro'>('starter');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(MIN_REDEMPTION_COINS);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cost = kind === 'SUB_CREDIT' ? COINS_PER_SUB_MONTH[tier] * months : amount;

  const submit = async () => {
    setSubmitting(true);
    try {
      const body =
        kind === 'SUB_CREDIT'
          ? { kind, tier, months }
          : { kind, amountCoins: amount, note: note || undefined };
      await api(requestRedemptionApi, { body });
      toast.success(
        t('redeem-submitted', { defaultValue: 'Redemption requested — an admin will review it' }),
      );
      setNote('');
      await refetch();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('redeem-failed', { defaultValue: 'Could not submit request' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (s: RedemptionRow['status']) => {
    if (s === 'FULFILLED')
      return <Badge variant="success">{t('fulfilled', { defaultValue: 'Fulfilled' })}</Badge>;
    if (s === 'APPROVED')
      return <Badge variant="default">{t('approved', { defaultValue: 'Approved' })}</Badge>;
    if (s === 'REJECTED')
      return <Badge variant="danger">{t('rejected', { defaultValue: 'Declined' })}</Badge>;
    return <Badge variant="default">{t('pending', { defaultValue: 'Pending' })}</Badge>;
  };

  const overMax = cost > (earnings?.redeemable ?? 0);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-[var(--site-section-gap)]">
      <div>
        <h2 className="text-lg font-medium text-site-text">
          {t('earnings', { defaultValue: 'Creator earnings' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('earnings-desc', {
            defaultValue:
              'Coins you earned from tips, memberships and sales can be redeemed for subscription credit, merch, or a payout.',
          })}
        </p>
      </div>

      {/* Stat tiles — L1 fills: repeated content takes no backdrop blur (design-language §5). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs font-medium text-site-text-muted">
            {t('redeemable', { defaultValue: 'Redeemable' })}
          </div>
          <div
            className={cn('flex items-center gap-2 text-2xl font-semibold tabular-nums', arrival)}
          >
            <Coins className="size-5 text-site-warning" />
            {loading ? '—' : (earnings?.redeemable ?? 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-site-text-muted">
            {t('lifetime', { defaultValue: 'Lifetime earned' })}
          </div>
          <div className={cn('text-2xl font-semibold tabular-nums', arrival)}>
            {loading ? '—' : (earnings?.lifetimeEarned ?? 0)}
          </div>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <div className="text-xs font-medium text-site-text-muted">
            {t('balance', { defaultValue: 'Coin balance' })}
          </div>
          <div className={cn('text-2xl font-semibold tabular-nums', arrival)}>
            {loading ? '—' : (earnings?.spendable ?? 0)}
          </div>
        </Card>
      </div>

      {/* Redeem form */}
      <Card className="p-4 space-y-4" pane>
        <h3 className="site-section-label">{t('redeem', { defaultValue: 'Redeem coins' })}</h3>

        <Tabs
          tabs={[
            {
              id: 'SUB_CREDIT',
              label: t('sub-credit', { defaultValue: 'Sub credit' }),
              icon: Gift,
            },
            { id: 'MERCH', label: t('merch', { defaultValue: 'Merch' }), icon: Package },
            { id: 'PAYOUT', label: t('payout', { defaultValue: 'Payout' }), icon: Banknote },
          ]}
          value={kind}
          onChange={(id) => setKind(id as typeof kind)}
          idBase="redeem"
          aria-label={t('redeem', { defaultValue: 'Redeem coins' })}
        />

        <div
          role="tabpanel"
          id={`redeem-panel-${kind}`}
          aria-labelledby={`redeem-tab-${kind}`}
          className="space-y-4"
        >
          {kind === 'SUB_CREDIT' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="r-tier">{t('tier', { defaultValue: 'Tier' })}</Label>
                <Select
                  id="r-tier"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as 'starter' | 'pro')}
                >
                  <option value="starter">HARD-R</option>
                  <option value="pro">Pro</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-months">{t('months', { defaultValue: 'Months' })}</Label>
                <Input
                  id="r-months"
                  type="number"
                  min={1}
                  max={12}
                  value={months}
                  onChange={(e) =>
                    setMonths(Math.min(12, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                  }
                />
              </div>
            </div>
          )}

          {kind !== 'SUB_CREDIT' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="r-amount">{t('amount', { defaultValue: 'Amount (coins)' })}</Label>
                <Input
                  id="r-amount"
                  type="number"
                  min={kind === 'PAYOUT' ? MIN_PAYOUT_COINS : MIN_REDEMPTION_COINS}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </div>
              <div className="space-y-2">
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
                <p className="text-xs font-medium text-site-text-muted">
                  {t('payout-note', {
                    defaultValue:
                      'Payouts require a verified creator account and admin review (min {{n}} coins).',
                    n: MIN_PAYOUT_COINS,
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-sm text-site-text-muted">
            {t('cost', { defaultValue: 'Cost' })}:{' '}
            <span
              className={`inline-flex items-center gap-1 font-semibold ${overMax ? 'text-site-danger' : 'text-site-text'}`}
            >
              {cost}
              <Coins className="size-3.5 text-site-warning" aria-hidden />
            </span>
          </div>
          <Button
            onClick={submit}
            loading={submitting}
            disabled={overMax || cost < MIN_REDEMPTION_COINS}
          >
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
        <div className={arrival}>
          <h3 className="site-section-label mb-3">{t('history', { defaultValue: 'Requests' })}</h3>
          <div className="space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-site px-4 py-3 text-sm"
              >
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
                  <span className="inline-flex items-center gap-1 text-site-text-muted">
                    {r.amountCoins}
                    <Coins className="size-3.5 text-site-warning" aria-hidden />
                  </span>
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
