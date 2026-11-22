/** Tournament failures with a code and HTTP status. Its own module so seeding.server and tournament.server need not import each other. */
export class TournamentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
    /** Numbers the client words itself (a refused start reports `checkedIn` and `needed`). */
    public readonly details?: Record<string, number>,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}
