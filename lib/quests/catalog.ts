/**
 * Quest catalog (code-driven). Daily quests reset each UTC day; weekly quests
 * reset each ISO week. `type` matches the event names passed to progressQuest.
 */

export type QuestType =
  | 'post'
  | 'like_given'
  | 'comment'
  | 'vote'
  | 'game_play'
  | 'checkin'
  | 'bookmark'
  | 'follow';

export type QuestPeriod = 'daily' | 'weekly';

export interface QuestDef {
  id: string;
  period: QuestPeriod;
  type: QuestType;
  name: string;
  description: string;
  target: number;
  xp: number;
  coins: number;
}

export const QUESTS: QuestDef[] = [
  // ─── Daily ───
  { id: 'd.post', period: 'daily', type: 'post', name: 'Say something', description: 'Make a post', target: 1, xp: 50, coins: 10 },
  { id: 'd.like', period: 'daily', type: 'like_given', name: 'Show love', description: 'Like 3 posts', target: 3, xp: 30, coins: 5 },
  { id: 'd.comment', period: 'daily', type: 'comment', name: 'Join in', description: 'Leave 2 comments', target: 2, xp: 40, coins: 10 },
  { id: 'd.game', period: 'daily', type: 'game_play', name: 'Game on', description: 'Play a game', target: 1, xp: 40, coins: 10 },
  { id: 'd.checkin', period: 'daily', type: 'checkin', name: 'Clock in', description: 'Check in today', target: 1, xp: 20, coins: 5 },

  // ─── Weekly ───
  { id: 'w.posts', period: 'weekly', type: 'post', name: 'Prolific week', description: 'Post 10 times', target: 10, xp: 200, coins: 50 },
  { id: 'w.games', period: 'weekly', type: 'game_play', name: 'Gamer week', description: 'Play 5 games', target: 5, xp: 200, coins: 50 },
  { id: 'w.likes', period: 'weekly', type: 'like_given', name: 'Generous week', description: 'Like 25 posts', target: 25, xp: 150, coins: 30 },
];

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
export function getQuest(id: string): QuestDef | undefined {
  return BY_ID.get(id);
}

export function dailyKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week key like "2026-W25". */
export function weeklyKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function periodKeyFor(period: QuestPeriod): string {
  return period === 'daily' ? dailyKey() : weeklyKey();
}
