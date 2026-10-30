'use client';

import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cardName } from '@/lib/cards/cards';
import { CARD_MAX_PRICE, CARD_MIN_PRICE } from '@/lib/cards/market-rules';
import type { CardMarketData } from '@/lib/cards/market-types';
import { CardArt } from './CardArt';
import { CommunityNav } from './CommunityNav';
import { PriceChart } from './PriceChart';
import { SellCard } from './SellCard';
import { marketErrorText } from './market-errors';

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: { filled?: boolean } }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; filled?: boolean };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

/** One card on the market: price history, what is for sale, and the standing buy orders. */
export function CardMarketPage({ data }: { data: CardMarketData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [bid, setBid] = useState('');
  const name = cardName(data.gameId, data.cardIndex);
  const bidN = Number(bid);
  const bidOk = Number.isInteger(bidN) && bidN >= CARD_MIN_PRICE && bidN <= CARD_MAX_PRICE;

  async function act(id: string, path: string, body: unknown, done: (filled?: boolean) => string) {
    setBusy(id);
    const r = await post(path, body);
    setBusy(null);
    if (r.ok) {
      toast.success(done(r.data?.filled));
      setBid('');
      await router.invalidate();
    } else {
      toast.error(marketErrorText(r.error, t));
    }
  }

  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <p>
          <Link to="/games/market" className="stm-link">
            {t('steam-market-back', { defaultValue: 'Back to the Community Market' })}
          </Link>
        </p>
        <header className="stm-cardhead">
          <CardArt gameId={data.gameId} title={data.title} hue={data.hue} cardIndex={data.cardIndex} foil={data.foil} width={140} />
          <div>
            <h1 className="stm-web-title">
              {name}
              {data.foil ? ` (${t('steam-market-foil', { defaultValue: 'foil' })})` : ''}
            </h1>
            <p className="stm-muted">
              <Link to="/games/$gameId" params={{ gameId: data.gameId }} className="stm-link">
                {data.title}
              </Link>
            </p>
            {data.balance !== null ? (
              <p className="stm-balance">
                <Coins aria-hidden size={16} />
                {t('steam-market-balance', { defaultValue: '{{n}} coins', n: data.balance })}
              </p>
            ) : null}
            {data.summary ? (
              <dl className="stm-stats">
                <div>
                  <dt>{t('steam-price-median', { defaultValue: 'Median' })}</dt>
                  <dd>{data.summary.median}</dd>
                </div>
                <div>
                  <dt>{t('steam-price-low', { defaultValue: 'Low' })}</dt>
                  <dd>{data.summary.low}</dd>
                </div>
                <div>
                  <dt>{t('steam-price-high', { defaultValue: 'High' })}</dt>
                  <dd>{data.summary.high}</dd>
                </div>
                <div>
                  <dt>{t('steam-price-volume', { defaultValue: 'Sold (30 days)' })}</dt>
                  <dd>{data.summary.volume}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </header>

        <section className="stm-web-card" aria-labelledby="stm-cm-history">
          <h2 id="stm-cm-history" className="stm-web-head">
            {t('steam-price-history', { defaultValue: 'Price history' })}
          </h2>
          <PriceChart history={data.history} />
        </section>

        <div className="stm-cm-cols">
          <section className="stm-web-card" aria-labelledby="stm-cm-listings">
            <h2 id="stm-cm-listings" className="stm-web-head">
              {t('steam-market-for-sale', { defaultValue: 'For sale' })}
              <span className="stm-count">{data.listings.length}</span>
            </h2>
            {data.listings.length === 0 ? (
              <p className="stm-web-pad stm-muted">
                {t('steam-cm-no-listings', { defaultValue: 'Nobody is selling this card right now.' })}
              </p>
            ) : (
              <ul className="stm-market-list">
                {data.listings.map((l) => (
                  <li key={l.id} className="stm-market-row">
                    <span className="stm-market-price">
                      {t('steam-market-price', { defaultValue: '{{n}} coins', n: l.priceCoins })}
                    </span>
                    {l.mine ? (
                      <span className="stm-muted">{t('steam-cm-yours', { defaultValue: 'Yours' })}</span>
                    ) : data.signedIn ? (
                      <button
                        type="button"
                        className="stm-btn stm-btn-blue"
                        disabled={busy === l.id}
                        onClick={() =>
                          void act(l.id, '/api/games/market/buy', { listingId: l.id }, () =>
                            t('steam-market-bought', { defaultValue: 'Purchased. The card is in your inventory.' }),
                          )
                        }
                      >
                        {t('steam-market-buy', { defaultValue: 'Buy' })}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stm-web-card" aria-labelledby="stm-cm-orders">
            <h2 id="stm-cm-orders" className="stm-web-head">
              {t('steam-cm-orders', { defaultValue: 'Buy orders' })}
              <span className="stm-count">{data.orders.length}</span>
            </h2>
            {data.orders.length === 0 ? (
              <p className="stm-web-pad stm-muted">
                {t('steam-cm-no-orders', { defaultValue: 'No one is bidding.' })}
              </p>
            ) : (
              <ul className="stm-market-list">
                {data.orders.map((o, i) => (
                  <li key={`${o.priceCoins}-${i}`} className="stm-market-row">
                    <span className="stm-market-price">
                      {t('steam-cm-bid', { defaultValue: 'Up to {{n}} coins', n: o.priceCoins })}
                    </span>
                    {o.mine ? <span className="stm-muted">{t('steam-cm-yours', { defaultValue: 'Yours' })}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {data.signedIn ? (
              data.myOrder ? (
                <div className="stm-web-pad stm-order-mine">
                  <span>
                    {t('steam-cm-my-order', { defaultValue: 'Your order: up to {{n}} coins', n: data.myOrder.priceCoins })}
                  </span>
                  <button
                    type="button"
                    className="stm-btn"
                    disabled={busy === 'cancel'}
                    onClick={() =>
                      void act('cancel', '/api/games/market/order-cancel', { orderId: data.myOrder?.id }, () =>
                        t('steam-cm-order-canceled', { defaultValue: 'Buy order canceled.' }),
                      )
                    }
                  >
                    {t('steam-market-cancel', { defaultValue: 'Cancel' })}
                  </button>
                </div>
              ) : (
                <form
                  className="stm-hub-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!bidOk) return;
                    void act(
                      'order',
                      '/api/games/market/order',
                      { gameId: data.gameId, cardIndex: data.cardIndex, foil: data.foil, priceCoins: bidN },
                      (filled) =>
                        filled
                          ? t('steam-cm-order-filled', { defaultValue: 'Bought. The card is in your inventory.' })
                          : t('steam-cm-order-placed', { defaultValue: 'Buy order placed.' }),
                    );
                  }}
                >
                  <label>
                    <span className="stm-subhead">{t('steam-cm-your-bid', { defaultValue: 'Your highest price' })}</span>
                    <input
                      className="stm-input"
                      type="number"
                      inputMode="numeric"
                      min={CARD_MIN_PRICE}
                      max={CARD_MAX_PRICE}
                      step={1}
                      value={bid}
                      onChange={(e) => setBid(e.target.value)}
                    />
                  </label>
                  <p className="stm-muted stm-sell-note">
                    {t('steam-cm-order-note', {
                      defaultValue: 'No coins are held. It buys at the seller’s price when one is at or below yours, if you can pay.',
                    })}
                  </p>
                  <div className="stm-write-actions">
                    <button type="submit" className="stm-btn stm-btn-blue" disabled={!bidOk || busy === 'order'}>
                      {t('steam-cm-place-order', { defaultValue: 'Place buy order' })}
                    </button>
                  </div>
                </form>
              )
            ) : null}
          </section>
        </div>

        {data.held > 0 ? (
          <section className="stm-web-card" aria-labelledby="stm-cm-sell">
            <h2 id="stm-cm-sell" className="stm-web-head">
              {t('steam-cm-sell', { defaultValue: 'You hold {{n}}', n: data.held })}
            </h2>
            <div className="stm-web-pad stm-cm-sell">
              <SellCard gameId={data.gameId} cardIndex={data.cardIndex} foil={data.foil} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
