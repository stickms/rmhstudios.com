import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { sellPredictionApi } from '@/lib/predictions/predictions.contract';
import { quoteSale } from '@/lib/predictions/quote';
import type { Market } from './types';

type Side = 'YES' | 'NO';

interface Props {
  market: Market;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setCoins: (coins: number) => void;
  onUpdated: (m: Market) => void;
}

/** A fresh idempotency key: 36 characters of `[A-Za-z0-9-]`, one per sale the member intends. */
function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(8, '0');
  }
}

/** Sell shares back before the market resolves: how many, what they return now, one ink primary. */
export function SellDialog({ market, open, onOpenChange, setCoins, onUpdated }: Props) {
  const { t } = useTranslation('prediction-trades');
  const refusalText = useRefusalText();
  const pos = market.position;
  const yesHeld = pos?.yesShares ?? 0;
  const noHeld = pos?.noShares ?? 0;
  const [side, setSide] = useState<Side>(yesHeld >= noHeld ? 'YES' : 'NO');
  const held = side === 'YES' ? yesHeld : noHeld;
  const [text, setText] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef<string>(newKey());

  const shares = text === null ? held : Number(text);
  const valid = Number.isFinite(shares) && shares > 0 && shares <= held + 1e-9;
  const quote = useMemo(
    () => (valid ? quoteSale(market, side, Math.min(shares, held)) : null),
    [valid, market, side, shares, held],
  );
  const sellable = quote !== null && quote.proceeds >= 1;

  async function sell() {
    if (!quote || !sellable || pending) return;
    setPending(true);
    try {
      const data = await api(sellPredictionApi, {
        params: { id: market.id },
        body: { side, shares: Math.min(shares, held), minProceeds: quote.minProceeds, key: key.current },
      });
      setCoins(data.newBalance);
      onUpdated(data.market as Market);
      key.current = newKey();
      // A replay is the earlier sale answering again (its shares are already gone, so it reports 0 sold).
      toast.success(
        data.replayed
          ? t('sold-already', {
              defaultValue: 'That sale already went through for {{coins}} coins',
              coins: data.proceeds,
            })
          : t('sold', {
              defaultValue: 'Sold {{shares}} {{side}} shares for {{coins}} coins',
              shares: Math.round(data.sharesSold * 100) / 100,
              side,
              coins: data.proceeds,
            }),
      );
      setText(null);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof HttpError) {
        toast.error(refusalText.maybe(e) ?? t('sell-failed', { defaultValue: 'The sale did not go through' }));
      } else {
        toast.error(t('network-error', { defaultValue: 'Network error' }));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sell-title', { defaultValue: 'Sell shares' })}</DialogTitle>
          <DialogDescription>
            {t('sell-description', {
              defaultValue: 'You get coins back at today’s price. Whole coins only, rounded down.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {yesHeld > 0.5 && noHeld > 0.5 && (
            <label className="flex flex-col gap-2 t-label">
              {t('sell-side', { defaultValue: 'Side' })}
              <Select
                value={side}
                onChange={(e) => {
                  setSide(e.target.value === 'NO' ? 'NO' : 'YES');
                  setText(null);
                }}
              >
                <option value="YES">{t('side-yes', { defaultValue: 'YES' })}</option>
                <option value="NO">{t('side-no', { defaultValue: 'NO' })}</option>
              </Select>
            </label>
          )}
          <label className="flex flex-col gap-2 t-label">
            {t('sell-shares', { defaultValue: 'Shares to sell' })}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={text ?? String(held)}
                onChange={(e) => setText(e.target.value)}
                className="tabular-nums"
              />
              <Button type="button" variant="default" onClick={() => setText(String(held))}>
                {t('sell-all', { defaultValue: 'All' })}
              </Button>
            </div>
          </label>
          <p className="t-meta" aria-live="polite">
            {quote
              ? t('sell-quote', {
                  defaultValue: '{{coins}} coins, average {{price}} each; YES would move to {{percent}}%',
                  coins: quote.proceeds,
                  price: quote.averagePrice.toFixed(2),
                  percent: quote.newYesPercent,
                })
              : t('sell-quote-empty', { defaultValue: 'Enter a number of shares you hold' })}
          </p>
          {quote && !sellable && (
            <p className="t-meta">
              {t('sell-too-small', { defaultValue: 'That is less than one coin. Sell more shares' })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
            {t('sell-cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="button" variant="primary" loading={pending} disabled={!sellable || pending} onClick={sell}>
            {t('sell-confirm', { defaultValue: 'Sell' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
