'use client';

/**
 * A single marketplace listing card. Mirrors the shop/customization card idioms
 * (rarity rim, kind-specific swatch preview) so the market reads as one system.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { RARITY_COLORS, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';

export interface MarketListingView {
  id: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
  item: {
    id: string;
    name: string;
    kind: ShopItemKind;
    rarity: Rarity;
    data: { color?: string; gradient?: string; emoji?: string };
  } | null;
  seller: { id: string; name: string | null; handle: string | null; image: string | null };
}

/** Kind-specific swatch, matching `ShopColumn`/`ProfileCosmetics` previews. */
export function MarketItemPreview({
  kind,
  data,
}: {
  kind: ShopItemKind;
  data: { color?: string; gradient?: string; emoji?: string };
}) {
  const { t } = useTranslation('site');
  if (kind === 'BADGE' || kind === 'PET') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-site-sm bg-site-bg text-2xl">
        {data.emoji}
      </div>
    );
  }
  if (kind === 'NAME_COLOR') {
    return (
      <div
        className="flex h-12 items-center justify-center rounded-site-sm px-3 text-sm font-bold"
        style={data.gradient ? { background: data.gradient, color: '#fff' } : { color: data.color }}
      >
        {t('market-name-preview', { defaultValue: 'Name' })}
      </div>
    );
  }
  if (kind === 'AVATAR_FRAME') {
    return (
      <div
        className="h-12 w-12 rounded-full p-[3px]"
        style={{ background: data.gradient ?? data.color }}
      >
        <div className="h-full w-full rounded-full bg-site-bg" />
      </div>
    );
  }
  // POST_FLAIR / BANNER / THEME
  return (
    <div
      className="h-12 w-20 rounded-site-sm"
      style={{ background: data.gradient ?? data.color ?? 'var(--site-surface)' }}
    />
  );
}

export function ListingCard({
  listing,
  isOwn,
  canBuy,
  onDone,
}: {
  listing: MarketListingView;
  /** True if the viewer is the seller (shows Cancel instead of Buy). */
  isOwn: boolean;
  /** True if the viewer is signed in and not the seller. */
  canBuy: boolean;
  /** Called after a successful buy/cancel so the parent can refresh. */
  onDone: (id: string) => void;
}) {
  const { t } = useTranslation('site');
  const [busy, setBusy] = useState(false);
  const rarity = listing.item?.rarity ?? 'common';
  const name = listing.item?.name ?? listing.itemId;

  const buy = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/market/listings/${listing.id}/buy`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        toast.info(
          data.message || t('market-held', { defaultValue: 'This listing is under review.' }),
        );
      } else if (res.ok) {
        toast.success(t('market-bought', { name, defaultValue: 'Bought {{name}}!' }));
        onDone(listing.id);
      } else {
        toast.error(data.error || t('market-buy-failed', { defaultValue: 'Purchase failed' }));
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/market/listings/${listing.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t('market-canceled', { defaultValue: 'Listing canceled' }));
        onDone(listing.id);
      } else {
        toast.error(data.error || t('market-cancel-failed', { defaultValue: "Couldn't cancel" }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-glass-light=""
      className="glass-interactive flex items-center gap-3 rounded-site border bg-site-glass-tint p-3"
      style={{
        borderColor: `${RARITY_COLORS[rarity]}55`,
        boxShadow: `inset 0 1px 0 ${RARITY_COLORS[rarity]}55, var(--site-shadow-sm)`,
      }}
    >
      {listing.item ? (
        <MarketItemPreview kind={listing.item.kind} data={listing.item.data} />
      ) : (
        <div className="h-12 w-12 rounded-site-sm bg-site-surface" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-site-text">{name}</p>
          <span
            className="text-[10px] font-bold uppercase"
            style={{ color: RARITY_COLORS[rarity] }}
          >
            {rarity}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-site-text-muted">
          <UserAvatar
            src={listing.seller.image}
            alt=""
            size={16}
            fallbackName={listing.seller.name ?? undefined}
          />
          <span className="truncate">
            {listing.seller.handle
              ? `@${listing.seller.handle}`
              : (listing.seller.name ?? t('market-seller', { defaultValue: 'Seller' }))}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-text">
          <CoinIcon className="h-4 w-4" /> {listing.priceCoins.toLocaleString()}
        </span>
        {isOwn ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={cancel}>
            {t('market-cancel', { defaultValue: 'Cancel' })}
          </Button>
        ) : canBuy ? (
          <Button size="sm" variant="accent" loading={busy} onClick={buy}>
            {t('market-buy', { defaultValue: 'Buy' })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
