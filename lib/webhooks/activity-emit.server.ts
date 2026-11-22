/**
 * Emission of the activity webhook events. Every function is fire-and-forget: a
 * webhook problem (a failed lookup, a failed queue) is logged and never reaches
 * the release, RSVP, shelf, highlight or match settlement that produced it.
 * Callers invoke these only after the action's transaction has committed.
 */
import { emitWebhookEvent } from '@/lib/webhooks/emit.server';
import {
  BUILD_RELEASED_EVENT,
  EVENT_RSVP_CHANGED_EVENT,
  HIGHLIGHT_CREATED_EVENT,
  MATCH_SETTLED_EVENT,
  READING_FINISHED_EVENT,
  buildHighlightCreatedData,
  buildMatchSettledData,
  buildReadingFinishedData,
  buildReleaseData,
  buildRsvpData,
} from '@/lib/webhooks/activity-events';

/** The one place an activity emit is queued; never throws. */
export async function emitActivity(userId: string, event: string, build: () => Record<string, unknown>): Promise<void> {
  try {
    await emitWebhookEvent(userId, event, build());
  } catch (e) {
    console.error(`[webhooks] ${event} emit failed:`, (e as Error).message);
  }
}

export const emitBuildReleased = (userId: string, input: Parameters<typeof buildReleaseData>[0]) =>
  emitActivity(userId, BUILD_RELEASED_EVENT, () => buildReleaseData(input));

export const emitRsvpChanged = (userId: string, input: Parameters<typeof buildRsvpData>[0]) =>
  emitActivity(userId, EVENT_RSVP_CHANGED_EVENT, () => buildRsvpData(input));

export const emitReadingFinished = (userId: string, input: Parameters<typeof buildReadingFinishedData>[0]) =>
  emitActivity(userId, READING_FINISHED_EVENT, () => buildReadingFinishedData(input));

export const emitHighlightCreated = (userId: string, input: Parameters<typeof buildHighlightCreatedData>[0]) =>
  emitActivity(userId, HIGHLIGHT_CREATED_EVENT, () => buildHighlightCreatedData(input));

interface EntrantReader {
  tournamentEntrant: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; userId: true };
    }) => Promise<Array<{ id: string; userId: string }>>;
  };
}

/**
 * One `tournament.match_settled` per player, each to that player's own
 * endpoints with their own result. Entrants map to members through rows read
 * here, after the commit. A bye (no loser) emits nothing.
 */
export async function emitMatchSettled(
  db: unknown,
  input: {
    tournamentId: string;
    matchId: string;
    round: number;
    winnerEntrantId: string;
    loserEntrantId: string | null;
    settledAt: Date;
  },
): Promise<void> {
  try {
    if (!input.loserEntrantId) return;
    const rows = await (db as EntrantReader).tournamentEntrant.findMany({
      where: { id: { in: [input.winnerEntrantId, input.loserEntrantId] } },
      select: { id: true, userId: true },
    });
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const result = row.id === input.winnerEntrantId ? 'won' : 'lost';
      await emitActivity(row.userId, MATCH_SETTLED_EVENT, () =>
        buildMatchSettledData({
          tournamentId: input.tournamentId,
          matchId: input.matchId,
          round: input.round,
          result,
          settledAt: input.settledAt,
        }),
      );
    }
  } catch (e) {
    console.error('[webhooks] tournament.match_settled emit failed:', (e as Error).message);
  }
}
