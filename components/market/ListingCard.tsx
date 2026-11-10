/**
 * A single marketplace listing card. Mirrors the shop/customization card idioms
 * (rarity rim, kind-specific swatch preview) so the market reads as one system.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { buyListingApi, cancelListingApi } from '@/lib/market/market.contract';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { RARITY_COLORS, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';

export interface MarketListingView {
  id: string;
  itemId: string;
  priceCoins: number;
  /**
   * HELD = frozen for admin review after an anomalously priced buy. The API only
   * returns HELD listings to their own seller. Absent on older payloads (ACTIVE).
   */
  status?: 'ACTIVE' | 'HELD';
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
  const held = listing.status === 'HELD';

  const buy = async () => {
    setBusy(true);
    try {
      const data = await api(buyListingApi, { params: { id: listing.id } });
      if (data.status === 'HELD') {
        toast.info(
          data.message || t('market-held', { defaultValue: 'This listing is under review.' }),
        );
      } else {
        toast.success(t('market-bought', { name, defaultValue: 'Bought {{name}}!' }));
        onDone(listing.id);
      }
    } catch (e) {
      toast.error(serverError(e) ?? t('market-buy-failed', { defaultValue: 'Purchase failed' }));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api(cancelListingApi, { params: { id: listing.id } });
      toast.success(t('market-canceled', { defaultValue: 'Listing canceled' }));
      onDone(listing.id);
    } catch (e) {
      toast.error(serverError(e) ?? t('market-cancel-failed', { defaultValue: "Couldn't cancel" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="glass-fill glass-interactive flex min-w-0 flex-col items-stretch gap-4 rounded-site p-5"
      style={{
        borderColor: `${RARITY_COLORS[rarity]}55`,
        boxShadow: `inset 0 1px 0 ${RARITY_COLORS[rarity]}55, var(--site-shadow-sm)`,
      }}
    >
      <div className="glass-inset flex min-h-32 items-center justify-center rounded-site-sm p-4">
        {listing.item ? (
          <MarketItemPreview kind={listing.item.kind} data={listing.item.data} />
        ) : (
          <div className="h-12 w-12 rounded-site-sm bg-site-surface" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words text-sm font-semibold text-site-text">{name}</p>
          <span
            className="text-xs font-semibold uppercase"
            style={{ color: RARITY_COLORS[rarity] }}
          >
            {rarity}
          </span>
          {held && (
            <Badge variant="warning" size="sm">
              {t('market-under-review', { defaultValue: 'Under review' })}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-site-text-muted">
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
        {held && isOwn && (
          <p className="mt-2 text-xs text-site-text-muted">
            {t('market-under-review-hint', {
              defaultValue:
                'A buy at this price was paused for a quick check. No coins moved. Cancel to get the item back now.',
            })}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-text">
          <CoinIcon className="h-4 w-4" /> {listing.priceCoins.toLocaleString()}
        </span>
        {isOwn ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={cancel}>
            {t('market-cancel', { defaultValue: 'Cancel' })}
          </Button>
        ) : canBuy && !held ? (
          <Button size="sm" variant="accent" loading={busy} onClick={buy}>
            {t('market-buy', { defaultValue: 'Buy' })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
