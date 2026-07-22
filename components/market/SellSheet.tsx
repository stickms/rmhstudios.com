'use client';

/**
 * "Sell" dialog — lists the caller's tradable, unequipped, owned cosmetics with
 * a price input so they can post a marketplace listing. Loads the user's
 * inventory from `/api/shop` (owned flag) and filters to tradable items.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { Tag } from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { RARITY_COLORS, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';
import { isTradable, minPriceFor, MAX_PRICE } from '@/lib/market/tradable';
import { MarketItemPreview } from './ListingCard';

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
        const res = await fetch('/api/shop', { credentials: 'include' });
        const data = await res.json().catch(() => ({ items: [] }));
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
    setBusy(item.id);
    try {
      const res = await fetch('/api/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id, priceCoins: price }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t('market-listed', { name: item.name, defaultValue: 'Listed {{name}}!' }));
        setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
        onListed?.();
      } else {
        toast.error(
          data.error || t('market-list-failed', { defaultValue: "Couldn't list that item" }),
        );
      }
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
            icon={Tag}
            title={t('market-sell-empty-title', { defaultValue: 'Nothing to sell' })}
            description={t('market-sell-empty-desc', {
              defaultValue:
                'You have no unequipped, tradable cosmetics. Buy name colors, frames, badges or flair in the shop, then list them here.',
            })}
          />
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {sorted.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-3"
              >
                <MarketItemPreview kind={item.kind} data={item.data} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-site-text">{item.name}</p>
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{ color: RARITY_COLORS[item.rarity] }}
                  >
                    {item.rarity}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="relative">
                    <CoinIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={minPriceFor(item.id)}
                      max={MAX_PRICE}
                      step={1}
                      placeholder={String(minPriceFor(item.id))}
                      aria-label={t('market-price-label', {
                        name: item.name,
                        defaultValue: 'Price for {{name}}',
                      })}
                      value={prices[item.id] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                      className="h-9 w-28 pl-8"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="accent"
                    loading={busy === item.id}
                    onClick={() => list(item)}
                  >
                    {t('market-list-action', { defaultValue: 'List' })}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
