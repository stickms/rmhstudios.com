/**
 * Official site themes: the house-made themes sold in the store (catalog kind `SITE_THEME`), as opposed to the
 * profile themes (kind `THEME`, lib/shop/themes.ts), which recolour only your profile, and the community themes
 * people author and sell in the theme studio (`UserTheme`).
 *
 * A site theme recolours the whole site for whoever owns and applies it, exactly as a community theme does: the same
 * closed token map, the same derivation (`themeCssVars`, so the R1-amendment wash and sheen come with it) and the
 * same contrast gate (lib/themes/__tests__/official.test.ts holds every theme to `validateThemeForPublish`). Owned
 * through the store's inventory (`UserInventory`, kind SITE_THEME), and applied under the id `official:<id>` so it can
 * never collide with a marketplace theme's cuid.
 *
 * Client-safe: tokens only.
 */

import {
  THEME_TOKENS_VERSION,
  type ThemeTokens,
  type UserThemeView,
} from '@/lib/themes/tokens';

export const OFFICIAL_ID_PREFIX =
  'official:';

export interface OfficialSiteTheme {
  name: string;
  description: string;
  /** A store rarity (lib/shop/catalog.ts `Rarity`), which sets the price. */
  rarity:
    | 'rare'
    | 'epic'
    | 'legendary';
  tokens: ThemeTokens;
}

const v =
  THEME_TOKENS_VERSION;

export const OFFICIAL_SITE_THEMES: Record<
  string,
  OfficialSiteTheme
> =
  {
    aurora:
      {
        name: 'Aurora',
        description:
          'Deep navy with blue, violet and teal light.',
        rarity:
          'rare',
        tokens:
          {
            v,
            canvasBase:
              '#0d1b2e',
            glow1:
              '#568cff',
            glow2:
              '#aa6cff',
            glow3:
              '#34d0bc',
            tint: '#ffffff',
            tintAlpha: 0.08,
            glintStrength: 1,
            text: '#f4f8ff',
            textMuted:
              '#c4d2ea',
            border:
              '#2b3d59',
            accent:
              '#6cc9ff',
            accentFg:
              '#042a41',
            radius: 8,
          },
      },
    ember:
      {
        name: 'Ember',
        description:
          'A warm dark page lit from below, orange and amber.',
        rarity:
          'rare',
        tokens:
          {
            v,
            canvasBase:
              '#1a100c',
            glow1:
              '#ff7a45',
            glow2:
              '#ffb347',
            glow3:
              '#c2410c',
            tint: '#ffffff',
            tintAlpha: 0.07,
            glintStrength: 1,
            text: '#fbf3ee',
            textMuted:
              '#d9c4b8',
            border:
              '#3d2a22',
            accent:
              '#ff9a62',
            accentFg:
              '#2a1206',
            radius: 8,
          },
      },
    lagoon:
      {
        name: 'Lagoon',
        description:
          'Dark teal water with cyan and sea-glass light.',
        rarity:
          'epic',
        tokens:
          {
            v,
            canvasBase:
              '#06191b',
            glow1:
              '#2dd4bf',
            glow2:
              '#38bdf8',
            glow3:
              '#a7f3d0',
            tint: '#ffffff',
            tintAlpha: 0.07,
            glintStrength: 1,
            text: '#effbf9',
            textMuted:
              '#b7d6d2',
            border:
              '#1d3a3c',
            accent:
              '#5eead4',
            accentFg:
              '#03201c',
            radius: 8,
          },
      },
    orchid:
      {
        name: 'Orchid',
        description:
          'Plum night with violet and rose light.',
        rarity:
          'epic',
        tokens:
          {
            v,
            canvasBase:
              '#160b1e',
            glow1:
              '#c084fc',
            glow2:
              '#f472b6',
            glow3:
              '#818cf8',
            tint: '#ffffff',
            tintAlpha: 0.07,
            glintStrength: 1,
            text: '#faf3ff',
            textMuted:
              '#d6c5e3',
            border:
              '#36254a',
            accent:
              '#e2a6ff',
            accentFg:
              '#22092f',
            radius: 8,
          },
      },
    paper:
      {
        name: 'Paper',
        description:
          'A warm cream page with soft peach and sage light.',
        rarity:
          'rare',
        tokens:
          {
            v,
            canvasBase:
              '#f7f2e8',
            glow1:
              '#f4c27a',
            glow2:
              '#e8a598',
            glow3:
              '#a3c9a8',
            tint: '#ffffff',
            tintAlpha: 0.5,
            glintStrength: 1,
            text: '#1f1a14',
            textMuted:
              '#5a5044',
            border:
              '#ddd3c2',
            accent:
              '#8a4b2a',
            accentFg:
              '#ffffff',
            radius: 8,
          },
      },
    mint: {
      name: 'Mint',
      description:
        'A cool pale page with mint, sky and lemon light.',
      rarity:
        'rare',
      tokens:
        {
          v,
          canvasBase:
            '#f0f8f3',
          glow1:
            '#86efac',
          glow2:
            '#67e8f9',
          glow3:
            '#fde68a',
          tint: '#ffffff',
          tintAlpha: 0.5,
          glintStrength: 1,
          text: '#0f2419',
          textMuted:
            '#3e5a4b',
          border:
            '#cde2d5',
          accent:
            '#17643f',
          accentFg:
            '#ffffff',
          radius: 8,
        },
    },
  };

/** True for an applied-theme id that names an official site theme. */
export function isOfficialThemeId(
  id: string,
): boolean {
  return id.startsWith(
    OFFICIAL_ID_PREFIX,
  );
}

/** The official theme an applied id names, or undefined. */
export function officialThemeFor(
  appliedId: string,
):
  | OfficialSiteTheme
  | undefined {
  return isOfficialThemeId(
    appliedId,
  )
    ? OFFICIAL_SITE_THEMES[
        appliedId.slice(
          OFFICIAL_ID_PREFIX.length,
        )
      ]
    : undefined;
}

/** An owned official theme in the shape the theme lists use (Settings › Bought themes, the studio inventory). */
export function officialThemeView(
  id: string,
):
  | UserThemeView
  | undefined {
  const theme =
    OFFICIAL_SITE_THEMES[
      id
    ];
  if (
    !theme
  )
    return undefined;
  return {
    id: `${OFFICIAL_ID_PREFIX}${id}`,
    name: theme.name,
    tokens:
      theme.tokens,
    status:
      'OFFICIAL',
    priceCoins:
      null,
    sales: 0,
    owned: true,
  };
}

/** The store picture for an official theme: its base with its three lights, the same family as the wash. */
export function officialThemePicture(
  tokens: ThemeTokens,
): string {
  return `radial-gradient(70% 90% at 0% 0%, ${tokens.glow1}, transparent 70%), radial-gradient(70% 90% at 100% 0%, ${tokens.glow2}, transparent 70%), radial-gradient(80% 70% at 50% 100%, ${tokens.glow3}, transparent 70%), ${tokens.canvasBase}`;
}
