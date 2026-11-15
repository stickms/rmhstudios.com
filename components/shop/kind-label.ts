import type { TFunction } from 'i18next';
import type { ShopItemKind } from '@/lib/shop/catalog';

/**
 * A category's name, as literal `t()` calls (namespace `feed`). The catalog's `KIND_LABELS` are
 * English literals that were rendered raw, so every locale saw English tabs; these are also short
 * enough that the seven categories fit a phone's tab strip with one swipe.
 */
export function kindLabel(
  t: TFunction,
  kind: ShopItemKind,
): string {
  switch (
    kind
  ) {
    case 'NAME_COLOR':
      return t(
        'shop-kind-name-color',
        {
          defaultValue:
            'Name colors',
        },
      );
    case 'AVATAR_FRAME':
      return t(
        'shop-kind-avatar-frame',
        {
          defaultValue:
            'Frames',
        },
      );
    case 'BADGE':
      return t(
        'shop-kind-badge',
        {
          defaultValue:
            'Badges',
        },
      );
    case 'POST_FLAIR':
      return t(
        'shop-kind-post-flair',
        {
          defaultValue:
            'Flair',
        },
      );
    case 'BANNER':
      return t(
        'shop-kind-banner',
        {
          defaultValue:
            'Banners',
        },
      );
    case 'PET':
      return t(
        'shop-kind-pet',
        {
          defaultValue:
            'Pets',
        },
      );
    case 'THEME':
      return t(
        'shop-kind-theme',
        {
          defaultValue:
            'Themes',
        },
      );
  }
}
