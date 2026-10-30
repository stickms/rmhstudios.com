/**
 * Friend activity as pure assembly: "playing now" and turning raw rows from several
 * tables into one newest-first feed. No I/O, client-safe; `activity.server.ts` does the
 * fetching. Playtime-derived entries obey the owner's playtime privacy; everything else
 * (achievements, badges, reviews, threads) is already public on their profile.
 */

import { canViewPlaytime, isPlaytimePrivacy } from '@/lib/playtime/privacy';
import type { ActivityEvent } from '@/lib/games/activity-types';
import type { PersonRef } from '@/lib/games/community-types';

/** A heartbeat this recent means the title is open and in use (beats come every 30 s). */
export const NOW_PLAYING_WINDOW_S = 90;

export function isPlayingNow(lastHeartbeatAt: Date | null, now: Date): boolean {
  if (!lastHeartbeatAt) return false;
  return (now.getTime() - lastHeartbeatAt.getTime()) / 1000 <= NOW_PLAYING_WINDOW_S;
}

type Person = PersonRef & { playtimePrivacy: string };

export type ActivityInput = {
  viewerId: string | null;
  /** Everyone whose activity is being assembled: all of them are people the viewer follows. */
  people: Map<string, Person>;
  titles: Map<string, string>;
  achievementName: (id: string) => string | null;
  achievements: { userId: string; achievementId: string; unlockedAt: Date }[];
  badges: { userId: string; gameId: string; foil: boolean; level: number; craftedAt: Date }[];
  reviews: { userId: string; gameId: string; stars: number; createdAt: Date }[];
  threads: { userId: string; gameId: string; id: string; title: string; createdAt: Date }[];
  played: { userId: string; gameId: string; day: Date; seconds: number }[];
  limit: number;
};

const ref = (p: Person): PersonRef => ({ userId: p.userId, handle: p.handle, name: p.name, image: p.image });

export function assembleActivity(input: ActivityInput): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  const { people, titles } = input;

  for (const a of input.achievements) {
    const p = people.get(a.userId);
    const name = input.achievementName(a.achievementId);
    if (!p || !name) continue;
    // An achievement belongs to a title only by its id prefix elsewhere; the feed shows it
    // against no title.
    out.push({
      id: `ach:${a.userId}:${a.achievementId}`,
      kind: 'achievement',
      at: a.unlockedAt.toISOString(),
      user: ref(p),
      gameId: '',
      gameTitle: '',
      detail: name,
    });
  }
  for (const b of input.badges) {
    const p = people.get(b.userId);
    const title = titles.get(b.gameId);
    if (!p || !title) continue;
    out.push({
      id: `badge:${b.userId}:${b.gameId}:${b.foil}`,
      kind: 'badge',
      at: b.craftedAt.toISOString(),
      user: ref(p),
      gameId: b.gameId,
      gameTitle: title,
      detail: b.level,
    });
  }
  for (const r of input.reviews) {
    const p = people.get(r.userId);
    const title = titles.get(r.gameId);
    if (!p || !title) continue;
    out.push({
      id: `review:${r.userId}:${r.gameId}`,
      kind: 'review',
      at: r.createdAt.toISOString(),
      user: ref(p),
      gameId: r.gameId,
      gameTitle: title,
      detail: r.stars,
    });
  }
  for (const th of input.threads) {
    const p = people.get(th.userId);
    const title = titles.get(th.gameId);
    if (!p || !title) continue;
    out.push({
      id: `thread:${th.id}`,
      kind: 'thread',
      at: th.createdAt.toISOString(),
      user: ref(p),
      gameId: th.gameId,
      gameTitle: title,
      detail: th.title,
      threadId: th.id,
    });
  }

  // Playtime: one entry per person and title for the window, only if the owner lets this
  // viewer see it. (These people are all followed by the viewer, so `followers` passes.)
  const sums = new Map<string, { userId: string; gameId: string; seconds: number; latest: Date }>();
  for (const d of input.played) {
    const p = people.get(d.userId);
    if (!p || !titles.has(d.gameId)) continue;
    const setting = isPlaytimePrivacy(p.playtimePrivacy) ? p.playtimePrivacy : 'private';
    if (!canViewPlaytime(setting, { viewerId: input.viewerId, ownerId: d.userId, viewerFollowsOwner: true })) continue;
    const k = `${d.userId}|${d.gameId}`;
    const cur = sums.get(k);
    if (cur) {
      cur.seconds += d.seconds;
      if (d.day > cur.latest) cur.latest = d.day;
    } else {
      sums.set(k, { userId: d.userId, gameId: d.gameId, seconds: d.seconds, latest: d.day });
    }
  }
  for (const s of sums.values()) {
    const p = people.get(s.userId) as Person;
    out.push({
      id: `played:${s.userId}:${s.gameId}`,
      kind: 'played',
      at: s.latest.toISOString(),
      user: ref(p),
      gameId: s.gameId,
      gameTitle: titles.get(s.gameId) as string,
      detail: s.seconds,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, input.limit);
}
