'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { RARITY_COLORS } from '@/lib/shop/catalog';
import type { DailyShopView } from '@/lib/shop/daily-shop';
import { Swatch } from './ShopPage';
import { StoreNav } from './StoreNav';
import { timeUntil } from './store-view';

/** Today's featured items, drawn as Steam draws its daily deals. */
export function DailyPage({ data }: { data: DailyShopView }) {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const [items, setItems] = useState(data.items);
  const [coins, setCoins] = useState(data.coins);
  const [busy, setBusy] = useState<string | null>(null);
  const left = timeUntil(data.rotatesAt, new Date());

  const buy = async (id: string, name: string) => {
    setBusy(id);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: id }),
      });
      const body = (await res.json().catch(() => ({}))) as { newBalance?: number; error?: string };
      if (res.ok) {
        toast.success(t('steam-shop-bought', { defaultValue: 'Purchased {{name}}', name }));
        if (typeof body.newBalance === 'number') setCoins(body.newBalance);
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, owned: true } : i)));
      } else {
        toast.error(body.error ?? t('steam-shop-failed', { defaultValue: 'That purchase did not go through.' }));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stm-web">
      <StoreNav />
      <div className="stm-shop">
        <header className="stm-shop-head">
          <h1 className="stm-web-title">{t('steam-daily-title', { defaultValue: 'Daily deals' })}</h1>
          {data.signedIn ? (
            <span className="stm-shop-coins" aria-label={t('steam-shop-coins', { defaultValue: 'Coins: {{n}}', n: coins })}>
              <CoinIcon className="h-4 w-4" aria-hidden /> {coins.toLocaleString()}
            </span>
          ) : null}
        </header>
        <p className="stm-muted" suppressHydrationWarning>
          {t('steam-daily-rotates', {
            defaultValue: 'Today\'s picks rotate in {{hours}}h {{minutes}}m. Every item stays in the points shop at the same price.',
            hours: left.hours,
            minutes: left.minutes,
          })}
        </p>

        <ul className="stm-shop-grid">
          {items.map((item) => (
            <li key={item.id} className="stm-web-card stm-shop-item" style={{ borderTop: `2px solid ${RARITY_COLORS[item.rarity]}` }}>
              <Swatch data={item.data} />
              <div className="stm-shop-body">
                <p className="stm-shop-name">{item.name}</p>
                <p className="stm-muted stm-shop-meta">{item.rarity}</p>
                <p className="stm-muted stm-shop-desc">{item.description}</p>
              </div>
              <div className="stm-shop-act">
                {!data.signedIn ? (
                  <a className="stm-btn stm-btn-blue" href={`/login?callbackURL=${encodeURIComponent(pathname)}`}>
                    {t('steam-shop-signin', { defaultValue: 'Sign in to buy' })}
                  </a>
                ) : item.owned ? (
                  <span className="stm-btn stm-btn-ghost" aria-disabled="true">
                    {t('steam-daily-owned', { defaultValue: 'Owned' })}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="stm-btn stm-btn-blue"
                    disabled={coins < item.price || busy === item.id}
                    aria-label={t('steam-shop-buy-aria', {
                      defaultValue: 'Buy {{name}} for {{price}} coins',
                      name: item.name,
                      price: item.price,
                    })}
                    onClick={() => void buy(item.id, item.name)}
                  >
                    <CoinIcon className="h-4 w-4" aria-hidden /> {item.price}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="stm-muted">
          <Link to="/store" search={{ tab: 'daily' }} className="stm-link">
            {t('steam-daily-bundles', { defaultValue: 'Bundles and loadouts are on the main site' })}
          </Link>
        </p>
      </div>
    </div>
  );
}
