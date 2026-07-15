'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, Zap, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import type { Market } from './types';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

interface Props {
  market: Market;
  coins: number;
  setCoins: (coins: number) => void;
  onUpdated: (m: Market) => void;
}

const QUICK_AMOUNTS = [5, 10, 25, 50];

export function PredictionCard({ market, coins, setCoins, onUpdated }: Props) {
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
    <div className={`rounded-site border border-site-border bg-site-surface p-4 flex flex-col gap-3 ${LIFT_CARD}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-site-text leading-snug">{market.title}</h3>
            {market.isAiGenerated && (
              <span title={t('ai-seeded', { defaultValue: 'AI-seeded market' })}>
                <Sparkles className="w-3.5 h-3.5 text-site-accent shrink-0" />
              </span>
            )}
            {market.isAuto && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-site-accent-dim px-2 py-0.5 text-[10px] font-semibold text-site-accent shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]"
                title={t('auto-market-hint', {
                  defaultValue: 'Settles automatically from RMH data — no admin or AI judge',
                })}
              >
                <Zap className="w-3 h-3" aria-hidden />
                {t('auto-market', { defaultValue: 'Auto' })}
              </span>
            )}
          </div>
          {market.description && (
            <p className="text-sm text-site-text-dim mt-1 line-clamp-3">{market.description}</p>
          )}
          {market.subjectUrl && (
            <a
              href={market.subjectUrl}
              className="inline-flex items-center gap-0.5 text-xs text-site-accent hover:underline mt-1"
            >
              {t('view-subject', { defaultValue: 'View the subject' })}
              <ArrowUpRight className="w-3 h-3" aria-hidden />
            </a>
          )}
        </div>
        {/* Big probability */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-site-success tabular-nums">{yes}%</div>
          <div className="text-[11px] uppercase tracking-wide text-site-text-dim">
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
          <div className="flex items-center gap-1.5">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className={`px-2 py-1 rounded-site-sm text-xs font-medium border transition-colors ${
                  amount === a
                    ? 'border-site-accent text-site-accent bg-site-accent-dim'
                    : 'border-site-border text-site-text-dim hover:text-site-text'
                }`}
              >
                {a}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <CoinIcon className="w-4 h-4" />
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-20 bg-site-bg border border-site-border rounded-site-sm px-2 py-1 text-sm text-site-text text-right tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => trade('YES')}
              disabled={!!pending}
              className="flex items-center justify-center gap-1.5 py-2 rounded-site-sm font-semibold text-sm bg-site-success/15 text-site-success border border-site-success/40 hover:bg-site-success/25 transition-colors disabled:opacity-50"
            >
              {pending === 'YES' ? <Loader2 className="w-4 h-4 animate-spin" /> : `${t('buy-yes', { defaultValue: 'Buy YES' })} · ${yes}%`}
            </button>
            <button
              onClick={() => trade('NO')}
              disabled={!!pending}
              className="flex items-center justify-center gap-1.5 py-2 rounded-site-sm font-semibold text-sm bg-site-danger/15 text-site-danger border border-site-danger/40 hover:bg-site-danger/25 transition-colors disabled:opacity-50"
            >
              {pending === 'NO' ? <Loader2 className="w-4 h-4 animate-spin" /> : `${t('buy-no', { defaultValue: 'Buy NO' })} · ${no}%`}
            </button>
          </div>
        </div>
      )}

      {/* Footer: volume + your position */}
      <div className="flex items-center justify-between text-[11px] text-site-text-dim">
        <span className="flex items-center gap-1">
          <CoinIcon className="w-3 h-3" />
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
    </div>
  );
}
