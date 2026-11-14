/**
 * Pure helpers for the wiki page editor (`components/admin/wiki/WikiEditor.tsx`).
 * Client-safe; kept out of the component so they can be tested without a DOM.
 */

/** Characters MediaWiki never allows in a title (it would read them as link or template syntax). */
const FORBIDDEN = /[#<>[\]|{}]/;

/** True when the title has none of MediaWiki's forbidden characters, control characters included. */
export function hasOnlyTitleCharacters(title: string): boolean {
  if (FORBIDDEN.test(title)) return false;
  for (const char of title) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Mirrors `wikiTitle` in `./wiki-schema.ts`, for the inline hint before a save. */
export function isWikiTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= 255 && hasOnlyTitleCharacters(trimmed);
}

/**
 * A page's address on the wiki: `/wiki/` and the title with spaces as
 * underscores, the way MediaWiki writes its own links. Slashes (sub-pages) and
 * colons stay readable; everything else is percent-encoded.
 */
export function wikiPageUrl(publicUrl: string, title: string): string {
  const path = encodeURIComponent(title.trim().replaceAll(' ', '_'))
    .replaceAll('%2F', '/')
    .replaceAll('%3A', ':');
  return `${publicUrl}/wiki/${path}`;
}
