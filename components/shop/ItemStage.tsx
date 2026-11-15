import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/feed/UserAvatar';
import { ProfileBanner } from '@/components/profile/ProfileBanner';
import { Emoji } from '@/components/ui/emoji';
import type { ShopItemKind } from '@/lib/shop/catalog';
import { getPremiumTheme } from '@/lib/shop/themes';
import {
  ItemPicture,
  type ItemArt,
} from './ItemPicture';

/** The kinds a profile head shows. Pets and post flair are drawn nowhere on a profile, so they get the picture alone. */
const ON_PROFILE: ReadonlySet<ShopItemKind> =
  new Set(
    [
      'BANNER',
      'THEME',
      'NAME_COLOR',
      'AVATAR_FRAME',
      'BADGE',
    ],
  );

/**
 * The large preview in an item's dialog: the item drawn where it applies, on a small copy of the
 * viewer's own profile head.
 *
 * It is built from the parts the profile is built from (`ProfileBanner` for a banner or a theme's
 * backdrop, the feed's `UserAvatar` for a frame, the name with the same inline name style
 * `ProfileHero` writes), with the viewer's name and picture, so what is shown is what equipping
 * does. The whole stage is one picture box and is presented to assistive technology as one image.
 */
export function ItemStage({
  kind,
  art,
  name,
}: {
  kind: ShopItemKind | null;
  art: ItemArt;
  /** The item's name, for the picture's accessible name. */
  name: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    data: session,
  } =
    useSession();

  if (
    !kind ||
    !ON_PROFILE.has(
      kind,
    )
  ) {
    return (
      <ItemPicture
        kind={
          kind
        }
        art={
          art
        }
        className="mx-auto max-w-64"
      />
    );
  }

  const viewerName =
    session
      ?.user
      ?.name ||
    t(
      'stage-your-name',
      {
        defaultValue:
          'Your name',
      },
    );
  const handle =
    (
      session?.user as
        | {
            handle?:
              | string
              | null;
          }
        | undefined
    )
      ?.handle;
  const palette =
    kind ===
    'THEME'
      ? getPremiumTheme(
          art.themeId,
        )
      : undefined;
  const backdrop =
    kind ===
    'BANNER'
      ? (art.gradient ??
        art.color)
      : kind ===
          'THEME'
        ? (art.gradient ??
          palette?.gradient)
        : null;
  const nameStyle =
    kind !==
    'NAME_COLOR'
      ? undefined
      : art.gradient
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
          };

  return (
    <div
      role="img"
      aria-label={t(
        'stage-label',
        {
          defaultValue:
            '{{name}}, shown on your profile',
          name,
        },
      )}
      data-slot="item-stage"
      data-no-twemoji
      className="flex flex-col gap-3 rounded-site border border-site-border bg-site-bg p-3"
    >
      {backdrop ? (
        <ProfileBanner
          src={
            null
          }
          backdrop={
            backdrop
          }
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar
          user={{
            id:
              session
                ?.user
                ?.id ??
              'preview',
            name: viewerName,
            image:
              session
                ?.user
                ?.image ??
              null,
            ...(kind ===
            'AVATAR_FRAME'
              ? {
                  cosmetics:
                    {
                      avatarFrame:
                        {
                          color:
                            art.color,
                          gradient:
                            art.gradient,
                        },
                    },
                }
              : {}),
          }}
          size="lg"
          linkToProfile={
            false
          }
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span
              className="t-heading truncate"
              style={
                nameStyle
              }
            >
              {
                viewerName
              }
            </span>
            {kind ===
              'BADGE' &&
            art.emoji ? (
              <Emoji
                size={
                  18
                }
              >
                {
                  art.emoji
                }
              </Emoji>
            ) : null}
          </p>
          {handle ? (
            <p
              className="t-meta truncate"
              dir="ltr"
            >
              @
              {
                handle
              }
            </p>
          ) : null}
        </div>
        {palette ? (
          // What a theme changes besides the backdrop: the accent of the profile's own controls.
          <span
            aria-hidden
            className="inline-flex h-9 shrink-0 items-center rounded-site px-4 text-sm font-medium"
            style={{
              background:
                palette.accent,
              color:
                palette.accentFg,
            }}
          >
            {t(
              'stage-follow',
              {
                defaultValue:
                  'Follow',
              },
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
