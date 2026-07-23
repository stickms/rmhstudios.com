'use client';

/**
 * Profile customization — equip the cosmetics you already own.
 *
 * Shop cosmetics are *profile-scoped* (they recolor the owner's profile, not the
 * site chrome), which is why this lives apart from the site-wide Appearance
 * settings. Only owned items are listed; the catalog itself stays in `/shop`.
 *
 * The card/swatch idioms mirror `components/feed/ShopColumn.tsx` on purpose so
 * the shop and this page read as one system.
 */

import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  KIND_LABELS,
  KIND_ORDER,
  RARITY_COLORS,
  RARITY_ORDER,
  type Rarity,
  type ShopItemKind,
} from '@/lib/shop/catalog';
import { getPremiumTheme } from '@/lib/shop/themes';

interface CosmeticItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  rarity: Rarity;
  data: { color?: string; gradient?: string; emoji?: string; themeId?: string };
  owned: boolean;
  equipped: boolean;
}

/** THEME first — it's the most visible change to a profile. */
const SECTION_ORDER: ShopItemKind[] = ['THEME', ...KIND_ORDER.filter((k) => k !== 'THEME')];

/** Swatch/preview per kind — same visual language as the shop grid. */
function Preview({ item }: { item: CosmeticItem }) {
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
    return (
      <div
        className="flex h-12 items-center justify-center rounded-site-sm px-3 text-sm font-bold"
        style={data.gradient ? { background: data.gradient, color: '#fff' } : { color: data.color }}
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
  // BANNER / POST_FLAIR / THEME. Legacy theme items carry only a `themeId`, so
  // fall back to the palette gradient that actually backs the profile header.
  const background =
    data.gradient ??
    (kind === 'THEME' ? getPremiumTheme(data.themeId)?.gradient : undefined) ??
    data.color ??
    'var(--site-surface)';
  return <div className="h-12 w-20 rounded-site-sm" style={{ background }} />;
}

export function ProfileCosmetics() {
  const { t } = useTranslation('feed');
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['shop'],
    queryFn: async (): Promise<{ items: CosmeticItem[]; signedIn: boolean }> => {
      const res = await fetch('/api/shop', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load cosmetics');
      return res.json();
    },
    staleTime: 30_000,
  });

  const equipMutation = useMutation({
    mutationFn: async ({ item, equipped }: { item: CosmeticItem; equipped: boolean }) => {
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id, equipped }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      return { item, equipped };
    },
    onSuccess: ({ item, equipped }) => {
      toast.success(
        equipped
          ? t('profile-cosmetics-equipped-toast', {
              name: item.name,
              defaultValue: 'Equipped {{name}}',
            })
          : t('profile-cosmetics-unequipped-toast', {
              name: item.name,
              defaultValue: 'Unequipped {{name}}',
            }),
      );
      // The equipped set feeds the profile + cached author display, so refetch
      // rather than patching local state.
      queryClient.invalidateQueries({ queryKey: ['shop'] });
    },
    onError: () => {
      toast.error(t('profile-cosmetics-equip-failed', { defaultValue: "Couldn't update that" }));
    },
  });

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((section) => (
          <div key={section} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-[76px] w-full" />
              <Skeleton className="h-[76px] w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('profile-cosmetics-error', { defaultValue: "Couldn't load your cosmetics." })}
      </p>
    );
  }

  const owned = (data?.items ?? []).filter((i) => i.owned);

  if (owned.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t('profile-cosmetics-empty-title', { defaultValue: 'No cosmetics yet' })}
        description={t('profile-cosmetics-empty-desc', {
          defaultValue:
            'Buy name colors, badges, frames, banners and premium themes with coins, then equip them here.',
        })}
        action={
          <Button asChild variant="accent" size="sm">
            <Link to="/shop">
              {t('profile-cosmetics-empty-cta', { defaultValue: 'Go to the shop' })}
            </Link>
          </Button>
        }
      />
    );
  }

  const sections = SECTION_ORDER.map((kind) => ({
    kind,
    items: owned
      .filter((i) => i.kind === kind)
      .sort(
        (a, b) =>
          RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
          a.name.localeCompare(b.name),
      ),
    // Kinds the user owns nothing in are omitted entirely.
  })).filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      {sections.map(({ kind, items }) => (
        <section key={kind} aria-labelledby={`cosmetics-${kind}-heading`}>
          <h2
            id={`cosmetics-${kind}-heading`}
            className="mb-2 text-xs font-bold uppercase tracking-wider text-site-text-dim"
          >
            {KIND_LABELS[kind]}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((item) => {
              const busy = equipMutation.isPending && equipMutation.variables?.item.id === item.id;
              return (
                <div
                  key={item.id}
                  data-glass-light=""
                  className="glass-interactive flex items-center gap-3 rounded-site border bg-site-surface p-3"
                  // Rarity communicates value through the rim colour, matching
                  // the shop grid.
                  style={{
                    borderColor: `${RARITY_COLORS[item.rarity]}55`,
                    boxShadow: `inset 0 1px 0 ${RARITY_COLORS[item.rarity]}55, var(--site-shadow-sm)`,
                  }}
                >
                  <Preview item={item} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-site-text">{item.name}</p>
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: RARITY_COLORS[item.rarity] }}
                      >
                        {item.rarity}
                      </span>
                    </div>
                    <p className="truncate text-xs text-site-text-muted">{item.description}</p>
                  </div>
                  <div className="shrink-0">
                    <Button
                      size="sm"
                      variant={item.equipped ? 'accent' : 'secondary'}
                      aria-pressed={item.equipped}
                      aria-label={
                        item.equipped
                          ? t('profile-cosmetics-unequip-label', {
                              name: item.name,
                              defaultValue: 'Unequip {{name}}',
                            })
                          : t('profile-cosmetics-equip-label', {
                              name: item.name,
                              defaultValue: 'Equip {{name}}',
                            })
                      }
                      disabled={busy}
                      onClick={() => equipMutation.mutate({ item, equipped: !item.equipped })}
                    >
                      {item.equipped ? (
                        <>
                          <Check className="h-4 w-4" aria-hidden />{' '}
                          {t('profile-cosmetics-equipped', { defaultValue: 'Equipped' })}
                        </>
                      ) : (
                        t('profile-cosmetics-equip', { defaultValue: 'Equip' })
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
