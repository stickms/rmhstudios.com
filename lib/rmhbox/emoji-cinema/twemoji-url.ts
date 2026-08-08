/**
 * Emoji Cinema — Twemoji URL Utility
 *
 * Converts native emoji strings to Twemoji CDN PNG URLs.
 *
 * This used to call `twemoji-parser`, a separate package that Twitter archived
 * in 2022 — so the app shipped two Twemoji libraries, the archived one purely
 * for this helper. `@twemoji/api` (v17, maintained, already a dependency for
 * `components/ui/TwemojiProvider.tsx`) does the same codepoint normalisation:
 * both are Twitter's own implementation of the ZWJ-sequence, skin-tone and
 * variation-selector rules, so the filenames resolve identically.
 *
 * The base URL now comes from the package default rather than the hardcoded
 * `gh/twitter/twemoji@latest` path this file used before. That path pinned
 * `@latest` on an ARCHIVED repository, which is frozen by definition; the v17
 * default tracks the assets the package actually ships against — the same base
 * TwemojiProvider renders the rest of the site's emoji from.
 *
 * Static import, not dynamic: this module is only ever reached from the
 * emoji-cinema minigame, which is itself lazily loaded, so `@twemoji/api` lands
 * in that route's chunk and never in the entry closure. That is what
 * `scripts/check-entry-composition.ts` guards.
 */

import twemoji from '@twemoji/api';
import type { ParseCallback } from '@twemoji/api';

/**
 * Get the Twemoji PNG URL for a native emoji string.
 * Returns null if the emoji cannot be parsed.
 *
 * `twemoji.parse` is the public API for resolving an emoji to its asset, but it
 * returns marked-up HTML rather than a URL. The callback is where the resolved
 * codepoint surfaces, so it captures the URL and then returns `false` — which
 * tells twemoji to skip the replacement, so no HTML is built and no string is
 * thrown away.
 */
export function getEmojiUrl(emoji: string): string | null {
  let url: string | null = null;

  const capture: ParseCallback = (icon, options) => {
    const o = options as { base: string; size: string; ext: string };
    url ??= `${o.base}${o.size}/${icon}${o.ext}`;
    return false;
  };

  twemoji.parse(emoji, { folder: '72x72', ext: '.png', callback: capture });

  return url;
}
