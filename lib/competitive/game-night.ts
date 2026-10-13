/** Game-night rotation (E8) — pure schedule math in UTC. Client-safe. */

export interface GameNightDef {
  id: string;
  title: string;
  /** 0 = Sunday .. 6 = Saturday, UTC. */
  weekday: number;
  /** Minutes after 00:00 UTC. */
  startMinute: number;
  durationMinutes: number;
  minutesPerGame: number;
  games: string[];
}

const MIN = 60_000;
const DAY = 86_400_000;

/** The latest start at or before `now` (may already be over). */
export function lastStart(def: Pick<GameNightDef, 'weekday' | 'startMinute'>, now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const back = (now.getUTCDay() - def.weekday + 7) % 7;
  let start = midnight - back * DAY + def.startMinute * MIN;
  if (start > now.getTime()) start -= 7 * DAY;
  return new Date(start);
}

/** A fixed past anchor on the right weekday/time, for the weekly programming-grid slot. */
export function gridAnchor(def: Pick<GameNightDef, 'weekday' | 'startMinute'>): Date {
  // 2024-01-07 was a Sunday.
  return new Date(Date.UTC(2024, 0, 7 + def.weekday) + def.startMinute * MIN);
}

export interface Rotation {
  state: 'live' | 'upcoming';
  /** Start of the live night, or of the next one. */
  startsAt: Date;
  endsAt: Date;
  nowPlaying: { gameId: string; endsAt: Date } | null;
  upNext: { gameId: string; startsAt: Date } | null;
}

export function rotation(def: GameNightDef, now: Date = new Date()): Rotation {
  const start = lastStart(def, now);
  const end = new Date(start.getTime() + def.durationMinutes * MIN);
  const live = now < end && def.games.length > 0;
  if (!live) {
    const next = new Date(start.getTime() + 7 * DAY);
    return {
      state: 'upcoming',
      startsAt: next,
      endsAt: new Date(next.getTime() + def.durationMinutes * MIN),
      nowPlaying: null,
      upNext: def.games.length ? { gameId: def.games[0], startsAt: next } : null,
    };
  }
  const slotMs = Math.max(1, def.minutesPerGame) * MIN;
  const k = Math.floor((now.getTime() - start.getTime()) / slotMs);
  const slotEnd = Math.min(start.getTime() + (k + 1) * slotMs, end.getTime());
  const nowPlaying = { gameId: def.games[k % def.games.length], endsAt: new Date(slotEnd) };
  const upNext =
    slotEnd < end.getTime()
      ? { gameId: def.games[(k + 1) % def.games.length], startsAt: new Date(slotEnd) }
      : null;
  return { state: 'live', startsAt: start, endsAt: end, nowPlaying, upNext };
}
