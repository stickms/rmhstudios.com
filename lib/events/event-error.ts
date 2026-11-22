/** Domain error with a stable `code` the API layer maps to an HTTP status. */
export class EventError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_DATES'
      | 'INVALID_VENUE_URL'
      | 'CAPACITY_FULL'
      | 'WAITLIST_CLOSED'
      | 'WAITLIST_FULL'
      | 'CANCELED'
      | 'INVALID_RECURRENCE'
      | 'OCCURRENCE_SKIPPED'
      | 'COMMUNITY_SANCTIONED',
    /** COMMUNITY_SANCTIONED only: the member's ban or timeout (never its private reason). */
    public readonly sanction?: { kind: 'ban' | 'timeout'; endsAt: Date | null },
  ) {
    super(code);
    this.name = 'EventError';
  }
}
