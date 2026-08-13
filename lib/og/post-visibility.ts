/**
 * The one rule that decides whether a post's card may show the post.
 *
 * A card route is public and uncredentialed: whatever it draws is readable by
 * anyone holding the post's id, with no session, no follow, and no unlock. That
 * makes it the widest surface the post has, and the four conditions below are
 * the ones under which it must show nothing but the author and the counts:
 *
 * - **deleted** — the post is gone; an unfurl is not where it comes back;
 * - **not `PUBLIC`** — a followers-only or private post has an audience, and a
 *   link preview is not in it;
 * - **priced** — a paid unlock that a crawler can read for free is not a paid
 *   unlock;
 * - **sensitive** — a content warning exists precisely to gate the surface that
 *   shows content without being asked, which is exactly what an unfurl is.
 *
 * It lives in its own client-safe module, apart from the renderers, because it
 * is now consulted by three routes (the landscape card, the story card and the
 * post page's own head) and this class of check is the one that must not be
 * re-typed per caller — the landscape card gained attachment rendering, and
 * "the images are hidden under the same rule as the text" is only true if there
 * is one rule.
 */

/** The fields the decision reads. Deliberately loose so any select satisfies it. */
export interface PostCardSubject {
  deletedAt?: Date | string | null;
  audience?: string | null;
  unlockPrice?: number | null;
  isSensitive?: boolean | null;
}

/**
 * Whether a card for this post may render its content — the text, the poll, and
 * the attached images.
 *
 * A missing post answers `false`: the card route renders a generic branded card
 * for an id that does not resolve, and "no post" must not be the one input that
 * opens the gate.
 */
export function postCardShowsContent(post: PostCardSubject | null | undefined): boolean {
  if (!post) return false;
  if (post.deletedAt) return false;
  if (post.audience !== 'PUBLIC') return false;
  if ((post.unlockPrice ?? 0) > 0) return false;
  if (post.isSensitive) return false;
  return true;
}
