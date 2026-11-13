/**
 * Pure helpers for the wiki page editor (`components/admin/wiki/WikiEditor.tsx`).
 * Client-safe; kept out of the component so they can be tested without a DOM.
 */

/** Mirrors `wikiPath` in `./wiki-schema.ts`, for the inline hint before a save. */
const PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export function isWikiPath(path: string): boolean {
  return path.length <= 200 && PATH.test(path);
}

/** A page path suggested from its title: "Battle Pass Guide" becomes "battle-pass-guide". */
export function slugifyWikiTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    // Drop the accents NFKD split off, or "é" would become "e-".
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "a, b ,, c" becomes ["a", "b", "c"]; duplicates are dropped. */
export function parseWikiTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}
