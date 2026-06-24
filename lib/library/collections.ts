/**
 * RMH Studios — Library collections ("series"), shared types (client-safe).
 *
 * A collection is a reader-made grouping of books shown as its own shelf on the
 * library page. Members are referenced by stable book slug so a collection can mix
 * static-catalog and uploaded books. Ownership: a user owns the collections they
 * create and may only add books they uploaded; admins own "official" collections
 * and may add any book.
 *
 * Pure (no Prisma/secrets) so it's safe to import from the page and the server.
 */
import type { LibraryBook } from './library';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;

/** A collection resolved for display: metadata + its ordered member books. */
export type CollectionView = {
  id: string;
  slug: string;
  title: string;
  description: string;
  official: boolean;
  ownerUserId: string | null;
  owner: { handle: string | null; name: string | null } | null;
  /** Ordered, resolved member books (unresolvable slugs are dropped). */
  books: LibraryBook[];
  /** Whether the current viewer may rename/delete/add to this collection. */
  canEdit: boolean;
};

export type CollectionFieldResult = { ok: true; title: string; description: string } | { ok: false; error: string };

/** Validate + normalise a collection's title/description. */
export function validateCollectionFields(input: { title: string; description?: string }): CollectionFieldResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'A title is required.' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` };
  const description = (input.description ?? '').trim();
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` };
  }
  return { ok: true, title, description };
}

/** Max collections a single (non-admin) user may own. */
export const COLLECTION_USER_QUOTA = 30;
/** Max books in a single collection. */
export const COLLECTION_ITEM_CAP = 500;
