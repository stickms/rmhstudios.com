/** Layout width constants for the center column and right sidebar. */

export const DEFAULT_WIDTH = 648;
export const WIDE_WIDTH = 800;

/**
 * The right context rail is sized to match the LEFT navigation rail exactly, so
 * the two flanks of the sidebar / content / sidebar layout are always identical
 * and the reading column stays optically centred. The actual pixel value is the
 * responsive `--site-rail-width` token (80 → 252 → 276 across breakpoints, set
 * in components/feed/feed.css); reference it rather than a fixed number.
 */
export const RIGHT_SIDEBAR_WIDTH = 'var(--site-rail-width)';

/** Trailing gutter reserved on wide, space-filling pages that have no rail. */
export const RIGHT_SIDEBAR_RIGHT_PADDING = 16;

/**
 * Center width for `wide` pages that intentionally have NO right rail (grid-heavy
 * pages like Builds): the reading column absorbs the rail's footprint, leaving
 * only a slim trailing gutter. Uses the widest rail value (276) as the constant
 * so the number stays stable regardless of the runtime token.
 */
export const WIDE_NO_RIGHT_SIDEBAR_WIDTH = DEFAULT_WIDTH + 276 - RIGHT_SIDEBAR_RIGHT_PADDING;
