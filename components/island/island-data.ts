/**
 * The data block an island document carries (redesign audit B1).
 *
 * The server (`lib/islands/document.server.ts`) resolves what the site's root
 * loader would have — who is signed in, which catalog title this page is — and
 * serializes it into one `<script type="application/json">` block; the island
 * reads it once at mount. That keeps the session seed and the catalog (which
 * imports every game and app entry) out of the island bundle.
 *
 * Plain data, no React: imported by the server document and by the island.
 */
import type { CachedSessionUser } from '@/components/session/session-context';
import type { CatalogRoute } from '@/lib/games/route-match';
import type { LocaleBundle } from '@/lib/i18n/resources';

export const ISLAND_DATA_ID = 'rmh-island';
/** The element the island mounts into; holds the loading frame until it does. */
export const ISLAND_ROOT_ID = 'island-root';

export interface IslandData {
  /** The feature id (`features/<id>/`). */
  id: string;
  /** The catalog title this page is, for Recents and the playtime heartbeat. */
  catalog: CatalogRoute | null;
  /** The signed-in user the server resolved from the cookie, if any. */
  user: CachedSessionUser | null;
  /** Whether the server's session lookup gave an answer (false = failed or timed out). */
  sessionResolved: boolean;
  /**
   * The active locale's catalogs for the island's own namespaces (non-en only;
   * English renders from each call's defaultValue), so the first render is
   * already in the reader's language. Other namespaces load on demand.
   */
  resources: LocaleBundle | null;
}

/** Serialize for a `<script type="application/json">` body: `<` is escaped so no value can close the tag. */
export function serializeIslandData(data: IslandData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Read the block the server rendered. A missing or unreadable one is an unknown session, not a crash. */
export function readIslandData(doc: Document = document): IslandData {
  try {
    const raw = doc.getElementById(ISLAND_DATA_ID)?.textContent;
    if (raw) return JSON.parse(raw) as IslandData;
  } catch {
    // fall through to the unknown-session default
  }
  return { id: '', catalog: null, user: null, sessionResolved: false, resources: null };
}
