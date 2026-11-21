/**
 * Written feedback on jam entries, the pure half (s06-07): the length limits, who may read and flag it, the
 * notification batching window, the payload shape (anonymity is applied here, on the server, before anything is
 * sent) and the refusal codes. Client-safe: no Prisma, no server imports.
 */

/** Feedback is 20 to 1 000 characters once trimmed; an empty box means "no feedback". */
export const FEEDBACK_MIN = 20;
export const FEEDBACK_MAX = 1000;

/** The team hears about new feedback on an entry at most once per this window (an hour). */
export const FEEDBACK_NOTIFY_WINDOW_MS = 3_600_000;

/** How many pieces one list read returns. */
export const FEEDBACK_LIST_CAP = 200;

/** The entity type used by the report flow and the notification (`jam_feedback` is the notification's). */
export const FEEDBACK_REPORT_TYPE = 'jam-feedback';

/** Every read path that shows feedback text or its author; a source-scan test holds that each applies the team gate. */
export const JAM_FEEDBACK_READ_PATHS = [
  'lib/competitive/jam-feedback.server.ts',
  'lib/competitive/jams.server.ts',
  'lib/moderation/triage.server.ts',
] as const;

/** What the rating request carries about feedback, normalised. */
export type FeedbackIntent =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: 'text'; body: string }
  | { kind: 'invalid'; reason: 'too-short' | 'too-long' };

/** `undefined` leaves any feedback as it is; an empty (or blank) string withdraws it; otherwise the text is checked. */
export function feedbackIntent(raw: string | null | undefined): FeedbackIntent {
  if (raw === undefined) return { kind: 'none' };
  const body = (raw ?? '').trim();
  if (body.length === 0) return { kind: 'clear' };
  if (body.length < FEEDBACK_MIN) return { kind: 'invalid', reason: 'too-short' };
  if (body.length > FEEDBACK_MAX) return { kind: 'invalid', reason: 'too-long' };
  return { kind: 'text', body };
}

/** What a viewer is to an entry's feedback. `rater` is somebody reading their own words. */
export type FeedbackViewer = 'owner' | 'teammate' | 'admin' | 'rater' | 'other';

export function feedbackViewer(input: {
  ownerId: string;
  acceptedIds: readonly string[];
  viewerId: string | null;
  isAdmin: boolean;
}): FeedbackViewer {
  if (input.viewerId && input.viewerId === input.ownerId) return 'owner';
  if (input.viewerId && input.acceptedIds.includes(input.viewerId)) return 'teammate';
  if (input.isAdmin) return 'admin';
  return input.viewerId ? 'rater' : 'other';
}

/** The visibility matrix: the team and admins read the list; a rater reads only their own (not through the list). */
export const mayListFeedback = (v: FeedbackViewer): boolean => v === 'owner' || v === 'teammate' || v === 'admin';

/** Only the team marks a piece Helpful. */
export const mayMarkHelpful = (v: FeedbackViewer): boolean => v === 'owner' || v === 'teammate';

/** Only an admin sees the author of an anonymous piece. */
export const mayRevealAuthor = (v: FeedbackViewer): boolean => v === 'admin';

/** Whether the team is due another notification: never told, or last told a full window ago. */
export function notifyDue(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt === null || now.getTime() - lastNotifiedAt.getTime() >= FEEDBACK_NOTIFY_WINDOW_MS;
}

export interface FeedbackAuthorDTO {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/** One piece of feedback as the team (or an admin) reads it. `author` is null for an anonymous piece. */
export interface FeedbackDTO {
  id: string;
  body: string;
  anonymous: boolean;
  createdAt: string;
  helpful: boolean;
  author: FeedbackAuthorDTO | null;
}

/** What a rater reads about their own feedback on an entry. */
export interface MyFeedbackDTO {
  body: string;
  anonymous: boolean;
  helpful: boolean;
}

/**
 * The payload shape. The author is dropped here for an anonymous piece unless the viewer is an admin, so no
 * layer above has to remember to hide it.
 */
export function shapeFeedback(
  row: {
    id: string;
    body: string;
    anonymous: boolean;
    createdAt: Date;
    helpfulAt: Date | null;
    author: FeedbackAuthorDTO;
  },
  viewer: FeedbackViewer,
): FeedbackDTO {
  const reveal = !row.anonymous || mayRevealAuthor(viewer);
  return {
    id: row.id,
    body: row.body,
    anonymous: row.anonymous,
    createdAt: row.createdAt.toISOString(),
    helpful: row.helpfulAt !== null,
    author: reveal
      ? { id: row.author.id, name: row.author.name, handle: row.author.handle, image: row.author.image }
      : null,
  };
}

export type FeedbackRefusal =
  | 'not-found'
  | 'forbidden'
  | 'closed'
  | 'own-entry'
  | 'blocked'
  | 'banned'
  | 'invalid';

export function feedbackRefusalStatus(code: FeedbackRefusal): number {
  switch (code) {
    case 'not-found':
      return 404;
    case 'forbidden':
    case 'own-entry':
    case 'blocked':
    case 'banned':
      return 403;
    case 'closed':
      return 409;
    default:
      return 400;
  }
}

/** The report's detail text with the reported words attached, within the report column's 1 000 characters. */
export function reportDetailsWithSnapshot(details: string | null | undefined, body: string): string {
  const own = (details ?? '').trim().slice(0, 400);
  const snap = `Reported text: ${body}`;
  return (own ? `${own}\n\n${snap}` : snap).slice(0, 1000);
}
