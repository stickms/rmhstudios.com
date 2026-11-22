/**
 * Emission of the game webhook events. Each function is fire-and-forget: a
 * webhook problem (a bad payload, a failed lookup) is logged and never reaches
 * the score submission or the achievement grant that produced the event.
 */
import { emitWebhookEvent } from '@/lib/webhooks/emit.server';
import {
  ACHIEVEMENT_EVENT,
  PERSONAL_BEST_EVENT,
  buildAchievementData,
  buildPersonalBestData,
} from '@/lib/webhooks/game-events';

export async function emitPersonalBestCreated(
  userId: string,
  input: {
    gameId: string;
    score: number;
    previous: number | null | undefined;
  },
): Promise<void> {
  try {
    await emitWebhookEvent(userId, PERSONAL_BEST_EVENT, buildPersonalBestData(input));
  } catch (e) {
    console.error('[webhooks] personal best emit failed:', (e as Error).message);
  }
}

export async function emitAchievementUnlocked(
  userId: string,
  input: {
    achievementId: string;
    name: string;
    group?: string | undefined;
  },
): Promise<void> {
  try {
    await emitWebhookEvent(userId, ACHIEVEMENT_EVENT, buildAchievementData(input));
  } catch (e) {
    console.error('[webhooks] achievement emit failed:', (e as Error).message);
  }
}
