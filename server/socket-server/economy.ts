/**
 * App progression awards for the realtime hub (best-effort, fire-and-forget).
 *
 * The web tier's canonical engines (`lib/xp/engine.server`,
 * `lib/quests/engine.server`) run against the web Prisma singleton and pull in
 * the notification/achievement stack. The socket hub is a separate process with
 * its own Prisma client and a strict "never block gameplay on DB" rule
 * (`server/CLAUDE.md` §Gotchas 4), so we mirror the *essential* progression here
 * against the hub's client: lifetime XP, current-season XP (battle pass), and
 * quest progress. It reuses the pure, shared definitions (`CURRENT_SEASON`,
 * `QUESTS`, `periodKeyFor`) so thresholds never drift from the web tier.
 *
 * Intentional limitation: level-up notifications and level-milestone
 * achievements are left to the web tier's `awardXp` — playing a hub app still
 * counts toward level/season/quests, it just doesn't fire a toast from here.
 *
 * Anti-farm: reward is capped per user with an in-memory cooldown. The hub is
 * single-instance by design (`server/CLAUDE.md` §Gotchas 1), so a module-level
 * map is the right tool — the same pattern all hub state uses.
 */

import { getPrismaClient } from './prisma-client';
import { logger } from './logger';
import { CURRENT_SEASON } from '../../lib/battlepass/season';
import { QUESTS, periodKeyFor, type QuestType } from '../../lib/quests/catalog';

/** userId -> earliest epoch-ms at which the next reward may be granted. */
const rewardCooldown = new Map<string, number>();
const COOLDOWN_MS = 30_000;

function withinCooldown(userId: string): boolean {
  const now = Date.now();
  if (now < (rewardCooldown.get(userId) ?? 0)) return true;
  rewardCooldown.set(userId, now + COOLDOWN_MS);
  // Opportunistic cleanup so the map can't grow unbounded on a long-lived hub.
  if (rewardCooldown.size > 5000) {
    for (const [k, expires] of rewardCooldown) {
      if (expires < now) rewardCooldown.delete(k);
    }
  }
  return false;
}

type HubPrisma = ReturnType<typeof getPrismaClient>;

async function progressQuest(prisma: HubPrisma, userId: string, type: QuestType, by: number): Promise<void> {
  for (const q of QUESTS.filter((quest) => quest.type === type)) {
    const periodKey = periodKeyFor(q.period);
    const existing = await prisma.userQuest.findUnique({
      where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } },
      select: { progress: true, completed: true },
    });
    if (existing?.completed) continue;
    const next = Math.min((existing?.progress ?? 0) + by, q.target);
    const completed = next >= q.target;
    await prisma.userQuest.upsert({
      where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } },
      create: { userId, questId: q.id, periodKey, progress: next, completed },
      update: { progress: next, completed },
    });
  }
}

export interface AppProgress {
  /** Lifetime + season XP to grant. */
  xp?: number;
  /** Quest event to advance (e.g. { type: 'game_play' }). */
  quest?: { type: QuestType; by?: number };
}

/**
 * Award XP + quest progress for completing a hub-app activity. Never throws and
 * never blocks the caller — safe to call inline from a game/room handler.
 */
export function awardAppProgress(userId: string | undefined | null, award: AppProgress): void {
  if (!userId) return;
  if (withinCooldown(userId)) return;
  void (async () => {
    try {
      const prisma = getPrismaClient();
      if (award.xp && award.xp > 0) {
        await prisma.userProfile.upsert({
          where: { userId },
          create: { userId, coins: 10, xp: award.xp },
          update: { xp: { increment: award.xp } },
        });
        await prisma.userSeasonProgress.upsert({
          where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
          create: { userId, seasonId: CURRENT_SEASON.id, seasonXp: award.xp },
          update: { seasonXp: { increment: award.xp } },
        });
      }
      if (award.quest) {
        await progressQuest(prisma, userId, award.quest.type, award.quest.by ?? 1);
      }
    } catch (err) {
      logger.warn({ event: 'app_progress_award_failed', userId, error: String(err) });
    }
  })();
}
