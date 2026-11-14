import { useTranslation } from 'react-i18next';
import { Emoji } from '@/components/ui/emoji';
import { cn } from '@/lib/utils';
import type { ShopItemKind } from '@/lib/shop/catalog';
import { getPremiumTheme } from '@/lib/shop/themes';

/** The render data a catalog item carries (`ShopItem['data']`, as the shop and market payloads send it). */
export interface ItemArt {
  color?: string;
  gradient?: string;
  emoji?: string;
  themeId?: string;
}

/**
 * A cosmetic's picture: the item's own art inside a picture box (Steel S4: `--site-bg-subtle`
 * ground, 1px border, 8px radius).
 *
 * This is the one place the store draws a purchased colour or gradient, and it is content, not
 * chrome (R1 is about page chrome): the value comes from the catalog as an inline style, never
 * from a class, exactly as `components/profile/ProfileBanner.tsx` draws an equipped banner. The
 * shop grid, the market, the daily shop, the sell sheet and the profile's cosmetics list all draw
 * an item with this component; there were three hand-written copies of it that had drifted (the
 * market drew a gradient name as white text on a gradient box, the shop as a gradient clipped to
 * the glyphs).
 *
 * The box takes its width from its container and its height from `aspect-[4/3]`; pass a width
 * (`w-16`) for a row thumbnail. `size` picks the art's scale to match.
 */
export function ItemPicture({
  kind,
  art,
  size = 'tile',
  className,
}: {
  kind: ShopItemKind | null;
  art: ItemArt;
  size?:
    | 'tile'
    | 'thumb';
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const thumb =
    size ===
    'thumb';
  const box =
    cn(
      'relative flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-site border border-site-border bg-site-bg-subtle',
      className,
    );

  if (
    kind ===
      'BANNER' ||
    kind ===
      'THEME'
  ) {
    // A banner or a theme's backdrop is a picture that fills its box. What a theme sells beyond
    // the backdrop is its accent, so the accent is shown as a dot: two themes from one backdrop
    // family are otherwise the same picture. Legacy theme items carry only a `themeId`.
    const palette =
      kind ===
      'THEME'
        ? getPremiumTheme(
            art.themeId,
          )
        : undefined;
    const background =
      art.gradient ??
      palette?.gradient ??
      art.color;
    return (
      <span
        data-slot="item-picture"
        className={
          box
        }
        style={
          background
            ? {
                background,
              }
            : undefined
        }
      >
        {palette ? (
          <span
            aria-hidden
            className={cn(
              'absolute rounded-full border-2 border-site-bg',
              thumb
                ? 'bottom-1 end-1 size-3'
                : 'bottom-2 end-2 size-5',
            )}
            style={{
              background:
                palette.accent,
            }}
          />
        ) : null}
      </span>
    );
  }

  if (
    kind ===
      'BADGE' ||
    kind ===
      'PET'
  ) {
    return (
      <span
        data-slot="item-picture"
        data-no-twemoji
        className={
          box
        }
      >
        {art.emoji ? (
          <Emoji
            size={
              thumb
                ? 24
                : 40
            }
          >
            {
              art.emoji
            }
          </Emoji>
        ) : null}
      </span>
    );
  }

  if (
    kind ===
    'AVATAR_FRAME'
  ) {
    return (
      <span
        data-slot="item-picture"
        className={
          box
        }
      >
        <span
          aria-hidden
          className={cn(
            'block rounded-full',
            thumb
              ? 'size-8 p-0.5'
              : 'size-16 p-[3px]',
          )}
          style={{
            background:
              art.gradient ??
              art.color,
          }}
        >
          <span className="block size-full rounded-full bg-site-bg-subtle" />
        </span>
      </span>
    );
  }

  if (
    kind ===
    'NAME_COLOR'
  ) {
    // Every name colour is a bright, saturated hue, and as ink on the Day ground most of them sit
    // under 2:1, so the sample word rests on the strongest media scrim (a near-black in both
    // editions that any bright ink reads on). A gradient is clipped to the glyphs: it is the colour of a name that is sold.
    return (
      <span
        data-slot="item-picture"
        className={
          box
        }
      >
        <span
          aria-hidden
          className={cn(
            'rounded-site-sm bg-site-media-scrim-hover font-semibold',
            thumb
              ? 'px-1.5 py-0.5 text-xs'
              : 'px-3 py-1.5 text-base',
          )}
        >
          <span
            style={
              art.gradient
                ? {
                    backgroundImage:
                      art.gradient,
                    WebkitBackgroundClip:
                      'text',
                    backgroundClip:
                      'text',
                    color:
                      'transparent',
                  }
                : {
                    color:
                      art.color,
                  }
            }
          >
            {thumb
              ? t(
                  'name-preview-short',
                  {
                    defaultValue:
                      'Aa',
                  },
                )
              : t(
                  'name-preview',
                  {
                    defaultValue:
                      'Name',
                  },
                )}
          </span>
        </span>
      </span>
    );
  }

  if (
    kind ===
    'POST_FLAIR'
  ) {
    // Flair is a stripe of colour beside a post.
    return (
      <span
        data-slot="item-picture"
        className={
          box
        }
      >
        <span
          aria-hidden
          className={cn(
            'flex items-stretch',
            thumb
              ? 'h-6 gap-1'
              : 'h-12 gap-2',
          )}
        >
          <span
            className={cn(
              'rounded-full',
              thumb
                ? 'w-1'
                : 'w-1.5',
            )}
            style={{
              background:
                art.gradient ??
                art.color,
            }}
          />
          <span
            className={cn(
              'flex flex-col justify-center',
              thumb
                ? 'gap-1'
                : 'gap-2',
            )}
          >
            <span
              className={cn(
                'block h-px bg-site-text-muted',
                thumb
                  ? 'w-5'
                  : 'w-14',
              )}
            />
            <span
              className={cn(
                'block h-px bg-site-text-muted',
                thumb
                  ? 'w-3'
                  : 'w-9',
              )}
            />
          </span>
        </span>
      </span>
    );
  }

  // An item the catalog no longer has: the empty picture box.
  return (
    <span
      data-slot="item-picture"
      className={
        box
      }
    />
  );
}
