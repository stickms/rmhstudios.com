'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { KIND_LABELS, KIND_ORDER, RARITY_COLORS, RARITY_ORDER, type ShopItemKind, type Rarity } from '@/lib/shop/catalog';
import { PinnedHero } from './PinnedHero';
import { Reveal } from '@/components/motion';

interface ShopItemView {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  data: { color?: string; gradient?: string; emoji?: string };
  requiresTier?: 'starter' | 'pro';
  owned: boolean;
  equipped: boolean;
}

function Preview({ item }: { item: ShopItemView }) {
  const { t } = useTranslation("feed");
  const { kind, data } = item;
  if (kind === 'BADGE' || kind === 'PET') {
    return <div className="flex h-12 w-12 items-center justify-center rounded-site-sm bg-site-bg text-2xl">{data.emoji}</div>;
  }
  if (kind === 'NAME_COLOR') {
    return (
      <div
        className="flex h-12 items-center justify-center rounded-site-sm px-3 text-sm font-bold"
        style={data.gradient ? { background: data.gradient, color: '#fff' } : { color: data.color }}
      >
        {t("name-preview", { defaultValue: "Name" })}
      </div>
    );
  }
  if (kind === 'AVATAR_FRAME') {
    return (
      <div className="h-12 w-12 rounded-full p-[3px]" style={{ background: data.gradient ?? data.color }}>
        <div className="h-full w-full rounded-full bg-site-bg" />
      </div>
    );
  }
  // BANNER / POST_FLAIR / THEME
  return <div className="h-12 w-20 rounded-site-sm" style={{ background: data.gradient ?? data.color ?? 'var(--site-surface)' }} />;
}

export function ShopColumn({
  initialData,
  showHero = false,
}: {
  /** Shop payload prefetched by the route loader. */
  initialData?: { coins: number; items: ShopItemView[]; signedIn: boolean } | null;
  /** Render the pinned scroll hero above the catalog. On the combined /store
   *  page the MembershipPanel already owns the page's one pinned moment, so the
   *  shop section below it opts out. */
  showHero?: boolean;
} = {}) {
  const { t } = useTranslation("feed");
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [items, setItems] = useState<ShopItemView[]>(initialData?.items ?? []);
  const [coins, setCoins] = useState(initialData?.coins ?? 0);
  const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
  const [loading, setLoading] = useState(!initialData);
  const [tab, setTab] = useState<ShopItemKind>('NAME_COLOR');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shop', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setCoins(data.coins);
        setSignedIn(data.signedIn);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (seeded.current) return;
    load();
  }, [load]);

  const buy = async (item: ShopItemView) => {
    setBusy(item.id);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t("purchased-item", { name: item.name, defaultValue: "Purchased {{name}}!" }));
        setCoins(data.newBalance);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, owned: true } : i)));
      } else {
        toast.error(data.error || t("purchase-failed", { defaultValue: "Purchase failed" }));
      }
    } finally {
      setBusy(null);
    }
  };

  const equip = async (item: ShopItemView, equipped: boolean) => {
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
            i.kind === item.kind ? { ...i, equipped: i.id === item.id ? equipped : false } : i
          )
        );
      }
    } finally {
      setBusy(null);
    }
  };

  // Within a category, order by rarity (low → high) then price so the grid
  // reads as a clear progression.
  const visible = items
    .filter((i) => i.kind === tab)
    .slice()
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.price - b.price);

  return (
    <div className="min-h-screen">
      {showHero && (
        <PinnedHero
          eyebrow={t("shop-eyebrow", { defaultValue: "Cosmetics & flair" })}
          title={t("shop-title", { defaultValue: "Shop" })}
          subtitle={t("shop-hero-sub", {
            defaultValue:
              "Spend your coins on name colors, badges, avatar frames and more — then equip them across the studio.",
          })}
          scrollCue={t("shop-scroll-cue", { defaultValue: "Browse the shop" })}
        />
      )}
      <header className="glass-chrome sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-site-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{t("shop-title", { defaultValue: "Shop" })}</h1>
        </div>
        {signedIn && (
          <span className="inline-flex items-center gap-1 rounded-full bg-site-surface px-3 py-1 text-sm font-semibold text-site-text">
            <CoinIcon className="h-4 w-4" /> {coins.toLocaleString()}
          </span>
        )}
      </header>

      <div
        className="flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain border-b border-site-border px-3 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("shop-categories-label", { defaultValue: "Shop categories" })}
      >
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              tab === k ? 'bg-site-accent text-(--site-accent-fg)' : 'text-site-text-muted hover:bg-site-surface hover:text-site-text'
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <Reveal className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
          {visible.map((item) => (
            <div
              key={item.id}
              data-glass-light=""
              className="glass-interactive flex items-center gap-3 rounded-site border bg-site-glass-tint p-3"
              // Rarity communicates value through the rim colour (§9.4): a tinted
              // border + a matching inner specular hairline over the base rim.
              style={{
                borderColor: `${RARITY_COLORS[item.rarity]}55`,
                boxShadow: `inset 0 1px 0 ${RARITY_COLORS[item.rarity]}55, var(--site-shadow-sm)`,
              }}
            >
              <Preview item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-site-text">{item.name}</p>
                  <span className="text-[10px] font-bold uppercase" style={{ color: RARITY_COLORS[item.rarity] }}>
                    {item.rarity}
                  </span>
                </div>
                <p className="truncate text-xs text-site-text-muted">{item.description}</p>
                {item.requiresTier && (
                  <p className="text-[10px] uppercase text-site-accent">{t("requires-tier-plan", { tier: item.requiresTier, defaultValue: "{{tier}} plan" })}</p>
                )}
              </div>
              <div className="shrink-0">
                {!signedIn ? (
                  <span className="inline-flex items-center gap-1 text-xs text-site-text-dim"><CoinIcon className="h-3.5 w-3.5" /> {item.price}</span>
                ) : item.owned ? (
                  <Button
                    size="sm"
                    variant={item.equipped ? 'accent' : 'secondary'}
                    disabled={busy === item.id}
                    onClick={() => equip(item, !item.equipped)}
                  >
                    {item.equipped ? <><Check className="h-4 w-4" /> {t("equipped", { defaultValue: "Equipped" })}</> : t("equip", { defaultValue: "Equip" })}
                  </Button>
                ) : (
                  <Button size="sm" variant="accent-outline" disabled={busy === item.id} onClick={() => buy(item)}>
                    <CoinIcon className="h-4 w-4" /> {item.price}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      )}
    </div>
  );
}
