'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import {
  KIND_LABELS,
  KIND_ORDER,
  RARITY_COLORS,
  RARITY_ORDER,
  type ShopItemKind,
  type Rarity,
} from '@/lib/shop/catalog';
import { getPremiumTheme } from '@/lib/shop/themes';
import { PinnedHero } from './PinnedHero';
import { ColumnHeader } from './ColumnHeader';
import { Reveal } from '@/components/motion';

interface ShopItemView {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  data: { color?: string; gradient?: string; emoji?: string; themeId?: string };
  requiresTier?: 'starter' | 'pro';
  owned: boolean;
  equipped: boolean;
}

function Preview({ item }: { item: ShopItemView }) {
  const { t } = useTranslation('feed');
  const { kind, data } = item;
  if (kind === 'BADGE' || kind === 'PET') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-site-sm bg-site-bg text-2xl">
        {data.emoji}
      </div>
    );
  }
  if (kind === 'NAME_COLOR') {
    // Every name colour in the catalog is a bright, saturated hue — that is what
    // makes it worth buying — and drawn as ink straight onto the card they were
    // unreadable: white 2.65:1, sky 1.80, emerald 1.67, amber 1.49, lime 1.38.
    // You could not see what you were buying. The swatch now sits on the shared
    // media scrim (the token for "a chip resting on media", i.e. a neutral dark
    // any bright ink reads on), which is also closer to how the colour looks in
    // a feed than a bare white rectangle was.
    // A gradient item paints the gradient onto the TEXT rather than replacing
    // the chip's background with it. Setting it as the background overrode the
    // scrim class (an inline style always does), which put white ink straight
    // onto a gradient — 2.66:1 on the light end of aurora/molten. Clipping it to
    // the glyphs keeps the scrim underneath, so the backing is the same known
    // dark for every item, and it shows the gradient as what is actually sold:
    // the colour of a name.
    return (
      <div
        className="flex h-12 items-center justify-center rounded-site-sm bg-site-media-scrim-strong px-3 text-sm font-bold"
        style={
          data.gradient
            ? {
                backgroundImage: data.gradient,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }
            : { color: data.color }
        }
      >
        {t('name-preview', { defaultValue: 'Name' })}
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
  if (kind === 'THEME') {
    // What a theme actually sells is its accent — the colour it writes over
    // `--site-accent*` on the owner's profile. The swatch showed only the
    // backdrop gradient, so two themes from the same backdrop family read as
    // the same item; the dot is the accent itself. Legacy theme items carry no
    // `data.gradient` at all, so the palette supplies the backdrop too (without
    // that fallback they rendered as an empty surface rectangle).
    const palette = getPremiumTheme(data.themeId);
    return (
      <div
        className="relative h-12 w-20 rounded-site-sm border border-site-border"
        style={{
          background: data.gradient ?? palette?.gradient ?? data.color ?? 'var(--site-surface)',
        }}
      >
        {palette && (
          <span
            aria-hidden
            className="absolute bottom-1 right-1 size-4 rounded-full ring-2 ring-site-bg"
            style={{ background: palette.accent }}
          />
        )}
      </div>
    );
  }
  // BANNER / POST_FLAIR
  return (
    <div
      className="h-12 w-20 rounded-site-sm"
      style={{ background: data.gradient ?? data.color ?? 'var(--site-surface)' }}
    />
  );
}

export function ShopColumn({
  initialData,
  showHero = false,
}: {
  /** Shop payload prefetched by the route loader. */
  initialData?: { coins: number; items: ShopItemView[]; signedIn: boolean } | null;
  /** Render the pinned scroll hero above the catalog. Only the standalone
   * /shop route does. On /store the shop is a tab panel that already sits under
   * the page's own title and tab strip, and a 1.2-screen pinned hero there
   * would push the catalog below the fold on every tab switch. */
  showHero?: boolean;
} = {}) {
  const { t } = useTranslation('feed');
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
        toast.success(
          t('purchased-item', { name: item.name, defaultValue: 'Purchased {{name}}!' }),
        );
        setCoins(data.newBalance);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, owned: true } : i)));
      } else {
        toast.error(data.error || t('purchase-failed', { defaultValue: 'Purchase failed' }));
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
            i.kind === item.kind ? { ...i, equipped: i.id === item.id ? equipped : false } : i,
          ),
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
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.price - b.price,
    );

  return (
    <div>
      {showHero && (
        <PinnedHero
          /* 1.2 screens, not the 2.6 default: at 2.6 the catalog started three
 viewport-heights below the fold and no product was visible on the
 first screen at any size. */
          screens={1.2}
          eyebrow={t('shop-eyebrow', { defaultValue: 'Cosmetics & flair' })}
          title={t('shop-title', { defaultValue: 'Shop' })}
          subtitle={t('shop-hero-sub', {
            defaultValue:
              'Spend your coins on name colors, badges, avatar frames and more — then equip them across the studio.',
          })}
          scrollCue={t('shop-scroll-cue', { defaultValue: 'Browse the shop' })}
        />
      )}
      <ColumnHeader
        icon={ShoppingBag}
        // Never the page h1: with the hero (on /shop) the hero is; without it
        // (embedded in /store) the route's own title capsule is.
        headingLevel="h2"
        title={t('shop-title', { defaultValue: 'Shop' })}
        actions={
          signedIn && (
            <span className="inline-flex items-center gap-1 rounded-full bg-site-surface px-3 py-1 text-sm font-semibold text-site-text">
              <CoinIcon className="h-4 w-4" /> {coins.toLocaleString()}
            </span>
          )
        }
      />

      {/* Category tabs → standalone glass sheet below the hero (§5.45). The pill
 scrolls horizontally in the shared tab-sheet track (overflow + edge fade,
 §5.5x A.4); ARIA/state are unchanged. */}
      <div className="my-3 px-3">
        <LiquidTabs
          size="sm"
          aria-label={t('shop-categories-label', { defaultValue: 'Shop categories' })}
          value={tab}
          onChange={(id) => setTab(id as ShopItemKind)}
          tabs={KIND_ORDER.map((k) => ({ id: k, label: KIND_LABELS[k] }))}
          scroll
        />
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
              // L1 .glass-fill + .glass-interactive together light the hover glint
              // ring (the ring selector needs BOTH classes) and the pointer light.
              className="glass-fill glass-interactive flex items-center gap-3 rounded-site p-3"
              // Rarity communicates value through the rim colour (§9.4): a tinted
              // border + a matching inner specular hairline over the base rim.
              style={{
                borderColor: `${RARITY_COLORS[item.rarity]}55`,
                boxShadow: `inset 0 1px 0 ${RARITY_COLORS[item.rarity]}55, var(--site-shadow-site-sm)`,
              }}
            >
              <Preview item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-site-text">{item.name}</p>
                  {/* The rarity palette is saturated mid-tones, and as INK on the
                      card they all sit under 2.5:1 — legendary #f59e0b measured
                      2.04, uncommon #22c55e 2.0, exotic #06b6d4 2.2. The colour
                      moves to the chip's fill and border (where it still reads as
                      "legendary" at a glance) and the word takes the surface's own
                      ink. Same fix as the achievement tier chips. */}
                  <span
                    className="shrink-0 rounded border px-1 py-0.5 text-[11px] font-bold uppercase text-site-text"
                    style={{
                      background: `${RARITY_COLORS[item.rarity]}2e`,
                      borderColor: `${RARITY_COLORS[item.rarity]}99`,
                    }}
                  >
                    {item.rarity}
                  </span>
                </div>
                <p className="truncate text-xs text-site-text-muted">{item.description}</p>
                {item.requiresTier && (
                  <p className="text-[11px] uppercase text-site-accent">
                    {t('requires-tier-plan', {
                      tier: item.requiresTier,
                      defaultValue: '{{tier}} plan',
                    })}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {!signedIn ? (
                  <span className="inline-flex items-center gap-1 text-xs text-site-text-muted">
                    <CoinIcon className="h-3.5 w-3.5" /> {item.price}
                  </span>
                ) : item.owned ? (
                  <Button
                    size="sm"
                    variant={item.equipped ? 'accent' : 'secondary'}
                    disabled={busy === item.id}
                    onClick={() => equip(item, !item.equipped)}
                  >
                    {item.equipped ? (
                      <>
                        <Check className="h-4 w-4" /> {t('equipped', { defaultValue: 'Equipped' })}
                      </>
                    ) : (
                      t('equip', { defaultValue: 'Equip' })
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="accent-outline"
                    disabled={busy === item.id}
                    onClick={() => buy(item)}
                    // The visible label is just a price ("R 100"), so nothing —
                    // visually or in the accessible name — said this button
                    // BUYS anything. The price stays; the verb is stated.
                    aria-label={t('buy-item-aria', {
                      defaultValue: 'Buy {{name}} for {{price}} coins',
                      name: item.name,
                      price: item.price,
                    })}
                  >
                    <CoinIcon className="h-4 w-4" aria-hidden /> {item.price}
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
