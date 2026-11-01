'use client';

import { useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { KIND_LABELS, KIND_ORDER, RARITY_COLORS, type ShopItemKind } from '@/lib/shop/catalog';
import { StoreNav } from './StoreNav';
import { canBuy, visibleShopItems, type SteamShopItem } from './shop-view';

interface ShopPageData {
  coins: number;
  items: SteamShopItem[];
  signedIn: boolean;
}

/** What an item looks like in its card: its emoji, or its colour or gradient. */
export function Swatch({ data }: { data: { emoji?: string; color?: string; gradient?: string } }) {
  const { emoji, color, gradient } = data;
  if (emoji) {
    return (
      <span className="stm-shop-swatch" aria-hidden>
        {emoji}
      </span>
    );
  }
  return (
    <span
      className="stm-shop-swatch"
      aria-hidden
      style={{ background: gradient ?? color ?? 'var(--stm-web-bg-2)' }}
    />
  );
}

/** The points shop, in the Steam frame: spend coins on cosmetics, then equip them. */
export function ShopPage({ data }: { data: ShopPageData }) {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const [items, setItems] = useState(data.items);
  const [coins, setCoins] = useState(data.coins);
  const [kind, setKind] = useState<ShopItemKind>(KIND_ORDER[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = visibleShopItems(items, kind);

  const buy = async (item: SteamShopItem) => {
    setBusy(item.id);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { newBalance?: number; error?: string };
      if (res.ok) {
        toast.success(t('steam-shop-bought', { defaultValue: 'Purchased {{name}}', name: item.name }));
        if (typeof body.newBalance === 'number') setCoins(body.newBalance);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, owned: true } : i)));
      } else {
        toast.error(body.error ?? t('steam-shop-failed', { defaultValue: 'That purchase did not go through.' }));
      }
    } finally {
      setBusy(null);
    }
  };

  const equip = async (item: SteamShopItem, equipped: boolean) => {
    setBusy(item.id);
    try {
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id, equipped }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.kind === item.kind ? { ...i, equipped: i.id === item.id ? equipped : false } : i,
          ),
        );
      } else {
        toast.error(t('steam-shop-equip-failed', { defaultValue: 'Could not change what is equipped.' }));
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
          <h1 className="stm-web-title">{t('steam-shop-title', { defaultValue: 'Points shop' })}</h1>
          {data.signedIn ? (
            <span className="stm-shop-coins" aria-label={t('steam-shop-coins', { defaultValue: 'Coins: {{n}}', n: coins })}>
              <CoinIcon className="h-4 w-4" aria-hidden /> {coins.toLocaleString()}
            </span>
          ) : null}
        </header>
        <p className="stm-muted">
          {t('steam-shop-sub', {
            defaultValue: 'Spend your coins on name colours, badges, frames and more, then equip them across the studio.',
          })}
        </p>

        <div className="stm-shop-kinds" role="group" aria-label={t('steam-shop-kinds', { defaultValue: 'Shop categories' })}>
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`stm-btn ${kind === k ? 'stm-btn-blue' : 'stm-btn-ghost'}`}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="stm-muted">{t('steam-shop-empty', { defaultValue: 'Nothing in this category yet.' })}</p>
        ) : (
          <ul className="stm-shop-grid">
            {visible.map((item) => {
              const status = canBuy(item, coins, data.signedIn);
              return (
                <li key={item.id} className="stm-web-card stm-shop-item" style={{ borderTop: `2px solid ${RARITY_COLORS[item.rarity]}` }}>
                  <Swatch data={item.data} />
                  <div className="stm-shop-body">
                    <p className="stm-shop-name">{item.name}</p>
                    <p className="stm-muted stm-shop-meta">
                      {item.rarity}
                      {item.requiresTier
                        ? ` · ${t('steam-shop-plan', { defaultValue: '{{tier}} plan', tier: item.requiresTier })}`
                        : ''}
                    </p>
                    <p className="stm-muted stm-shop-desc">{item.description}</p>
                  </div>
                  <div className="stm-shop-act">
                    {status === 'signed-out' ? (
                      <a className="stm-btn stm-btn-blue" href={`/login?callbackURL=${encodeURIComponent(pathname)}`}>
                        {t('steam-shop-signin', { defaultValue: 'Sign in to buy' })}
                      </a>
                    ) : status === 'owned' ? (
                      <button
                        type="button"
                        className={`stm-btn ${item.equipped ? 'stm-btn-blue' : 'stm-btn-ghost'}`}
                        disabled={busy === item.id}
                        onClick={() => void equip(item, !item.equipped)}
                      >
                        {item.equipped
                          ? t('steam-shop-equipped', { defaultValue: 'Equipped' })
                          : t('steam-shop-equip', { defaultValue: 'Equip' })}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="stm-btn stm-btn-blue"
                        disabled={status === 'poor' || busy === item.id}
                        aria-label={t('steam-shop-buy-aria', {
                          defaultValue: 'Buy {{name}} for {{price}} coins',
                          name: item.name,
                          price: item.price,
                        })}
                        onClick={() => void buy(item)}
                      >
                        <CoinIcon className="h-4 w-4" aria-hidden /> {item.price}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </div>
  );
}
