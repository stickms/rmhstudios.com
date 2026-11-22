/**
 * Profile customization — equip the cosmetics you already own.
 *
 * Shop cosmetics are *profile-scoped* (they recolor the owner's profile, not the
 * site chrome), which is why this lives apart from the site-wide Appearance
 * settings. Only owned items are listed; the catalog itself stays in `/shop`.
 *
 * Each item is a row on a rule with the shop's own picture (`components/shop/ItemPicture`) and
 * rarity mark, so the shop and this page draw an item the same way.
 */

import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { KIND_ORDER, RARITY_ORDER, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';
import { ItemPicture } from '@/components/shop/ItemPicture';
import { kindLabel } from '@/components/shop/kind-label';
import { RarityMark } from '@/components/shop/RarityMark';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { getShopApi, equipShopItemApi } from '@/lib/shop/shop.contract';
import { api } from '@/lib/contract/client';

interface CosmeticItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  rarity: Rarity;
  data: {
    color?: string;
    gradient?: string;
    emoji?: string;
    themeId?: string;
    art?: string;
  };
  owned: boolean;
  equipped: boolean;
}

/**
 * Kinds that are not equipped from here: a site theme is applied from the theme picker in Appearance, which `applyItem`
 * leaves to it. (Pets and post flair were here while nothing drew them; a pet now sits beside the profile avatar and
 * flair is the edge on the owner's posts, so both are equipped like any other cosmetic.)
 */
const NOT_EQUIPPABLE_HERE: ReadonlySet<ShopItemKind> = new Set<ShopItemKind>(['SITE_THEME']);

/** THEME first — it's the most visible change to a profile. */
const SECTION_ORDER: ShopItemKind[] = [
  'THEME',
  ...KIND_ORDER.filter((k) => k !== 'THEME' && !NOT_EQUIPPABLE_HERE.has(k)),
];

export function ProfileCosmetics() {
  const { t } = useTranslation('feed');
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['shop'],
    queryFn: async (): Promise<{
      items: CosmeticItem[];
      signedIn: boolean;
    }> => {
      return api(getShopApi);
    },
    staleTime: 30_000,
  });
  const arrival = useArrival(!isPending);

  const equipMutation = useMutation({
    mutationFn: async ({ item, equipped }: { item: CosmeticItem; equipped: boolean }) => {
      await api(equipShopItemApi, {
        body: {
          itemId: item.id,
          equipped,
        },
      });
      return {
        item,
        equipped,
      };
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
      queryClient.invalidateQueries({
        queryKey: ['shop'],
      });
    },
    onError: () => {
      toast.error(
        t('profile-cosmetics-equip-failed', {
          defaultValue: "Couldn't update that",
        }),
      );
    },
  });

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((section) => (
          <div key={section} className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className={cn('text-sm text-site-text-muted', arrival)}>
        {t('profile-cosmetics-error', {
          defaultValue: "Couldn't load your cosmetics.",
        })}
      </p>
    );
  }

  const owned = (data?.items ?? []).filter((i) => i.owned && !NOT_EQUIPPABLE_HERE.has(i.kind));

  if (owned.length === 0) {
    return (
      <EmptyState
        className={arrival}
        icon={Sparkles}
        title={t('profile-cosmetics-empty-title', {
          defaultValue: 'No cosmetics yet',
        })}
        description={t('profile-cosmetics-empty-desc', {
          defaultValue: 'Buy name colors, badges, frames, banners and premium themes with coins, then equip them here.',
        })}
        action={
          <Button asChild variant="default" size="sm">
            <Link
              to="/store"
              search={{
                tab: 'shop',
              }}
            >
              {t('profile-cosmetics-empty-cta', {
                defaultValue: 'Go to the shop',
              })}
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
      .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name)),
    // Kinds the user owns nothing in are omitted entirely.
  })).filter((s) => s.items.length > 0);

  return (
    <>
      {sections.map(({ kind, items }) => (
        <CosmeticSection
          key={kind}
          kind={kind}
          items={items}
          className={arrival}
          pendingId={equipMutation.isPending ? (equipMutation.variables?.item.id ?? null) : null}
          onToggle={(item) => equipMutation.mutate({ item, equipped: !item.equipped })}
        />
      ))}
    </>
  );
}

/** Past this many owned items a section gets the carousel and its Show all toggle; fewer just fit. */
const RAIL_THRESHOLD = 3;

/**
 * One kind of cosmetic as a carousel (the shop's and the theme picker's pattern), so a long collection does not make
 * the page long. "Show all" opens the same tiles as a grid in place; "Show fewer" folds it back.
 */
function CosmeticSection({
  kind,
  items,
  className,
  pendingId,
  onToggle,
}: {
  kind: ShopItemKind;
  items: CosmeticItem[];
  className?: string;
  pendingId: string | null;
  onToggle: (item: CosmeticItem) => void;
}) {
  const { t } = useTranslation('feed');
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const collapsible = items.length > RAIL_THRESHOLD;

  const tiles = items.map((item) => (
    <div key={item.id} className="cosmetic-tile">
      <ItemPicture kind={item.kind} art={item.data} size="thumb" className="w-full" />
      <div className="min-w-0">
        <p className="t-body truncate font-medium text-site-text">{item.name}</p>
        <p className="t-meta">
          <RarityMark rarity={item.rarity} />
        </p>
      </div>
      <Button
        size="sm"
        variant="default"
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
        disabled={pendingId === item.id}
        onClick={() => onToggle(item)}
      >
        {item.equipped ? (
          <>
            <Check className="h-4 w-4" aria-hidden />{' '}
            {t('profile-cosmetics-equipped', {
              defaultValue: 'Equipped',
            })}
          </>
        ) : (
          t('profile-cosmetics-equip', {
            defaultValue: 'Equip',
          })
        )}
      </Button>
    </div>
  ));

  return (
    <SettingsSection
      title={kindLabel(t, kind)}
      className={className}
      action={
        collapsible ? (
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t('profile-cosmetics-show-fewer', { defaultValue: 'Show fewer' })
              : t('profile-cosmetics-show-all', {
                  count: items.length,
                  defaultValue: 'Show all ({{count}})',
                })}
          </Button>
        ) : null
      }
    >
      <div id={listId}>
        {collapsible && !expanded ? (
          <HorizontalScroller surface="none" aria-label={kindLabel(t, kind)} contentClassName="cosmetic-rail">
            {tiles}
          </HorizontalScroller>
        ) : (
          <div className="cosmetic-grid">{tiles}</div>
        )}
      </div>
    </SettingsSection>
  );
}
