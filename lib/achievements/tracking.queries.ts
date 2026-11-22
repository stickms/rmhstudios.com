/**
 * The viewer's tracked achievements as a React Query (redesign audit B4), and the
 * one write that changes them. Client-safe: contracts only.
 */
import { api } from '@/lib/contract/client';
import { contractQuery } from '@/lib/route/route-query';
import {
  getTrackedAchievementsApi,
  trackAchievementApi,
  untrackAchievementApi,
} from '@/lib/achievements/tracking.contract';

export const TRACKED_ACHIEVEMENTS_KEY = ['achievements-tracked'] as const;

export const trackedAchievementsQuery = (enabled = true) =>
  contractQuery(TRACKED_ACHIEVEMENTS_KEY, getTrackedAchievementsApi, undefined, {
    staleTime: 15_000,
    enabled,
  });

/** Track (`tracked = false`) or untrack (`tracked = true`) one achievement; resolves to the new tracked set. */
export function setAchievementTracked(id: string, tracked: boolean) {
  return tracked
    ? api(untrackAchievementApi, { params: { achievementId: id } })
    : api(trackAchievementApi, { params: { achievementId: id } });
}
