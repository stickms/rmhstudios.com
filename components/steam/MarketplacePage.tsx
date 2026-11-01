'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { RARITY_COLORS } from '@/lib/shop/catalog';
import type { MarketListingView } from '@/components/market/ListingCard';
import { PersonAvatar } from './SteamPeople';
import { Swatch } from './ShopPage';
import { StoreNav } from './StoreNav';

/** Player listings, drawn as Steam draws its community market: browse and buy. */
export function MarketplacePage({
  listings: initial,
  viewerId,
}: {
  listings: MarketListingView[];
  viewerId: string | null;
}) {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const [listings, setListings] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (l: MarketListingView, name: string) => {
    setBusy(l.id);
    try {
      const res = await fetch(`/api/market/listings/${l.id}/buy`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.status === 202) {
        toast.info(body.message ?? t('steam-marketplace-held', { defaultValue: 'This listing is under review.' }));
      } else if (res.ok) {
        toast.success(t('steam-marketplace-bought', { defaultValue: 'Bought {{name}}', name }));
        setListings((prev) => prev.filter((x) => x.id !== l.id));
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
        <h1 className="stm-web-title">{t('steam-marketplace-title', { defaultValue: 'Player marketplace' })}</h1>
        <p className="stm-muted">
          {t('steam-marketplace-sub', {
            defaultValue: 'Cosmetics other players are selling for coins. A tenth of each sale is burned.',
          })}
        </p>

        {listings.length === 0 ? (
          <p className="stm-muted">{t('steam-marketplace-empty', { defaultValue: 'Nothing is listed right now.' })}</p>
        ) : (
          <ul className="stm-shop-grid">
            {listings.map((l) => {
              const name = l.item?.name ?? l.itemId;
              const mine = viewerId !== null && l.seller.id === viewerId;
              const sellerName = l.seller.name ?? l.seller.handle ?? '';
              return (
                <li
                  key={l.id}
                  className="stm-web-card stm-shop-item"
                  style={{ borderTop: `2px solid ${RARITY_COLORS[l.item?.rarity ?? 'common']}` }}
                >
                  <Swatch data={l.item?.data ?? {}} />
                  <div className="stm-shop-body">
                    <p className="stm-shop-name">{name}</p>
                    <p className="stm-muted stm-shop-meta">{l.item?.rarity ?? ''}</p>
                    <Link
                      to="/games/profile/$id"
                      params={{ id: l.seller.handle ?? l.seller.id }}
                      className="stm-person stm-seller"
                    >
                      <PersonAvatar src={l.seller.image} name={sellerName || '?'} />
                      <span className="stm-person-name">{sellerName}</span>
                    </Link>
                  </div>
                  <div className="stm-shop-act">
                    {viewerId === null ? (
                      <a className="stm-btn stm-btn-blue" href={`/login?callbackURL=${encodeURIComponent(pathname)}`}>
                        {t('steam-shop-signin', { defaultValue: 'Sign in to buy' })}
                      </a>
                    ) : mine ? (
                      <span className="stm-btn stm-btn-ghost" aria-disabled="true">
                        {t('steam-marketplace-yours', { defaultValue: 'Your listing' })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="stm-btn stm-btn-blue"
                        disabled={busy === l.id}
                        aria-label={t('steam-shop-buy-aria', {
                          defaultValue: 'Buy {{name}} for {{price}} coins',
                          name,
                          price: l.priceCoins,
                        })}
                        onClick={() => void buy(l, name)}
                      >
                        <CoinIcon className="h-4 w-4" aria-hidden /> {l.priceCoins}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="stm-muted">
          <Link to="/store" search={{ tab: 'market' }} className="stm-link">
            {t('steam-marketplace-sell', { defaultValue: 'Sell your own items on the main site' })}
          </Link>
        </p>
      </div>
    </div>
  );
}
