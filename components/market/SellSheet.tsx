/**
 * "Sell" dialog — lists the caller's tradable, unequipped, owned cosmetics with
 * a price input so they can post a marketplace listing. Loads the user's
 * inventory from `/api/shop` (owned flag) and filters to tradable items.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { Rarity, ShopItemKind } from '@/lib/shop/catalog';
import { isTradable, minPriceFor, MAX_PRICE } from '@/lib/market/tradable';
import { ItemPicture } from '@/components/shop/ItemPicture';
import { RarityMark } from '@/components/shop/RarityMark';
import { getShopApi } from '@/lib/shop/shop.contract';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createListingApi } from '@/lib/market/market.contract';

interface OwnedItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  rarity: Rarity;
  data: { color?: string; gradient?: string; emoji?: string };
  owned: boolean;
  equipped: boolean;
}

export function SellSheet({
  open,
  onOpenChange,
  onListed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful listing so the parent can refresh the grid. */
  onListed?: () => void;
}) {
  const { t } = useTranslation('site');
  const [items, setItems] = useState<OwnedItem[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const data = await api(getShopApi);
        if (cancelled) return;
        const owned: OwnedItem[] = (data.items ?? []).filter(
          (i: OwnedItem) => i.owned && !i.equipped && isTradable(i.id),
        );
        setItems(owned);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sorted = useMemo(
    () => (items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const list = async (item: OwnedItem) => {
    const floor = minPriceFor(item.id);
    const raw = prices[item.id];
    const price = Number(raw);
    if (!Number.isInteger(price) || price < floor || price > MAX_PRICE) {
      toast.error(
        t('market-price-bounds', {
          min: floor,
          max: MAX_PRICE.toLocaleString(),
          defaultValue: 'Enter a whole number between {{min}} and {{max}} coins',
        }),
      );
      return;
    }
    if (busy !== null) return;
    setBusy(item.id);
    try {
      await api(createListingApi, { body: { itemId: item.id, priceCoins: price } });
      toast.success(t('market-listed-item', { name: item.name, defaultValue: 'Listed {{name}}' }));
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      onListed?.();
    } catch (e) {
      toast.error(serverError(e) || t('market-list-failed', { defaultValue: "Couldn't list that item" }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('market-sell-title', { defaultValue: 'Sell an item' })}</DialogTitle>
          <DialogDescription>
            {t('market-sell-desc', {
              defaultValue:
                'List a tradable cosmetic you own for coins. A 10% fee is burned on every sale.',
            })}
          </DialogDescription>
        </DialogHeader>

        {items === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title={t('market-sell-empty-title', { defaultValue: 'Nothing to sell' })}
            description={t('market-sell-empty-desc', {
              defaultValue:
                'You have no unequipped, tradable cosmetics. Buy name colors, frames, badges or flair in the shop, then list them here.',
            })}
          />
        ) : (
          <ul className="border-t border-site-border">
            {sorted.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3"
              >
                <ItemPicture kind={item.kind} art={item.data} size="thumb" className="w-16" />
                <div className="min-w-32 flex-1">
                  <p className="t-body truncate font-medium text-site-text">{item.name}</p>
                  <p className="t-meta flex items-center gap-2">
                    <RarityMark rarity={item.rarity} />
                    <span>
                      {t('market-price-floor', {
                        min: minPriceFor(item.id).toLocaleString(),
                        defaultValue: 'from {{min}}',
                      })}
                    </span>
                  </p>
                </div>
                <form
                  className="flex w-full items-center gap-2 sm:w-auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void list(item);
                  }}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={minPriceFor(item.id)}
                    max={MAX_PRICE}
                    step={1}
                    placeholder={t('market-price-placeholder', { defaultValue: 'Coins' })}
                    aria-label={t('market-price-label', {
                      name: item.name,
                      defaultValue: 'Price for {{name}}',
                    })}
                    value={prices[item.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                    className="min-w-0 flex-1 sm:w-28 sm:flex-none"
                  />
                  <Button
                    type="submit"
                    variant="default"
                    loading={busy === item.id}
                    disabled={busy !== null}
                  >
                    {t('market-list-action', { defaultValue: 'List' })}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
