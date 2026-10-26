'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Zap, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import type { Market } from './types';
import { LIFT_CARD } from '@/components/feed/motionHelpers';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { MarketExtras } from '@/components/forecasting/MarketExtras';

interface Props {
  market: Market;
  coins: number;
  setCoins: (coins: number) => void;
  onUpdated: (m: Market) => void;
  /** Signed-out visitors can read a market but not trade it. */
  signedIn: boolean;
}

const QUICK_AMOUNTS = [5, 10, 25, 50];

export function PredictionCard({ market, coins, setCoins, onUpdated, signedIn }: Props) {
  const promptSignIn = useSignInPrompt();
  const { t } = useTranslation('c-predictions');
  const [amount, setAmount] = useState(10);
  const [pending, setPending] = useState<'YES' | 'NO' | null>(null);

  const yes = market.yesPercent;
  const no = 100 - yes;
  const resolved = market.status === 'RESOLVED_YES' || market.status === 'RESOLVED_NO';
  const closed = !!market.closesAt && new Date(market.closesAt).getTime() <= Date.now();
  const tradable = market.status === 'OPEN' && !closed;

  async function trade(side: 'YES' | 'NO') {
    if (pending) return;
    // Ask before the balance check: a signed-out visitor has no balance, so the
    // amount test below would tell them they were short of coins rather than
    // that they need an account.
    if (!signedIn) {
      promptSignIn(t('trade-sign-in', { defaultValue: 'Sign in to back a prediction.' }));
      return;
    }
    if (amount < 1) {
      toast.error(t('enter-amount', { defaultValue: 'Enter an amount first' }));
      return;
    }
    if (amount > coins) {
      toast.error(t('not-enough', { defaultValue: 'Not enough coins' }));
      return;
    }
    setPending(side);
    try {
      const res = await fetch(`/api/predictions/${market.id}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('trade-failed', { defaultValue: 'Trade failed' }));
        return;
      }
      setCoins(data.newBalance);
      onUpdated(data.market as Market);
      toast.success(
        t('bought', {
          defaultValue: 'Bought {{shares}} {{side}} shares',
          shares: Math.round(data.sharesBought),
          side,
        }),
      );
    } catch {
      toast.error(t('network-error', { defaultValue: 'Network error' }));
    } finally {
      setPending(null);
    }
  }

  const pos = market.position;
  const hasPos = pos && (pos.yesShares > 0.5 || pos.noShares > 0.5);

  return (
    <div className={`rounded-site glass-fill p-5 flex flex-col gap-3 ${LIFT_CARD}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-site-text leading-snug">{market.title}</h3>
            {market.isAiGenerated && (
              <span
                title={t('ai-seeded', { defaultValue: 'AI-seeded market' })}
                role="img"
                aria-label={t('ai-seeded', { defaultValue: 'AI-seeded market' })}
              >
                <Sparkles className="size-3.5 shrink-0 text-site-accent" aria-hidden />
              </span>
            )}
            {market.isAuto && (
              <span
                className="inline-flex items-center gap-2 rounded-full bg-site-accent-dim px-2 py-0.5 text-xs font-semibold text-site-accent shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]"
                title={t('auto-market-hint', {
                  defaultValue: 'Settles automatically from RMH data — no admin or AI judge',
                })}
              >
                <Zap className="size-3" aria-hidden />
                {t('auto-market', { defaultValue: 'Auto' })}
              </span>
            )}
          </div>
          {market.description && (
            <p className="mt-2 text-sm text-site-text-dim line-clamp-3">{market.description}</p>
          )}
          {market.subjectUrl && (
            <a
              href={market.subjectUrl}
              className="mt-2 inline-flex items-center gap-2 text-xs text-site-accent hover:underline"
            >
              {t('view-subject', { defaultValue: 'View the subject' })}
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          )}
        </div>
        {/* Big probability */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-site-success tabular-nums">{yes}%</div>
          <div className="text-xs text-site-text-dim">
            {t('chance-yes', { defaultValue: 'chance' })}
          </div>
        </div>
      </div>

      {/* Probability bar */}
      <div className="h-2 rounded-full overflow-hidden bg-site-danger/30 flex">
        <div className="bg-site-success/70" style={{ width: `${yes}%` }} />
      </div>

      {/* Resolved / closed state, or trade controls */}
      {resolved ? (
        <div className="text-sm font-semibold">
          {market.status === 'RESOLVED_YES' ? (
            <span className="text-site-success">{t('resolved-yes', { defaultValue: 'Resolved: YES' })}</span>
          ) : (
            <span className="text-site-danger">{t('resolved-no', { defaultValue: 'Resolved: NO' })}</span>
          )}
        </div>
      ) : !tradable ? (
        <div className="text-sm text-site-text-dim">
          {t('trading-closed', { defaultValue: 'Trading closed — awaiting resolution.' })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <Button
                key={a}
                type="button"
                size="xs"
                variant={amount === a ? 'accent-outline' : 'outline'}
                aria-pressed={amount === a}
                onClick={() => setAmount(a)}
              >
                {a}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <CoinIcon className="size-4" />
              <Input
                type="number"
                min={1}
                value={amount}
                aria-label={t('amount', { defaultValue: 'Amount in coins' })}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-24 text-right tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => trade('YES')}
              loading={pending === 'YES'}
              disabled={!!pending}
              className="border-site-success/40 bg-site-success/15 text-site-success hover:bg-site-success/25"
            >
              {`${t('buy-yes', { defaultValue: 'Buy YES' })} · ${yes}%`}
            </Button>
            <Button
              variant="outline"
              onClick={() => trade('NO')}
              loading={pending === 'NO'}
              disabled={!!pending}
              className="border-site-danger/40 bg-site-danger/15 text-site-danger hover:bg-site-danger/25"
            >
              {`${t('buy-no', { defaultValue: 'Buy NO' })} · ${no}%`}
            </Button>
          </div>
        </div>
      )}

      {/* Footer: volume + your position */}
      <div className="flex items-center justify-between text-xs text-site-text-dim">
        <span className="flex items-center gap-2">
          <CoinIcon className="size-3" />
          {t('volume', { defaultValue: '{{n}} vol', n: market.volume })}
        </span>
        {hasPos && (
          <span className="tabular-nums">
            {t('your-position', {
              defaultValue: 'You: {{yes}} YES / {{no}} NO',
              yes: Math.round(pos!.yesShares),
              no: Math.round(pos!.noShares),
            })}
          </span>
        )}
      </div>
      <MarketExtras
        marketId={market.id}
        signedIn={signedIn}
        held={!hasPos ? null : pos!.yesShares >= pos!.noShares ? 'YES' : 'NO'}
      />
    </div>
  );
}
