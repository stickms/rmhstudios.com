'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CARD_MAX_PRICE, CARD_MIN_PRICE, marketFee } from '@/lib/cards/market-rules';
import { marketErrorText } from './market-errors';

/** Sell one card: ask for a price, show what the seller keeps after the burned fee, list it. */
export function SellCard({
  gameId,
  cardIndex,
  foil,
}: {
  gameId: string;
  cardIndex: number;
  foil: boolean;
}) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(price);
  const valid = Number.isInteger(n) && n >= CARD_MIN_PRICE && n <= CARD_MAX_PRICE;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/market/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId, cardIndex, foil, priceCoins: n }),
      });
      if (res.ok) {
        toast.success(t('steam-market-listed', { defaultValue: 'Listed on the Community Market.' }));
        setOpen(false);
        setPrice('');
        await router.invalidate();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(marketErrorText(body.error, t));
      }
    } catch {
      toast.error(marketErrorText(undefined, t));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="stm-btn stm-sell-open" onClick={() => setOpen(true)}>
        {t('steam-market-sell', { defaultValue: 'Sell' })}
      </button>
    );
  }
  return (
    <form className="stm-sell" onSubmit={(e) => void submit(e)}>
      <label>
        <span className="stm-sr">{t('steam-market-ask', { defaultValue: 'Asking price in coins' })}</span>
        <input
          className="stm-input"
          type="number"
          inputMode="numeric"
          min={CARD_MIN_PRICE}
          max={CARD_MAX_PRICE}
          step={1}
          autoFocus
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t('steam-market-ask-ph', { defaultValue: 'Price' })}
        />
      </label>
      <span className="stm-muted stm-sell-note">
        {valid
          ? t('steam-market-receive', {
              defaultValue: 'You receive {{n}} coins',
              n: marketFee(n).proceeds,
            })
          : t('steam-market-range', {
              defaultValue: '{{min}} to {{max}} coins',
              min: CARD_MIN_PRICE,
              max: CARD_MAX_PRICE,
            })}
      </span>
      <span className="stm-sell-actions">
        <button type="submit" className="stm-btn stm-btn-blue" disabled={!valid || busy}>
          {t('steam-market-list', { defaultValue: 'List' })}
        </button>
        <button type="button" className="stm-btn" onClick={() => setOpen(false)}>
          {t('steam-market-cancel', { defaultValue: 'Cancel' })}
        </button>
      </span>
    </form>
  );
}
