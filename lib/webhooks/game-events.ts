/**
 * Payloads of the two game webhook events, declared once. The emitter, the
 * console's sample events and the developer docs all read these schemas, so the
 * three cannot drift. Nothing here reads a database; a payload carries the
 * member's own data and public game metadata, and never a rank (a rank would
 * reveal other players, which leaderboard privacy exists to prevent).
 */
import { z } from 'zod';
import { games, apps } from '@/lib/catalog';
import { ACHIEVEMENT_GROUP_BY_GAME_ID } from '@/lib/games/achievement-groups';

export const PERSONAL_BEST_EVENT = 'personal_best.created';
export const ACHIEVEMENT_EVENT = 'achievement.unlocked';

/** Event names the console can send a sample of, besides `ping`. */
export const GAME_EVENT_NAMES = [PERSONAL_BEST_EVENT, ACHIEVEMENT_EVENT] as const;
export type GameEventName = (typeof GAME_EVENT_NAMES)[number];

const iso = z.string().datetime();

export const personalBestCreatedData = z
  .object({
    gameId: z.string().min(1).max(60),
    gameTitle: z.string().min(1).max(120),
    score: z.number().int(),
    previousScore: z.number().int().nullable(),
    achievedAt: iso,
  })
  .strict();

export const achievementUnlockedData = z
  .object({
    achievementId: z.string().min(1).max(120),
    name: z.string().min(1).max(160),
    gameId: z.string().min(1).max(60).nullable(),
    unlockedAt: iso,
  })
  .strict();

export type PersonalBestCreatedData = z.infer<typeof personalBestCreatedData>;
export type AchievementUnlockedData = z.infer<typeof achievementUnlockedData>;

/** The whole delivered body: the data inside the usual envelope. */
export const gameEventSchemas = {
  [PERSONAL_BEST_EVENT]: personalBestCreatedData,
  [ACHIEVEMENT_EVENT]: achievementUnlockedData,
} as const;

const TITLE_BY_ID = new Map<string, string>([
  ...games.map((g): [string, string] => [g.id, g.title]),
  ...apps.map((a): [string, string] => [a.id, a.title]),
]);

const GAME_ID_BY_GROUP = new Map(
  Object.entries(ACHIEVEMENT_GROUP_BY_GAME_ID).map(([gameId, group]) => [group, gameId]),
);

export function gameTitleOf(gameId: string): string {
  return TITLE_BY_ID.get(gameId) ?? gameId;
}

export function buildPersonalBestData(input: {
  gameId: string;
  score: number;
  previous: number | null | undefined;
  at?: Date;
}): PersonalBestCreatedData {
  return personalBestCreatedData.parse({
    gameId: input.gameId,
    gameTitle: gameTitleOf(input.gameId),
    score: input.score,
    previousScore: input.previous ?? null,
    achievedAt: (input.at ?? new Date()).toISOString(),
  });
}

export function buildAchievementData(input: {
  achievementId: string;
  name: string;
  group?: string | undefined;
  at?: Date;
}): AchievementUnlockedData {
  return achievementUnlockedData.parse({
    achievementId: input.achievementId,
    name: input.name,
    gameId: input.group ? (GAME_ID_BY_GROUP.get(input.group) ?? null) : null,
    unlockedAt: (input.at ?? new Date()).toISOString(),
  });
}

/** Sample bodies for "Send test event": the real envelope, marked `"test": true`. */
export function buildGameEventSample(event: GameEventName, now: Date = new Date()) {
  const created = now.toISOString();
  const data =
    event === PERSONAL_BEST_EVENT
      ? buildPersonalBestData({
          gameId: 'altair',
          score: 4200,
          previous: 3900,
          at: now,
        })
      : buildAchievementData({
          achievementId: 'game.altair.first_run',
          name: 'Into the Black',
          group: 'Altair',
          at: now,
        });
  return {
    event,
    created,
    test: true as const,
    data,
  };
}
