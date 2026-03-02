/**
 * Emoji Cinema — Twemoji URL Utility
 *
 * Converts native emoji strings to Twemoji CDN PNG URLs using twemoji-parser.
 * Provides reliable cross-platform emoji rendering for all Unicode emojis,
 * including ZWJ sequences, skin tone modifiers, and flag emojis.
 */

import { parse as parseTwemoji } from 'twemoji-parser';

/**
 * Get the Twemoji PNG URL for a native emoji string.
 * Returns null if the emoji cannot be parsed by twemoji-parser.
 */
export function getEmojiUrl(emoji: string): string | null {
  const parsed = parseTwemoji(emoji, {
    buildUrl: (codepoints: string) =>
      `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoints}.png`,
  });
  return parsed.length > 0 ? parsed[0].url : null;
}
