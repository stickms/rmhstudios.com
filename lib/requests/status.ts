/**
 * Request-board status vocabulary and the one rule that makes the board work
 * socially (F22).
 *
 * Client-safe on purpose: the status list drives the board's filter chips and
 * the admin composer as well as the service layer, and re-exporting the Prisma
 * enum would drag `@prisma/client` into the browser bundle (same reasoning as
 * `lib/activity/types.ts`). `assertRequestStatusValid` is the shared guard, so
 * the UI can disable "Decline" until a note is typed using the *same* predicate
 * the server refuses on — rather than a second, drifting copy of the rule.
 */

/** Mirrors `enum RequestStatus` in `prisma/schema.prisma`. */
export const REQUEST_STATUSES = ['OPEN', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

/**
 * The statuses that CANNOT be set without an official reply.
 *
 * This is the whole thesis of the feature. A board where requests quietly rot
 * in `OPEN`, or get closed with a bare "declined" and no reason, is worse than
 * no board at all: it converts hope into resentment, and it teaches people that
 * filing is pointless — after which the same request arrives fifty more times
 * through support instead.
 *
 * Postgres cannot express "NOT NULL when the status is one of these two", so
 * the invariant has to live in the service layer. It lives *here*, as a pure
 * predicate, so it is testable without a database and so no second call site
 * can implement a looser version of it.
 */
export const STATUSES_REQUIRING_NOTE: readonly RequestStatus[] = ['SHIPPED', 'DECLINED'];

export function statusRequiresNote(status: RequestStatus): boolean {
  return STATUSES_REQUIRING_NOTE.includes(status);
}

/** `officialNote` is `@db.Text`, but an essay in a status chip helps nobody. */
export const OFFICIAL_NOTE_MIN = 10;
export const OFFICIAL_NOTE_MAX = 2_000;

export const REQUEST_TITLE_MIN = 6;
export const REQUEST_TITLE_MAX = 120;
export const REQUEST_BODY_MIN = 10;
export const REQUEST_BODY_MAX = 4_000;

export type StatusValidationError =
  /** `SHIPPED` / `DECLINED` with no note at all. */
  | 'NOTE_REQUIRED'
  /** A note that is present but too thin to be a reply ("no", "wontfix"). */
  | 'NOTE_TOO_SHORT'
  | 'NOTE_TOO_LONG';

/**
 * Validate a (status, note) pair. Returns `null` when the pair is allowed.
 *
 * `note` is normalised before length checks — a note of ten spaces is not a
 * reply, and the trimmed form is what gets stored anyway.
 */
export function validateStatusNote(
  status: RequestStatus,
  note: string | null | undefined,
): StatusValidationError | null {
  const trimmed = (note ?? '').trim();
  if (trimmed.length > OFFICIAL_NOTE_MAX) return 'NOTE_TOO_LONG';
  if (!statusRequiresNote(status)) return null;
  if (trimmed.length === 0) return 'NOTE_REQUIRED';
  if (trimmed.length < OFFICIAL_NOTE_MIN) return 'NOTE_TOO_SHORT';
  return null;
}

/** Human-readable reason for a rejected status change (English source string). */
export const STATUS_ERROR_MESSAGE: Record<StatusValidationError, string> = {
  NOTE_REQUIRED: 'Shipped and declined requests need an official reply.',
  NOTE_TOO_SHORT: `An official reply must be at least ${OFFICIAL_NOTE_MIN} characters.`,
  NOTE_TOO_LONG: `An official reply must be at most ${OFFICIAL_NOTE_MAX} characters.`,
};

/**
 * Whether a request is still accepting votes.
 *
 * Resolved requests keep their score (it is the record of how much people
 * wanted the thing) but stop accumulating — a vote on a shipped feature is not
 * a signal anyone can act on.
 */
export function isVotable(request: {
  status: RequestStatus;
  mergedIntoId: string | null;
}): boolean {
  if (request.mergedIntoId) return false;
  return request.status !== 'SHIPPED' && request.status !== 'DECLINED';
}

/** Sort orders the board offers. `top` is the default — it is the point. */
export const REQUEST_SORTS = ['top', 'new', 'status'] as const;
export type RequestSort = (typeof REQUEST_SORTS)[number];
