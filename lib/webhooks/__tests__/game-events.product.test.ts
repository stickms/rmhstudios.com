import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_EVENT,
  PERSONAL_BEST_EVENT,
  achievementUnlockedData,
  buildAchievementData,
  buildGameEventSample,
  buildPersonalBestData,
  gameEventSchemas,
  personalBestCreatedData,
} from '@/lib/webhooks/game-events';
import { WEBHOOK_EVENT_NAMES, WEBHOOK_EVENTS } from '@/lib/webhooks/events';

describe('game webhook payloads', () => {
  it('builds a personal best that parses, with a first score as null previous', () => {
    const d = buildPersonalBestData({
      gameId: 'altair',
      score: 10,
      previous: undefined,
    });
    expect(personalBestCreatedData.parse(d)).toEqual(d);
    expect(d.previousScore).toBeNull();
    expect(d.gameTitle).toBeTruthy();
  });

  it('never carries a rank and rejects one', () => {
    const d = buildPersonalBestData({
      gameId: 'altair',
      score: 10,
      previous: 5,
    });
    expect(Object.keys(d)).not.toContain('rank');
    expect(
      personalBestCreatedData.safeParse({
        ...d,
        rank: 1,
      }).success,
    ).toBe(false);
  });

  it('maps an achievement group to its game id, or null for a site-wide one', () => {
    expect(
      buildAchievementData({
        achievementId: 'a',
        name: 'A',
        group: 'Altair',
      }).gameId,
    ).toBe('altair');
    expect(
      buildAchievementData({
        achievementId: 'a',
        name: 'A',
      }).gameId,
    ).toBeNull();
    expect(
      buildAchievementData({
        achievementId: 'a',
        name: 'A',
        group: 'Casino',
      }).gameId,
    ).toBeNull();
  });

  it('samples parse with their schema and are marked as tests', () => {
    for (const event of [PERSONAL_BEST_EVENT, ACHIEVEMENT_EVENT] as const) {
      const sample = buildGameEventSample(event);
      expect(sample.test).toBe(true);
      expect(sample.event).toBe(event);
      expect(gameEventSchemas[event].safeParse(sample.data).success).toBe(true);
    }
    expect(achievementUnlockedData.safeParse(buildGameEventSample(ACHIEVEMENT_EVENT).data).success).toBe(true);
  });

  it('registers both events in the catalog under the games group', () => {
    expect(WEBHOOK_EVENT_NAMES).toContain(PERSONAL_BEST_EVENT);
    expect(WEBHOOK_EVENT_NAMES).toContain(ACHIEVEMENT_EVENT);
    const games = WEBHOOK_EVENTS.filter((e) => e.group === 'games').map((e) => e.name);
    expect(games).toEqual([PERSONAL_BEST_EVENT, ACHIEVEMENT_EVENT]);
  });
});
