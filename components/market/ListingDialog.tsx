import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  buyListingApi,
  cancelListingApi,
  type MarketListingView,
} from '@/lib/market/market.contract';
import { Button } from '@/components/ui/button';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { ItemDialog } from '@/components/shop/ItemDialog';
import { rarityLabel } from '@/components/shop/RarityMark';

/** How a listing names its seller: the handle, else the name. */
export function sellerLabel(listing: MarketListingView, fallback: string): string {
  return listing.seller.handle ? `@${listing.seller.handle}` : (listing.seller.name ?? fallback);
}

/**
 * One market listing, opened from its tile: the shop's item dialog with the seller and the asking
 * price, and one action. A buyer gets Buy (the primary); the seller gets Cancel listing.
 */
export function ListingDialog({
  listing,
  onOpenChange,
  viewerId,
  coins,
  onDone,
}: {
  /** The open listing, or null when closed. */
  listing: MarketListingView | null;
  onOpenChange: (open: boolean) => void;
  viewerId: string | null;
  /** The viewer's balance, or null when signed out. */
  coins: number | null;
  /** Called after a buy or a cancel, with the listing's id. */
  onDone: (id: string) => void;
}) {
  const { t } = useTranslation('site');
  const { t: tf } = useTranslation('feed');
  const [busy, setBusy] = useState(false);
  // Keep drawing the last listing while the dialog fades out.
  const last = useRef<MarketListingView | null>(null);
  if (listing) last.current = listing;
  const shown = listing ?? last.current;
  if (!shown) return null;

  const name = shown.item?.name ?? shown.itemId;
  const isOwn = !!viewerId && shown.seller.id === viewerId;
  const held = shown.status === 'HELD';
  const short = coins === null || isOwn ? 0 : Math.max(0, shown.priceCoins - coins);

  const buy = async () => {
    setBusy(true);
    try {
      const data = await api(buyListingApi, { params: { id: shown.id } });
      if (data.status === 'HELD') {
        toast.info(
          data.message || t('market-held', { defaultValue: 'This listing is under review.' }),
        );
      } else {
        toast.success(t('market-bought-item', { name, defaultValue: 'Bought {{name}}' }));
        onDone(shown.id);
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
      await api(cancelListingApi, { params: { id: shown.id } });
      toast.success(t('market-canceled', { defaultValue: 'Listing canceled' }));
      onDone(shown.id);
    } catch (e) {
      toast.error(serverError(e) ?? t('market-cancel-failed', { defaultValue: "Couldn't cancel" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ItemDialog
      open={!!listing}
      onOpenChange={onOpenChange}
      kind={shown.item?.kind ?? null}
      art={shown.item?.data ?? {}}
      name={name}
      facts={[
        ...(shown.item
          ? [
              {
                label: t('market-fact-rarity', { defaultValue: 'Rarity' }),
                value: rarityLabel(tf, shown.item.rarity),
              },
            ]
          : []),
        {
          label: t('market-fact-seller', { defaultValue: 'Seller' }),
          value: isOwn ? (
            t('market-fact-seller-you', { defaultValue: 'You' })
          ) : (
            <Link
              to="/u/$userid"
              params={{ userid: shown.seller.handle ?? shown.seller.id }}
              className="underline underline-offset-2"
            >
              <span dir="ltr">
                {sellerLabel(shown, t('market-seller', { defaultValue: 'Seller' }))}
              </span>
            </Link>
          ),
        },
        {
          label: t('market-fact-price', { defaultValue: 'Price' }),
          value: <CoinAmount amount={shown.priceCoins} />,
        },
        ...(coins !== null && !isOwn
          ? [
              {
                label: t('market-fact-balance', { defaultValue: 'Your balance' }),
                value: <CoinAmount amount={coins} />,
              },
            ]
          : []),
      ]}
      note={
        held && isOwn
          ? t('market-under-review-hint', {
              defaultValue:
                'A buy at this price was paused for a quick check. No coins moved. Cancel to get the item back now.',
            })
          : coins === null
            ? t('market-note-signin', { defaultValue: 'Sign in to buy this with coins.' })
            : short > 0
              ? t('market-note-short', {
                  count: short,
                  formatted: short.toLocaleString(),
                  defaultValue_one: 'You need {{formatted}} more coin.',
                  defaultValue: 'You need {{formatted}} more coins.',
                })
              : undefined
      }
      actions={
        isOwn ? (
          <Button variant="danger" loading={busy} onClick={cancel}>
            {t('market-cancel-listing', { defaultValue: 'Cancel listing' })}
          </Button>
        ) : coins === null ? (
          <Button asChild variant="primary">
            <a href="/login">{t('market-sign-in', { defaultValue: 'Sign in' })}</a>
          </Button>
        ) : (
          <Button variant="primary" loading={busy} disabled={held || short > 0} onClick={buy}>
            {t('market-buy-for', {
              price: shown.priceCoins.toLocaleString(),
              defaultValue: 'Buy for {{price}} coins',
            })}
          </Button>
        )
      }
    />
  );
}
