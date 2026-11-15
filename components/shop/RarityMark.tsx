import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  RARITY_COLORS,
  type Rarity,
} from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';

/** Rarity names, as literal `t()` calls so the extractor sees every key. */
export function rarityLabel(
  t: TFunction,
  rarity: Rarity,
): string {
  switch (
    rarity
  ) {
    case 'common':
      return t(
        'rarity-common',
        {
          defaultValue:
            'Common',
        },
      );
    case 'uncommon':
      return t(
        'rarity-uncommon',
        {
          defaultValue:
            'Uncommon',
        },
      );
    case 'rare':
      return t(
        'rarity-rare',
        {
          defaultValue:
            'Rare',
        },
      );
    case 'epic':
      return t(
        'rarity-epic',
        {
          defaultValue:
            'Epic',
        },
      );
    case 'legendary':
      return t(
        'rarity-legendary',
        {
          defaultValue:
            'Legendary',
        },
      );
    case 'mythic':
      return t(
        'rarity-mythic',
        {
          defaultValue:
            'Mythic',
        },
      );
    case 'exotic':
      return t(
        'rarity-exotic',
        {
          defaultValue:
            'Exotic',
        },
      );
  }
}

/**
 * An item's rarity: the word, with a small dot in the rarity's catalog colour before it.
 *
 * The word carries the meaning (A2: never colour alone) in the muted ink every caption uses. The
 * rarity palette is saturated mid-tones that sit under 2.5:1 as text on either ground, so the
 * colour is the dot only. It replaces three treatments: a tinted rim and inset highlight on the
 * tile, a tinted chip, and rarity-coloured text.
 */
export function RarityMark({
  rarity,
  className,
}: {
  rarity: Rarity;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  return (
    <span
      data-slot="rarity-mark"
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{
          background:
            RARITY_COLORS[
              rarity
            ],
        }}
      />
      <span className="truncate">
        {rarityLabel(
          t,
          rarity,
        )}
      </span>
    </span>
  );
}
