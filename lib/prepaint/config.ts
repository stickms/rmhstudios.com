/**
 * The DATA half of the pre-paint script: everything that varies per request or
 * per catalog, serialized into one `<script type="application/json"
 * id="rmh-prepaint">` block that precedes the (single, static) generated code.
 *
 * Why data and not code: the code string must be identical on every request so
 * it can be hashed once for the CSP (redesign audit F5) and cached as bytes.
 * A JSON block is never executed, so it needs no hash.
 *
 * Variants carried here, none of which change the code:
 *  - `nf`      a GLOBAL 404 (the root's `notFoundComponent`): a site page whatever
 *              the URL, so `/slice-it/player/<nobody>` does not pre-paint an app
 *              ground under the site's `NotFound` card;
 *  - `discord` the Discord Activity head, which never ran the media-reveal and
 *              cookie-consent steps;
 *  - `seed`    a signed-in account's saved appearance (lib/appearance/account-seed.ts);
 *  - `theme`   the theme→ground and route tables from stores/themeStore.ts and
 *              ./theme-routes.ts (too heavy to bundle: they pull in the game and
 *              app catalogs and zustand).
 */
import { APP_ROUTE_THEME_BG, APP_THEME_BG, DEFAULT_STYLE, THEME_BG } from '@/stores/themeStore';
import { PREPAINT_BODY_CODE, PREPAINT_CODE } from './generated';
import { THEME_EXCLUDED_EXCEPTIONS, THEME_EXCLUDED_ROUTES } from './theme-routes';
import type { PrepaintConfig } from './types';

export const PREPAINT_CONFIG_ID = 'rmh-prepaint';

export interface PrepaintVariant {
  /** Rendering a global 404. */
  notFound?: boolean;
  /** Rendering the minimal Discord Activity head. */
  discord?: boolean;
  /** The signed-in account's appearance seed, if any. */
  seed?: Record<string, string | null> | null;
}

export function buildPrepaintConfig(v: PrepaintVariant = {}): PrepaintConfig {
  const cfg: PrepaintConfig = {
    theme: {
      bg: THEME_BG,
      appBg: APP_THEME_BG,
      routeBg: APP_ROUTE_THEME_BG,
      defaultStyle: DEFAULT_STYLE,
      excluded: THEME_EXCLUDED_ROUTES,
      exceptions: THEME_EXCLUDED_EXCEPTIONS,
    },
  };
  if (v.notFound) cfg.nf = true;
  if (v.discord) cfg.discord = true;
  if (v.seed && Object.keys(v.seed).length) cfg.seed = v.seed;
  return cfg;
}

/** Serialize for a `<script type="application/json">` body: `<` is escaped so no value can close the tag. */
export function serializePrepaintConfig(cfg: PrepaintConfig): string {
  return JSON.stringify(cfg).replace(/</g, '\\u003c');
}

/**
 * The head `scripts` entries for the pre-paint stack: the data block, then the
 * one generated script. Order is load-bearing — the code reads the block.
 */
export function prepaintHeadScripts(v: PrepaintVariant = {}) {
  return [
    {
      type: 'application/json',
      id: PREPAINT_CONFIG_ID,
      children: serializePrepaintConfig(buildPrepaintConfig(v)),
    },
    { children: PREPAINT_CODE },
  ];
}

/** The `<body>`-top script (see ./body.ts). */
export const PREPAINT_BODY_SCRIPT = PREPAINT_BODY_CODE;
