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

import { THEME_TOKENS_VERSION, type ThemeTokens, type UserThemeView } from '@/lib/themes/tokens';

export const OFFICIAL_ID_PREFIX = 'official:';

export interface OfficialSiteTheme {
  name: string;
  description: string;
  /** A store rarity (lib/shop/catalog.ts `Rarity`), which sets the price. */
  rarity: 'rare' | 'epic' | 'legendary';
  tokens: ThemeTokens;
}

const v = THEME_TOKENS_VERSION;

export const OFFICIAL_SITE_THEMES: Record<string, OfficialSiteTheme> = {
  aurora: {
    name: 'Aurora',
    description: 'Deep navy with blue, violet and teal light.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#0d1b2e',
      glow1: '#568cff',
      glow2: '#aa6cff',
      glow3: '#34d0bc',
      tint: '#ffffff',
      tintAlpha: 0.08,
      glintStrength: 1,
      text: '#f4f8ff',
      textMuted: '#c4d2ea',
      border: '#2b3d59',
      accent: '#6cc9ff',
      accentFg: '#042a41',
      radius: 8,
    },
  },
  ember: {
    name: 'Ember',
    description: 'A warm dark page lit from below, orange and amber.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#1a100c',
      glow1: '#ff7a45',
      glow2: '#ffb347',
      glow3: '#c2410c',
      tint: '#ffffff',
      tintAlpha: 0.07,
      glintStrength: 1,
      text: '#fbf3ee',
      textMuted: '#d9c4b8',
      border: '#3d2a22',
      accent: '#ff9a62',
      accentFg: '#2a1206',
      radius: 8,
    },
  },
  lagoon: {
    name: 'Lagoon',
    description: 'Dark teal water with cyan and sea-glass light.',
    rarity: 'epic',
    tokens: {
      v,
      canvasBase: '#06191b',
      glow1: '#2dd4bf',
      glow2: '#38bdf8',
      glow3: '#a7f3d0',
      tint: '#ffffff',
      tintAlpha: 0.07,
      glintStrength: 1,
      text: '#effbf9',
      textMuted: '#b7d6d2',
      border: '#1d3a3c',
      accent: '#5eead4',
      accentFg: '#03201c',
      radius: 8,
    },
  },
  orchid: {
    name: 'Orchid',
    description: 'Plum night with violet and rose light.',
    rarity: 'epic',
    tokens: {
      v,
      canvasBase: '#160b1e',
      glow1: '#c084fc',
      glow2: '#f472b6',
      glow3: '#818cf8',
      tint: '#ffffff',
      tintAlpha: 0.07,
      glintStrength: 1,
      text: '#faf3ff',
      textMuted: '#d6c5e3',
      border: '#36254a',
      accent: '#e2a6ff',
      accentFg: '#22092f',
      radius: 8,
    },
  },
  paper: {
    name: 'Paper',
    description: 'A warm cream page with soft peach and sage light.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#f7f2e8',
      glow1: '#f4c27a',
      glow2: '#e8a598',
      glow3: '#a3c9a8',
      tint: '#ffffff',
      tintAlpha: 0.5,
      glintStrength: 1,
      text: '#1f1a14',
      textMuted: '#5a5044',
      border: '#ddd3c2',
      accent: '#8a4b2a',
      accentFg: '#ffffff',
      radius: 8,
    },
  },
  mint: {
    name: 'Mint',
    description: 'A cool pale page with mint, sky and lemon light.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#f0f8f3',
      glow1: '#86efac',
      glow2: '#67e8f9',
      glow3: '#fde68a',
      tint: '#ffffff',
      tintAlpha: 0.5,
      glintStrength: 1,
      text: '#0f2419',
      textMuted: '#3e5a4b',
      border: '#cde2d5',
      accent: '#17643f',
      accentFg: '#ffffff',
      radius: 8,
    },
  },
  // Added 2026-11-19 (owner: "inspire them from other websites"). Each borrows the feel of a well-known palette or
  // site look, under its own name and with its own values, held to the same publish gate as the rest.
  fjord: {
    name: 'Fjord',
    description: 'Arctic slate with frost blue and aurora violet.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#2e3440',
      glow1: '#88c0d0',
      glow2: '#81a1c1',
      glow3: '#b48ead',
      tint: '#ffffff',
      tintAlpha: 0.07,
      glintStrength: 1,
      text: '#eceff4',
      textMuted: '#d1d7e2',
      border: '#434c5e',
      accent: '#88c0d0',
      accentFg: '#1f242d',
      radius: 8,
    },
  },
  nocturne: {
    name: 'Nocturne',
    description: 'Midnight grey with violet, pink and cyan neon.',
    rarity: 'epic',
    tokens: {
      v,
      canvasBase: '#282a36',
      glow1: '#bd93f9',
      glow2: '#ff79c6',
      glow3: '#8be9fd',
      tint: '#ffffff',
      tintAlpha: 0.06,
      glintStrength: 1,
      text: '#f8f8f2',
      textMuted: '#c9cbd6',
      border: '#44475a',
      accent: '#bd93f9',
      accentFg: '#1e1f29',
      radius: 8,
    },
  },
  sundial: {
    name: 'Sundial',
    description: 'A sunlit parchment page with gold, teal and blue.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#fdf6e3',
      glow1: '#e2b93b',
      glow2: '#2aa198',
      glow3: '#268bd2',
      tint: '#ffffff',
      tintAlpha: 0.5,
      glintStrength: 1,
      text: '#073642',
      textMuted: '#4f6168',
      border: '#e4dcc4',
      accent: '#1d6a96',
      accentFg: '#ffffff',
      radius: 8,
    },
  },
  campfire: {
    name: 'Campfire',
    description: 'Retro charcoal with amber, orange and olive.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#282828',
      glow1: '#fabd2f',
      glow2: '#fe8019',
      glow3: '#b8bb26',
      tint: '#ffffff',
      tintAlpha: 0.06,
      glintStrength: 1,
      text: '#ebdbb2',
      textMuted: '#c9b99a',
      border: '#3c3836',
      accent: '#fabd2f',
      accentFg: '#282828',
      radius: 8,
    },
  },
  neon: {
    name: 'Neon City',
    description: 'Late-night indigo with electric blue and lilac.',
    rarity: 'epic',
    tokens: {
      v,
      canvasBase: '#1a1b26',
      glow1: '#7aa2f7',
      glow2: '#bb9af7',
      glow3: '#7dcfff',
      tint: '#ffffff',
      tintAlpha: 0.06,
      glintStrength: 1,
      text: '#c8d0f5',
      textMuted: '#a9b1d6',
      border: '#2a2f45',
      accent: '#7aa2f7',
      accentFg: '#14151f',
      radius: 8,
    },
  },
  latte: {
    name: 'Latte',
    description: 'A soft pastel page with mauve, pink and sky.',
    rarity: 'epic',
    tokens: {
      v,
      canvasBase: '#eff1f5',
      glow1: '#c6a0f6',
      glow2: '#ea76cb',
      glow3: '#7dc4e4',
      tint: '#ffffff',
      tintAlpha: 0.5,
      glintStrength: 1,
      text: '#3a3d55',
      textMuted: '#55586f',
      border: '#ccd0da',
      accent: '#7029d6',
      accentFg: '#ffffff',
      radius: 8,
    },
  },
  arcade: {
    name: 'Arcade',
    description: 'Olive-black with hot pink, lime and cyan.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#272822',
      glow1: '#f92672',
      glow2: '#a6e22e',
      glow3: '#66d9ef',
      tint: '#ffffff',
      tintAlpha: 0.06,
      glintStrength: 1,
      text: '#f8f8f2',
      textMuted: '#cfcfc2',
      border: '#3e3d32',
      accent: '#a6e22e',
      accentFg: '#1b1c17',
      radius: 8,
    },
  },
  phosphor: {
    name: 'Phosphor',
    description: 'An old green-screen terminal, glowing in the dark.',
    rarity: 'legendary',
    tokens: {
      v,
      canvasBase: '#0a0f0a',
      glow1: '#33ff66',
      glow2: '#00cc44',
      glow3: '#99ffbb',
      tint: '#ffffff',
      tintAlpha: 0.05,
      glintStrength: 1,
      text: '#c8ffd4',
      textMuted: '#8fd9a0',
      border: '#1c2b1f',
      accent: '#33ff66',
      accentFg: '#04140a',
      radius: 8,
    },
  },
  newsprint: {
    name: 'Newsprint',
    description: 'Off-white link-news paper with a safety-orange edge.',
    rarity: 'rare',
    tokens: {
      v,
      canvasBase: '#f6f6ef',
      glow1: '#ff8a3d',
      glow2: '#ffc285',
      glow3: '#e0d6b8',
      tint: '#ffffff',
      tintAlpha: 0.5,
      glintStrength: 1,
      text: '#1c1c1c',
      textMuted: '#5c5c55',
      border: '#e2e2d6',
      accent: '#a84300',
      accentFg: '#ffffff',
      radius: 8,
    },
  },
  sunset: {
    name: 'Sunset Drive',
    description: 'Synthwave dusk with magenta, orange and violet.',
    rarity: 'legendary',
    tokens: {
      v,
      canvasBase: '#1b0f2e',
      glow1: '#ff2e88',
      glow2: '#ff9e3d',
      glow3: '#7b2fff',
      tint: '#ffffff',
      tintAlpha: 0.07,
      glintStrength: 1,
      text: '#fff0fb',
      textMuted: '#dcc3e8',
      border: '#3a2456',
      accent: '#ff6fae',
      accentFg: '#2a0718',
      radius: 8,
    },
  },
};

/** True for an applied-theme id that names an official site theme. */
export function isOfficialThemeId(id: string): boolean {
  return id.startsWith(OFFICIAL_ID_PREFIX);
}

/** The official theme an applied id names, or undefined. */
export function officialThemeFor(appliedId: string): OfficialSiteTheme | undefined {
  return isOfficialThemeId(appliedId) ? OFFICIAL_SITE_THEMES[appliedId.slice(OFFICIAL_ID_PREFIX.length)] : undefined;
}

/** An owned official theme in the shape the theme lists use (Settings › Bought themes, the studio inventory). */
export function officialThemeView(id: string): UserThemeView | undefined {
  const theme = OFFICIAL_SITE_THEMES[id];
  if (!theme) return undefined;
  return {
    id: `${OFFICIAL_ID_PREFIX}${id}`,
    name: theme.name,
    tokens: theme.tokens,
    status: 'OFFICIAL',
    priceCoins: null,
    sales: 0,
    owned: true,
  };
}

/** The store picture for an official theme: its base with its three lights, the same family as the wash. */
export function officialThemePicture(tokens: ThemeTokens): string {
  return `radial-gradient(70% 90% at 0% 0%, ${tokens.glow1}, transparent 70%), radial-gradient(70% 90% at 100% 0%, ${tokens.glow2}, transparent 70%), radial-gradient(80% 70% at 50% 100%, ${tokens.glow3}, transparent 70%), ${tokens.canvasBase}`;
}
