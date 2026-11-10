/**
 * Shared types for the pre-paint script (see `./index.ts`).
 *
 * The script is ONE generated bundle (`./generated.ts`), identical on every
 * request. What varies per request or per catalog is DATA in a
 * `<script type="application/json" id="rmh-prepaint">` block that precedes it,
 * parsed into {@link PrepaintConfig}.
 */

/** One `APP_ROUTE_THEME_BG` entry (stores/themeStore.ts documents the fields). */
export interface AppRouteGround {
  key: string;
  darkFlag: string;
  darkWhen?: string;
  dark: string;
  light: string;
  defaultDark?: boolean;
  system?: boolean;
}

/** The theme tables derived from the catalogs / theme store (too heavy to bundle). */
export interface PrepaintTheme {
  /** theme id → document background (`THEME_BG`) */
  bg: Record<string, string>;
  /** neutral ground for excluded (app/game) routes (`APP_THEME_BG`) */
  appBg: string;
  /** per-page grounds (`APP_ROUTE_THEME_BG`) */
  routeBg: Record<string, AppRouteGround>;
  /** `DEFAULT_STYLE` */
  defaultStyle: string;
  /** `THEME_EXCLUDED_ROUTES` */
  excluded: string[];
  /** `THEME_EXCLUDED_EXCEPTIONS` */
  exceptions: string[];
}

export interface PrepaintConfig {
  /** Discord Activity head: skip the media-reveal and cookie-consent steps (as that head always did). */
  discord?: boolean;
  /** Global 404: a site page whatever the URL, so the app tier never applies. */
  nf?: boolean;
  /** Signed-in account appearance as localStorage writes (null = remove). */
  seed?: Record<string, string | null>;
  theme?: PrepaintTheme;
}

export interface PrepaintCtx {
  doc: Document;
  html: HTMLElement;
  win: Window;
  nav: Navigator;
  path: string;
  cfg: PrepaintConfig;
}
